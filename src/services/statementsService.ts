import { statementsRepository } from "../repositories/statementsRepository";

class StatementsService {
    async createStatement(values: Record<string, any>) {
        if (!values) {
            throw new Error('Missing values to insert into the statements table');
        }
        if (!values.userId || !values.filePath || !values.fileName) {
            throw new Error('Missing required fields: userId, filePath, or fileName');
        }
        if (!values.journeyCount || !values.totalFare) {
            throw new Error('Missing required numeric fields: journeyCount, totalFare');
        }
        return await statementsRepository.insertStatement(values);
    }

    async updateStatement(id: string, updates: string) {
        return await statementsRepository.updateStatement(id, updates);
    }
}

export const statementsService = new StatementsService();