import type { DayGroup, Journey, Trip, TripIssue } from '../types';

/*
 * LTA distance-fare transfer rules, applied to parsed SimplyGo statements.
 *
 * SimplyGo sometimes lists one fare journey as two statement journeys (e.g. a bus-to-train
 * transfer three minutes apart). Consecutive statement journeys that form a legal transfer are
 * linked into one journey so the fare is computed on the combined distance. Statement journeys
 * are never split; a rule broken inside one is flagged as an INVALID_TRANSFER trip issue.
 */

const MAX_LEGS_PER_JOURNEY = 6; // A maximum of five transfers
const MAX_MINUTES_FIRST_TO_LAST_BOARDING = 120;
const MAX_TRANSFER_MINUTES_WITH_BUS = 45; // Train <-> bus, or between different bus services
const MAX_TRANSFER_MINUTES_BETWEEN_TRAINS = 15;
// Interchanges where changing lines requires tapping out and in again at the same station.
const TAP_OUT_INTERCHANGES = new Set(['bukit panjang', 'newton', 'tampines']);
const MINUTES_PER_DAY = 24 * 60;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

interface TimedTrip {
  trip: Trip;
  boardAt: number; // Minutes since 1970-01-01, statement local time
  alightAt: number;
}

interface TimedJourney {
  dayGroup: DayGroup;
  journey: Journey;
  legs: TimedTrip[] | null; // null when a date or time could not be parsed
}

/**
 * Links consecutive statement journeys that are legal transfers and flags rule violations
 * inside statement journeys. Expects day groups sorted by date and journeys earliest first.
 * A linked journey stays on the date it started, so a journey crossing midnight keeps its first date.
 */
export function linkTransferJourneys(dayGroups: DayGroup[]): DayGroup[] {
  const timedJourneys: TimedJourney[] = dayGroups.flatMap((dayGroup) => {
    const day = parseStatementDay(dayGroup.date);
    return dayGroup.journeys.map((journey) => ({
      dayGroup,
      journey,
      legs: day === null ? null : timeTrips(journey.trips, day),
    }));
  });

  const changedDayGroups = new Set<DayGroup>();
  for (const timedJourney of timedJourneys) {
    if (flagInvalidTransfers(timedJourney)) changedDayGroups.add(timedJourney.dayGroup);
  }

  const linkedJourneys = new Set<Journey>();
  let current: TimedJourney | null = null;
  for (const next of timedJourneys) {
    if (current && canLink(current, next)) {
      appendJourney(current, next);
      linkedJourneys.add(next.journey);
      changedDayGroups.add(current.dayGroup);
      changedDayGroups.add(next.dayGroup);
    } else {
      current = next;
    }
  }

  for (const dayGroup of changedDayGroups) {
    dayGroup.journeys = dayGroup.journeys.filter((journey) => !linkedJourneys.has(journey));
    recalculateDayTotals(dayGroup);
  }
  return dayGroups.filter((dayGroup) => dayGroup.journeys.length > 0 || !changedDayGroups.has(dayGroup));
}

function canLink(current: TimedJourney, next: TimedJourney): boolean {
  const currentLegs = current.legs;
  const nextLegs = next.legs;
  if (!currentLegs || !nextLegs || currentLegs.length === 0 || nextLegs.length === 0) return false;
  if (current.journey.fareSource === 'pass_usage' || next.journey.fareSource === 'pass_usage') return false;
  if (currentLegs.length + nextLegs.length > MAX_LEGS_PER_JOURNEY) return false;
  if (nextLegs[nextLegs.length - 1].boardAt - currentLegs[0].boardAt > MAX_MINUTES_FIRST_TO_LAST_BOARDING) return false;
  return transferViolation(currentLegs[currentLegs.length - 1], nextLegs[0]) === null;
}

/** Returns why boarding `next` after `previous` is not a transfer, or null if it is one. */
function transferViolation(previous: TimedTrip, next: TimedTrip): string | null {
  const gapMinutes = next.boardAt - previous.alightAt;
  if (gapMinutes < 0) return 'boarded before the previous trip ended';

  if (previous.trip.type === 'mrt' && next.trip.type === 'mrt') {
    if (gapMinutes > MAX_TRANSFER_MINUTES_BETWEEN_TRAINS) {
      return `${gapMinutes} min between train trips (limit ${MAX_TRANSFER_MINUTES_BETWEEN_TRAINS} min)`;
    }
    const station = normalizeName(previous.trip.endLocation);
    if (station === normalizeName(next.trip.startLocation) && !TAP_OUT_INTERCHANGES.has(station)) {
      return `exited and re-entered ${previous.trip.endLocation}`;
    }
    return null;
  }

  if (gapMinutes > MAX_TRANSFER_MINUTES_WITH_BUS) {
    return `${gapMinutes} min between trips (limit ${MAX_TRANSFER_MINUTES_WITH_BUS} min)`;
  }
  if (
    previous.trip.type === 'bus' &&
    next.trip.type === 'bus' &&
    isSameOrSubsidiaryBusService(previous.trip.busService, next.trip.busService)
  ) {
    return `bus ${next.trip.busService} after bus ${previous.trip.busService} is the same or a subsidiary service`;
  }
  return null;
}

/**
 * Same service, or subsidiary services sharing a number with a single uppercase letter suffix
 * (98, 98A, 98B; 225G, 225W). Express (10e) and night (2N) services are separate services.
 */
function isSameOrSubsidiaryBusService(first?: string, second?: string): boolean {
  if (!first || !second) return false;
  const a = first.trim();
  const b = second.trim();
  if (a.toUpperCase() === b.toUpperCase()) return true;

  const subsidiaryPattern = /^(\d+)([A-Z]?)$/;
  const aMatch = a.match(subsidiaryPattern);
  const bMatch = b.match(subsidiaryPattern);
  return (
    aMatch !== null &&
    bMatch !== null &&
    aMatch[1] === bMatch[1] &&
    aMatch[2] !== 'N' &&
    bMatch[2] !== 'N'
  );
}

/** Adds an INVALID_TRANSFER issue for each leg of a statement journey that breaks a rule. */
function flagInvalidTransfers({ journey, legs }: TimedJourney): boolean {
  if (!legs || legs.length < 2) return false;

  const issues: TripIssue[] = [];
  for (let index = 1; index < legs.length; index += 1) {
    const reasons: string[] = [];
    const violation = transferViolation(legs[index - 1], legs[index]);
    if (violation) reasons.push(violation);
    if (index >= MAX_LEGS_PER_JOURNEY) reasons.push(`more than ${MAX_LEGS_PER_JOURNEY - 1} transfers`);
    const minutesSinceFirstBoarding = legs[index].boardAt - legs[0].boardAt;
    if (minutesSinceFirstBoarding > MAX_MINUTES_FIRST_TO_LAST_BOARDING) {
      reasons.push(
        `boarded ${minutesSinceFirstBoarding} min after the journey's first boarding (limit ${MAX_MINUTES_FIRST_TO_LAST_BOARDING} min)`,
      );
    }
    if (reasons.length > 0) {
      issues.push({
        code: 'INVALID_TRANSFER',
        message: `Not a valid transfer: ${reasons.join('; ')}`,
        tripIndex: index,
      });
    }
  }

  journey.tripIssues.push(...issues);
  return issues.length > 0;
}

function appendJourney(current: TimedJourney, next: TimedJourney): void {
  const journey = current.journey;
  const appended = next.journey;
  const tripIndexOffset = journey.trips.length;

  journey.trips.push(...appended.trips);
  current.legs!.push(...next.legs!);
  journey.endLocation = appended.endLocation;
  journey.tripIssues.push(
    ...appended.tripIssues.map((issue) =>
      issue.tripIndex === undefined ? issue : { ...issue, tripIndex: issue.tripIndex + tripIndexOffset },
    ),
  );
  journey.statementFare =
    journey.statementFare === null || appended.statementFare === null
      ? null
      : roundCents(journey.statementFare + appended.statementFare);
  journey.totalFare = roundCents(journey.totalFare + appended.totalFare);
  journey.fareExcludingBus = roundCents(journey.fareExcludingBus + appended.fareExcludingBus);
  journey.fareExcludingMrt = roundCents(journey.fareExcludingMrt + appended.fareExcludingMrt);
  journey.mrtDistance = roundKm(journey.mrtDistance + appended.mrtDistance);
  journey.busDistance = roundKm(journey.busDistance + appended.busDistance);
}

function recalculateDayTotals(dayGroup: DayGroup): void {
  dayGroup.mrtDistance = roundKm(dayGroup.journeys.reduce((total, journey) => total + journey.mrtDistance, 0));
  dayGroup.busDistance = roundKm(dayGroup.journeys.reduce((total, journey) => total + journey.busDistance, 0));
  dayGroup.totalDistance = roundKm(dayGroup.mrtDistance + dayGroup.busDistance);
  dayGroup.totalFare = roundCents(
    dayGroup.journeys.reduce(
      (total, journey) => total + journey.trips.reduce((fare, trip) => fare + trip.fare, 0),
      0,
    ),
  );
  dayGroup.tripIssues = dayGroup.journeys.flatMap((journey) => journey.tripIssues);
}

/** Gives each trip absolute boarding and alighting times, rolling over midnight when clock times go backwards. */
function timeTrips(trips: Trip[], day: number): TimedTrip[] | null {
  const legs: TimedTrip[] = [];
  let dayStart = day * MINUTES_PER_DAY;
  for (const trip of trips) {
    const times = parseTripTimes(trip.time);
    if (!times) return null;

    let boardAt = dayStart + times.board;
    const previous = legs[legs.length - 1];
    if (previous && boardAt < previous.boardAt) {
      dayStart += MINUTES_PER_DAY;
      boardAt += MINUTES_PER_DAY;
    }
    let alightAt = dayStart + times.alight;
    if (alightAt < boardAt) alightAt += MINUTES_PER_DAY;

    legs.push({ trip, boardAt, alightAt });
  }
  return legs;
}

/** Parses "08:25 AM - 08:33 AM" into minutes after midnight. */
function parseTripTimes(time: string): { board: number; alight: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s+-\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const board = clockMinutes(match[1], match[2], match[3]);
  const alight = clockMinutes(match[4], match[5], match[6]);
  return board === null || alight === null ? null : { board, alight };
}

function clockMinutes(hourText: string, minuteText: string, meridiem: string): number | null {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return ((hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute;
}

/** Parses a statement date such as "22 Sep 2026" into days since 1970-01-01. */
function parseStatementDay(date: string): number | null {
  const match = date.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toLowerCase());
  if (month === -1) return null;
  return Date.UTC(Number(match[3]), month, Number(match[1])) / (MINUTES_PER_DAY * 60 * 1000);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function roundKm(distance: number): number {
  return Math.round(distance * 10) / 10;
}
