import sql from "../db";

export class StatementsRepository {
  async getStatementsByUserId(userId: string) {
    return await sql<
      { id: string; user_id: string; filename: string; filepath: string; journeys_json: string; journey_count: number; total_fare: number; statement_month: string; created_at: string }[]
    >`SELECT * FROM statements WHERE user_id = ${userId} ORDER BY created_at DESC`;
  }

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

  async deleteStatement(id: string) {
    console.log("ID:" , id)
    return await sql`DELETE FROM statements WHERE id = ${id}`;
  }
}

export const statementsRepository = new StatementsRepository();