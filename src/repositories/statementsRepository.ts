import sql from "../db";

export class StatementsRepository {
  async insertStatement(values: Record<string, any>) {
    return await sql<
      { cols: string; values: string }[]
    >`INSERT INTO statements
    (user_id, filename, filepath, journeys_json, journey_count, total_fare, statement_month)
    VALUES (${values.userId}, ${values.fileName}, ${values.filePath}, ${values.journeys}, ${values.journeyCount}, ${values.totalFare}, 'SEP') RETURNING *`;
  }

  async updateStatement(id: string, updates: string) {
    return await sql<
      { id: string; updates: string }[]
    >`UPDATE statements SET ${updates} WHERE id = ${id} RETURNING *`;
  }
}

export const statementsRepository = new StatementsRepository();