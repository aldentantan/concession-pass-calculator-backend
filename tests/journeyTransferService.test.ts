import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcessionFareCalculatorService } from '../src/services/concessionFareCalculatorService';
import { linkTransferJourneys } from '../src/services/journeyTransferService';
import type { DayGroup, FareTable, Journey, Trip } from '../src/types';

function bus(busService: string, time: string, startLocation = 'Stop A', endLocation = 'Stop B', fare = 1, distance = 1): Trip {
  return { time, type: 'bus', busService, startLocation, endLocation, fare, distance };
}

function train(time: string, startLocation: string, endLocation: string, fare = 1, distance = 1): Trip {
  return { time, type: 'mrt', startLocation, endLocation, fare, distance };
}

function journey(trips: Trip[], overrides: Partial<Journey> = {}): Journey {
  const distance = (type: Trip['type']) =>
    trips.filter((trip) => trip.type === type).reduce((total, trip) => total + trip.distance, 0);
  const fare = trips.reduce((total, trip) => total + trip.fare, 0);
  return {
    trips,
    startLocation: trips[0].startLocation,
    endLocation: trips[trips.length - 1].endLocation,
    tripIssues: [],
    fareSource: 'statement',
    statementFare: fare,
    mrtDistance: distance('mrt'),
    busDistance: distance('bus'),
    fareExcludingBus: 0,
    fareExcludingMrt: 0,
    totalFare: fare,
    ...overrides,
  };
}

function day(date: string, dayName: string, journeys: Journey[]): DayGroup {
  const mrtDistance = journeys.reduce((total, j) => total + j.mrtDistance, 0);
  const busDistance = journeys.reduce((total, j) => total + j.busDistance, 0);
  return {
    date,
    day: dayName,
    tripIssues: journeys.flatMap((j) => j.tripIssues),
    journeys,
    mrtDistance,
    busDistance,
    totalDistance: mrtDistance + busDistance,
    totalFareExcludingBus: 0,
    totalFareExcludingMrt: 0,
    totalFare: journeys.reduce((total, j) => total + j.totalFare, 0),
  };
}

/** Returns true when two consecutive statement journeys on the same day are linked into one. */
function links(first: Trip[], second: Trip[]): boolean {
  const [group] = linkTransferJourneys([day('09 Sep 2026', 'Wed', [journey(first), journey(second)])]);
  return group.journeys.length === 1;
}

function tripsPerJourney(groups: DayGroup[]): number[][] {
  return groups.map((group) => group.journeys.map((j) => j.trips.length));
}

test('22 Sep 2026: a bus-to-train transfer listed as two statement journeys is linked and repriced', async () => {
  const groups = linkTransferJourneys([day('22 Sep 2026', 'Tue', [
    journey([bus('113', '08:25 AM - 08:33 AM', 'Aljunied CC', 'Kovan Stn Exit B', 1.28, 1.2)]),
    journey([train('08:36 AM - 08:50 AM', 'Kovan', 'Punggol Coast', 0.54, 7.1)]),
  ])]);

  assert.equal(groups[0].journeys.length, 1);
  const linked = groups[0].journeys[0];
  assert.equal(linked.trips.length, 2);
  assert.equal(linked.startLocation, 'Aljunied CC');
  assert.equal(linked.endLocation, 'Punggol Coast');
  assert.equal(linked.statementFare, 1.82);
  assert.equal(linked.busDistance, 1.2);
  assert.equal(linked.mrtDistance, 7.1);

  const adultFares: FareTable[] = [
    { service_type: 'basic', commuter_type: 'adult', min_distance_km: 0, max_distance_km: 3.2, fare: 1.28 },
    { service_type: 'basic', commuter_type: 'adult', min_distance_km: 6.3, max_distance_km: 7.2, fare: 1.68 },
    { service_type: 'basic', commuter_type: 'adult', min_distance_km: 8.3, max_distance_km: 9.2, fare: 1.82 },
  ];
  await new ConcessionFareCalculatorService({ getFaresByCommuterType: async () => adultFares })
    .calculateFaresOnConcession(groups, 'adult');
  assert.equal(linked.totalFare, 1.82);
});

test('transfer gaps: 45 minutes involving a bus, 15 minutes between different train stations', () => {
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [train('08:55 AM - 09:05 AM', 'Kovan', 'Serangoon')]), true);
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [train('08:56 AM - 09:05 AM', 'Kovan', 'Serangoon')]), false);
  assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', 'Serangoon')], [bus('53', '08:55 AM - 09:05 AM')]), true);
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [bus('54', '08:55 AM - 09:05 AM')]), true);
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [bus('54', '08:56 AM - 09:05 AM')]), false);

  assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', 'Bras Basah')], [train('08:25 AM - 08:35 AM', 'Bencoolen', 'Bugis')]), true);
  assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', 'Bras Basah')], [train('08:26 AM - 08:35 AM', 'Bencoolen', 'Bugis')]), false);
});

test('a leg boarded before the previous leg ends is not a transfer', () => {
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [bus('54', '08:05 AM - 08:15 AM')]), false);
});

test('consecutive buses of the same or a subsidiary service are separate journeys', () => {
  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [bus('53', '08:15 AM - 08:25 AM')]), false);
  assert.equal(links([bus('98', '08:00 AM - 08:10 AM')], [bus('98A', '08:15 AM - 08:25 AM')]), false);
  assert.equal(links([bus('98A', '08:00 AM - 08:10 AM')], [bus('98B', '08:15 AM - 08:25 AM')]), false);
  assert.equal(links([bus('225G', '08:00 AM - 08:10 AM')], [bus('225W', '08:15 AM - 08:25 AM')]), false);

  assert.equal(links([bus('53', '08:00 AM - 08:10 AM')], [bus('54', '08:15 AM - 08:25 AM')]), true);
  assert.equal(links([bus('10', '08:00 AM - 08:10 AM')], [bus('10e', '08:15 AM - 08:25 AM')]), true);
  assert.equal(links([bus('2', '08:00 AM - 08:10 AM')], [bus('2N', '08:15 AM - 08:25 AM')]), true);
  assert.equal(links([bus('98', '08:00 AM - 08:10 AM')], [bus('198', '08:15 AM - 08:25 AM')]), true);
});

test('the same bus service is allowed again when a train leg is in between', () => {
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([bus('53', '08:00 AM - 08:10 AM')]),
    journey([train('08:15 AM - 08:25 AM', 'Kovan', 'Serangoon')]),
    journey([bus('53', '08:30 AM - 08:40 AM')]),
  ])]);
  assert.deepEqual(tripsPerJourney(groups), [[3]]);
});

test('exiting and re-entering the same station is a new journey except at Bukit Panjang, Newton and Tampines', () => {
  assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', 'Serangoon')], [train('08:15 AM - 08:25 AM', 'Serangoon', 'Hougang')]), false);

  for (const station of ['Tampines', 'Newton', 'Bukit Panjang']) {
    assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', station)], [train('08:20 AM - 08:30 AM', station, 'Bugis')]), true, station);
    assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', station)], [train('08:26 AM - 08:36 AM', station, 'Bugis')]), false, station);
  }

  assert.equal(links([train('08:00 AM - 08:10 AM', 'Kovan', 'Tampines')], [train('08:15 AM - 08:25 AM', 'Tampines East', 'Bugis')]), true);
});

test('every boarding must be within two hours of the first boarding', () => {
  const firstLegs = [bus('1', '08:00 AM - 08:30 AM'), bus('2', '09:00 AM - 09:30 AM')];
  assert.equal(links(firstLegs, [bus('3', '10:00 AM - 10:10 AM')]), true);
  assert.equal(links(firstLegs, [bus('3', '10:01 AM - 10:10 AM')]), false);
});

test('a journey has at most five transfers, so a seventh leg starts a new journey', () => {
  const journeys = [0, 1, 2, 3, 4, 5, 6].map((index) => {
    const minute = String(index * 5).padStart(2, '0');
    const endMinute = String(index * 5 + 3).padStart(2, '0');
    return journey([bus(String(100 + index), `08:${minute} AM - 08:${endMinute} AM`)]);
  });
  assert.deepEqual(tripsPerJourney(linkTransferJourneys([day('09 Sep 2026', 'Wed', journeys)])), [[6, 1]]);
});

test('Pass Usage journeys are never linked', () => {
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([bus('53', '08:00 AM - 08:10 AM')], { fareSource: 'pass_usage', statementFare: null }),
    journey([train('08:15 AM - 08:25 AM', 'Kovan', 'Serangoon')]),
    journey([bus('54', '08:30 AM - 08:40 AM')], { fareSource: 'pass_usage', statementFare: null }),
  ])]);
  assert.deepEqual(tripsPerJourney(groups), [[1, 1, 1]]);
});

test('a transfer across midnight links into the journey on the starting date', () => {
  const groups = linkTransferJourneys([
    day('01 Sep 2026', 'Tue', [journey([train('11:50 PM - 12:05 AM', 'Kovan', 'Punggol Coast', 1.5, 7.1)])]),
    day('02 Sep 2026', 'Wed', [
      journey([bus('3', '12:15 AM - 12:25 AM', 'Stop A', 'Stop B', 0.5, 1.2)]),
      journey([bus('3', '08:00 AM - 08:10 AM', 'Stop C', 'Stop D', 1.1, 2.5)]),
    ]),
  ]);

  assert.deepEqual(tripsPerJourney(groups), [[2], [1]]);
  assert.equal(groups[0].mrtDistance, 7.1);
  assert.equal(groups[0].busDistance, 1.2);
  assert.equal(groups[0].totalDistance, 8.3);
  assert.equal(groups[0].totalFare, 2);
  assert.equal(groups[1].busDistance, 2.5);
  assert.equal(groups[1].mrtDistance, 0);
  assert.equal(groups[1].totalDistance, 2.5);
  assert.equal(groups[1].totalFare, 1.1);
});

test('a day left with no journeys after linking across midnight is removed', () => {
  const groups = linkTransferJourneys([
    day('01 Sep 2026', 'Tue', [journey([train('11:50 PM - 12:05 AM', 'Kovan', 'Punggol Coast')])]),
    day('02 Sep 2026', 'Wed', [journey([bus('3', '12:15 AM - 12:25 AM')])]),
  ]);
  assert.deepEqual(groups.map((group) => group.date), ['01 Sep 2026']);
  assert.deepEqual(tripsPerJourney(groups), [[2]]);
});

test('a statement journey that breaks a transfer rule is flagged, not split', () => {
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([
      bus('53', '08:00 AM - 08:10 AM'),
      train('09:00 AM - 09:10 AM', 'Kovan', 'Serangoon'),
    ]),
  ])]);

  assert.deepEqual(tripsPerJourney(groups), [[2]]);
  const issues = groups[0].journeys[0].tripIssues;
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'INVALID_TRANSFER');
  assert.equal(issues[0].tripIndex, 1);
  assert.deepEqual(groups[0].tripIssues, issues);
});

test('a statement journey crossing midnight is not flagged for its transfer', () => {
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([
      train('11:50 PM - 11:58 PM', 'Kovan', 'Serangoon'),
      bus('53', '12:10 AM - 12:20 AM'),
    ]),
  ])]);
  assert.deepEqual(groups[0].journeys[0].tripIssues, []);
});

test('trip issues from a linked journey point at the trip in its new position', () => {
  const second = journey([bus('54', '08:30 AM - 08:40 AM', 'Unknown Stop', 'Stop B')]);
  second.tripIssues = [{ code: 'BUS_STOP_NOT_FOUND', message: 'not found', tripIndex: 0, busService: '54', unknownStopName: 'Unknown Stop' }];
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([bus('53', '08:00 AM - 08:10 AM'), train('08:15 AM - 08:25 AM', 'Kovan', 'Serangoon')]),
    second,
  ])]);

  assert.deepEqual(tripsPerJourney(groups), [[3]]);
  const [issue] = groups[0].journeys[0].tripIssues;
  assert.equal(issue.tripIndex, 2);
  assert.equal(groups[0].journeys[0].trips[issue.tripIndex!].startLocation, 'Unknown Stop');
  assert.deepEqual(groups[0].tripIssues, groups[0].journeys[0].tripIssues);
});

test('after linking, only the first qualifying off-peak MRT trip in the journey is free', async () => {
  const groups = linkTransferJourneys([day('09 Sep 2026', 'Wed', [
    journey([train('07:00 AM - 07:10 AM', 'Kovan', 'Hougang', 1, 3)]),
    journey([bus('53', '07:15 AM - 07:25 AM', 'Stop A', 'Stop B', 1, 2)]),
    journey([train('07:28 AM - 07:40 AM', 'Kovan', 'Serangoon', 1, 4)]),
  ])]);
  assert.deepEqual(tripsPerJourney(groups), [[3]]);

  const fares: FareTable[] = [
    { service_type: 'basic', commuter_type: 'adult', min_distance_km: 0, max_distance_km: 4.9, fare: 1 },
    { service_type: 'basic', commuter_type: 'adult', min_distance_km: 5, max_distance_km: 100, fare: 2 },
  ];
  await new ConcessionFareCalculatorService({ getFaresByCommuterType: async () => fares })
    .calculateFaresOnConcession(groups, 'adult');

  // The 3 km Kovan trip is free; the 2 km bus and 4 km second train trip are charged together (6 km).
  assert.equal(groups[0].journeys[0].totalFare, 2);
});
