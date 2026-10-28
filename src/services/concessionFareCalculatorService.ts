import type { CommuterType, DayGroup, FareTable, Trip } from '../types';
import { FareTableRepository } from '../repositories/fareTableRepository';

interface ConcessionFareResult {
        totalFareWithNewPrices: number;
        totalFareExcludingBus: number;
        totalFareExcludingMrt: number;
    }

const NORTHEAST_OFF_PEAK_STATIONS = new Set([
    'kovan',
    'buangkok',
    'hougang',
    'sengkang',
    'punggol',
    'punggol coast',
    // Sengkang LRT
    'compassvale',
    'rumbia',
    'bakau',
    'kangkar',
    'ranggung',
    'cheng lim',
    'farmway',
    'kupang',
    'thanggam',
    'fernvale',
    'layar',
    'tongkang',
    'renjong',
    // Punggol LRT
    'cove',
    'meridian',
    'coral edge',
    'riviera',
    'kadaloor',
    'oasis',
    'damai',
    'sam kee',
    'teck lee',
    'punggol point',
    'samudera',
    'nibong',
    'sumang',
    'soo teck',
]);

const WEEKDAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);

type FareTableSource = Pick<FareTableRepository, 'getFaresByCommuterType'>;

export class ConcessionFareCalculatorService {
    constructor(private fareTableRepository: FareTableSource = new FareTableRepository()) {}

    private calculateFareFromTable(distance: number, fareRows: FareTable[]): number {
        const fareRow = fareRows.find((row) =>
            distance >= Number(row.min_distance_km) &&
            distance <= Number(row.max_distance_km)
        );

        return Number(fareRow?.fare || 0);
    }

    private getTripStartMinutes(timeRange: string): number | null {
        const startTime = timeRange.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s+-/i);
        if (!startTime) return null;

        const hour = Number(startTime[1]);
        const minute = Number(startTime[2]);
        const meridiem = startTime[3].toUpperCase();
        if (hour < 1 || hour > 12 || minute > 59) return null;

        const hour24 = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
        return hour24 * 60 + minute;
    }

    private isNortheastOffPeakTrip(day: string, trip: Trip): boolean {
        if (trip.type !== 'mrt' || !WEEKDAYS.has(day.trim().slice(0, 3).toLowerCase())) {
            return false;
        }

        if (!NORTHEAST_OFF_PEAK_STATIONS.has(trip.startLocation.trim().toLowerCase())) {
            return false;
        }

        const startMinutes = this.getTripStartMinutes(trip.time);
        return startMinutes !== null && (
            startMinutes < 7 * 60 + 30 ||
            (startMinutes >= 9 * 60 && startMinutes <= 9 * 60 + 45)
        );
    }

    async calculateFaresOnConcession(dayGroups: DayGroup[], commuterType: CommuterType = 'adult'): Promise<ConcessionFareResult> {
        let totalFareExcludingBus = 0
        let totalFareExcludingMrt = 0
        let totalFareWithNewPrices = 0;
        const commuterFareTables = await this.fareTableRepository.getFaresByCommuterType(commuterType);

        for (const dayGroup of dayGroups) {
            let dayTotalFareExcludingBus = 0;
            let dayTotalFareExcludingMrt = 0;
            let dayTotalFare = 0;

            // Calculate fares for each journey in the day
            for (const journey of dayGroup.journeys) {
                let journeyMrtDistance = 0;
                let journeyBusDistance = 0;
                let freeMrtDistance = 0;
                let hasFreeMrtTrip = false;

                // Aggregate distances by type for this journey
                for (const trip of journey.trips) {
                    if (trip.type === 'mrt') {
                        journeyMrtDistance += trip.distance;
                        if (!hasFreeMrtTrip && this.isNortheastOffPeakTrip(dayGroup.day, trip)) {
                            freeMrtDistance = trip.distance;
                            hasFreeMrtTrip = true;
                        }
                    } else if (trip.type === 'bus') {
                        journeyBusDistance += trip.distance;
                    }
                }

                // Store journey-level distances
                journey.mrtDistance = journeyMrtDistance;
                journey.busDistance = journeyBusDistance;

                // Calculate journey-level fares
                // fareExcludingBus = fare if you had unlimited bus (only pay for MRT)
                const chargedMrtDistance = Math.max(0, journeyMrtDistance - freeMrtDistance);
                journey.fareExcludingBus = chargedMrtDistance > 0
                    ? this.calculateFareFromTable(chargedMrtDistance, commuterFareTables)
                    : 0;

                // fareExcludingMrt = fare if you had unlimited MRT (only pay for bus)
                journey.fareExcludingMrt = journeyBusDistance > 0
                    ? this.calculateFareFromTable(journeyBusDistance, commuterFareTables)
                    : 0;

                // Total fare for the journey (with concession pricing)
                const totalJourneyDistance = chargedMrtDistance + journeyBusDistance;
                journey.totalFare = totalJourneyDistance > 0
                    ? this.calculateFareFromTable(totalJourneyDistance, commuterFareTables)
                    : 0;

                // Accumulate day-level totals
                dayTotalFareExcludingBus += Number(journey.fareExcludingBus);
                dayTotalFareExcludingMrt += Number(journey.fareExcludingMrt);
                dayTotalFare += Number(journey.totalFare);
            }

            // Store day-level totals
            dayGroup.totalFareExcludingBus = dayTotalFareExcludingBus;
            dayGroup.totalFareExcludingMrt = dayTotalFareExcludingMrt;
            // Note: dayGroup.totalFare is already set by parser from actual fares

            // Accumulate overall totals
            totalFareExcludingBus += dayTotalFareExcludingBus;
            totalFareExcludingMrt += dayTotalFareExcludingMrt;
            totalFareWithNewPrices += dayTotalFare;
        }

        return {
            totalFareWithNewPrices,
            totalFareExcludingBus,
            totalFareExcludingMrt
        }
    }
}

export const concessionFareCalcService = new ConcessionFareCalculatorService();
