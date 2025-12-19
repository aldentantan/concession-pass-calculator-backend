import { statementsRepository } from "../repositories/statementsRepository";

class StatementsService {
    async getAllStatementsByUserId(userId: string) {
        if (!userId) {
            throw new Error('Missing userId to retrieve statements');
        }
        return await statementsRepository.getStatementsByUserId(userId);
    }

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

    async deleteStatement(id: string) {
        return await statementsRepository.deleteStatement(id);
    }
}

export const statementsService = new StatementsService();