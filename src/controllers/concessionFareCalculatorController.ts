import type { Journey } from '../types'
import { concessionFareCalcService } from '../services/concessionFareCalculatorService';

export class ConcessionFareCalculatorController {
    async calculateConcessionFares(journeys: Journey[]): Promise<any> {
        try {
            if (!journeys || journeys.length === 0) {
                throw new Error('No journeys provided for fare calculation.');
            }

            const concessionFares = await concessionFareCalcService.calculateFaresOnConcession(journeys);
            return concessionFares;
        } catch (err) {
            throw new Error(`Error calculating concession fares: ${err}`);
        }
    }
}