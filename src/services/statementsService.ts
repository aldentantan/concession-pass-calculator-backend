import { statementsRepository } from "../repositories/statementsRepository";
import type { Journey } from "../types";

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
        if (!values.userId || !values.filePath || !values.fileName || !values.fileHash) {
            throw new Error('Missing required fields: userId, filePath, fileName, or fileHash');
        }
        if (!values.journeyCount || !values.totalFare) {
            throw new Error('Missing required numeric fields: journeyCount, totalFare');
        }
        try {
            return await statementsRepository.insertStatement(values);
        } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async updateStatement(id: string, updates: string) {
        return await statementsRepository.updateStatement(id, updates);
    }

    async deleteStatement(id: string) {
        return await statementsRepository.deleteStatement(id);
    }

    async getJourneysByStatementId(statementId: string): Promise<Journey[]> {
        return await statementsRepository.getJourneysByStatementId(statementId);
    }
}

export const statementsService = new StatementsService();