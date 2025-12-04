import type { Journey } from '../types'
import { concessionFareCalculatorService } from '../services/concessionFareCalculatorService';

export class ConcessionFareCalculatorController {
    private concessionFareCalcService = new concessionFareCalculatorService();

    async calculateConcessionFares(journeys: Journey[]): Promise<any> {
        try {
            if (!journeys || journeys.length === 0) {
                throw new Error('No journeys provided for fare calculation.');
            }

            const concessionFares = await this.concessionFareCalcService.calculateFaresOnConcession(journeys);
            return concessionFares;
        } catch (err) {
            throw new Error(`Error calculating concession fares: ${err}`);
        }
    }
}