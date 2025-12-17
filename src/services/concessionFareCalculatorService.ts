import type { Journey } from '../types';
import { FareTableRepository } from '../repositories/fareTableRepository';

class ConcessionFareCalculatorService {
    private fareTableRepository = new FareTableRepository();

    async calculateFaresOnConcession(journeys: Journey[]): Promise<any> {
        let totalFareExcludingBus = 0
        let totalFareExcludingMrt = 0
        let totalFare = 0;

        for (const journey of journeys) {
            let journeyDistanceExcludingBus = 0
            let journeyDistanceExcludingMrt = 0
            let totalJourneyDistance = 0;
            let journeyFareExcludingBus = 0, journeyFareExcludingMrt = 0;
            for (const trip of journey.trips) {
                if (trip.type === 'bus') {
                    journeyDistanceExcludingMrt += trip.distance;
                }
                else if (trip.type === 'mrt') {
                    journeyDistanceExcludingBus += trip.distance;
                }
                totalJourneyDistance += trip.distance;
            }
            if (journeyDistanceExcludingBus !== 0) {
                journeyFareExcludingBus = await this.fareTableRepository.calculateFareByDistance(journeyDistanceExcludingBus);
            }
            if (journeyDistanceExcludingMrt !== 0) {
                journeyFareExcludingMrt = await this.fareTableRepository.calculateFareByDistance(journeyDistanceExcludingMrt);
            }
            const totalJourneyFare = await this.fareTableRepository.calculateFareByDistance(totalJourneyDistance);
            totalFareExcludingBus += Number(journeyFareExcludingBus);
            totalFareExcludingMrt += Number(journeyFareExcludingMrt);
            totalFare += Number(totalJourneyFare);
        }

        return {
            totalFare,
            totalFareExcludingBus,
            totalFareExcludingMrt
        }
    }
}

export const concessionFareCalcService = new ConcessionFareCalculatorService();