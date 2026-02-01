import type { DayGroup, Journey } from '../types';
import { FareTableRepository } from '../repositories/fareTableRepository';
interface ConcessionFareResult {
        totalFareWithNewPrices: number;
        totalFareExcludingBus: number;
        totalFareExcludingMrt: number;
    }

class ConcessionFareCalculatorService {
    private fareTableRepository = new FareTableRepository();

    async calculateFaresOnConcession(dayGroups: DayGroup[]): Promise<ConcessionFareResult> {
        let totalFareExcludingBus = 0
        let totalFareExcludingMrt = 0
        let totalFareWithNewPrices = 0;

        for (const dayGroup of dayGroups) {
            let dayTotalFareExcludingBus = 0;
            let dayTotalFareExcludingMrt = 0;
            let dayTotalFare = 0;

            // Calculate fares for each journey in the day
            for (const journey of dayGroup.journeys) {
                let journeyMrtDistance = 0;
                let journeyBusDistance = 0;

                // Aggregate distances by type for this journey
                for (const trip of journey.trips) {
                    if (trip.type === 'mrt') {
                        journeyMrtDistance += trip.distance;
                    } else if (trip.type === 'bus') {
                        journeyBusDistance += trip.distance;
                    }
                }

                // Store journey-level distances
                journey.mrtDistance = journeyMrtDistance;
                journey.busDistance = journeyBusDistance;

                // Calculate journey-level fares
                // fareExcludingBus = fare if you had unlimited bus (only pay for MRT)
                journey.fareExcludingBus = journeyMrtDistance > 0
                    ? Number(await this.fareTableRepository.calculateFareByDistance(journeyMrtDistance))
                    : 0;

                // fareExcludingMrt = fare if you had unlimited MRT (only pay for bus)
                journey.fareExcludingMrt = journeyBusDistance > 0
                    ? Number(await this.fareTableRepository.calculateFareByDistance(journeyBusDistance))
                    : 0;

                // Total fare for the journey (with concession pricing)
                const totalJourneyDistance = journeyMrtDistance + journeyBusDistance;
                journey.totalFare = totalJourneyDistance > 0
                    ? Number(await this.fareTableRepository.calculateFareByDistance(totalJourneyDistance))
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