import sql from "../db";
import type { Journey } from "../types";

export class StatementsRepository {
  async getStatementsByUserId(userId: string) {
    return await sql<
      {
        id: string;
        user_id: string;
        file_name: string;
        file_path: string;
        file_hash: string;
        journeys_json: string;
        journey_count: number;
        total_fare: number;
        statement_month: string;
        created_at: string;
      }[]
    >`SELECT * FROM statements WHERE user_id = ${userId} ORDER BY created_at DESC`;
  }

  async insertStatement(values: Record<string, any>) {
    return await sql<{ cols: string; values: string }[]>`INSERT INTO statements
    (user_id, file_name, file_path, file_hash, statement_month, statement_year, journeys_json, journey_count, total_fare)
    VALUES (${values.userId}, ${values.fileName}, ${values.filePath}, ${values.fileHash}, ${values.statementMonth}, ${values.statementYear}, ${values.journeys}, ${values.journeyCount}, ${values.totalFare}) RETURNING *`;
  }

  async updateStatement(id: string, updates: string) {
    return await sql<
      { id: string; updates: string }[]
    >`UPDATE statements SET ${updates} WHERE id = ${id} RETURNING *`;
  }

  async deleteStatement(id: string) {
    return await sql`DELETE FROM statements WHERE id = ${id}`;
  }

  async getJourneysByStatementId(statementId: string): Promise<Journey[]> {
    const journeysRow = await sql<
      { journeys_json: string }[]
    >`SELECT journeys_json FROM statements WHERE id = ${statementId}`;

    const jsonParsedJourneys = JSON.parse(journeysRow[0].journeys_json);
    if (journeysRow.length === 0) {
      throw new Error("No journeys found for the given statement ID");
    }

    return jsonParsedJourneys;
  }

  async getStatementFilePathById(statementId: string): Promise<string> {
    const result = await sql<
      { file_path: string }[]
    >`SELECT file_path FROM statements WHERE id = ${statementId}`;
    if (result.length === 0) {
      throw new Error("Statement not found");
    }
    return result[0].file_path;
  }
}

export const statementsRepository = new StatementsRepository();
