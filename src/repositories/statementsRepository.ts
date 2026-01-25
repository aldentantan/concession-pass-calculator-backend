import sql from "../db";
import type { Journey, TripWithMetadata } from "../types";
import { concessionFareCalcService } from "../services/concessionFareCalculatorService";

export class StatementsRepository {
  /**
   * Parse journey date from "DD MMM YYYY" to "YYYY-MM-DD" without timezone issues
   * Example: "01 Oct 2025" -> "2025-10-01"
   */
  private parseJourneyDate(dateStr: string): string {
    const monthMap: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    // Parse "DD MMM YYYY" format
    const parts = dateStr.split(' ');
    if (parts.length !== 3) return dateStr; // fallback

    const day = parts[0].padStart(2, '0');
    const month = monthMap[parts[1]];
    const year = parts[2];

    return `${year}-${month}-${day}`;
  }

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

  /**
   * Get all trips/journeys for a user within a specified date range (inclusive)
   * Queries across all statements for the user and filters journeys by date
   * Deduplicates trips that may appear in multiple overlapping statements
   * @param userId - The user ID
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @returns Array of unique trips with metadata including statement_id
   */
  async getJourneysByUserIdAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TripWithMetadata[]> {
    // Get all statements for the user
    const statements = await sql<
      {
        id: string;
        journeys_json: string;
        statement_month: string;
      }[]
    >`SELECT id, journeys_json, statement_month FROM statements WHERE user_id = ${userId}`;

    console.log(`📊 Found ${statements.length} statements for user ${userId}`);
    console.log(`📅 Searching for trips between ${startDate} and ${endDate}`);

    // Use a Map to track unique trips and prevent duplicates
    const uniqueTripsMap = new Map<string, TripWithMetadata>();

    // Parse each statement's journeys and filter by date range
    for (const statement of statements) {
      const journeys: Journey[] = JSON.parse(statement.journeys_json);
      console.log(`📄 Statement ${statement.id}: ${journeys.length} journeys, month: ${statement.statement_month}`);

      for (const journey of journeys) {
        // Parse journey date from "DD MMM YYYY" format to YYYY-MM-DD for comparison
        // Example: "01 Oct 2025" -> "2025-10-01"
        const journeyDateFormatted = this.parseJourneyDate(journey.date);

        // Check if journey date is within range (inclusive)
        if (journeyDateFormatted >= startDate && journeyDateFormatted <= endDate) {
          console.log(`✅ Journey ${journey.date} (${journeyDateFormatted}) is in range`);
          // Extract each trip from the journey and add metadata
          for (const trip of journey.trips) {
            // Create a unique key for deduplication based on trip characteristics
            // This handles trips that appear in multiple statements (e.g., month boundaries)
            const tripKey = `${journey.date}|${trip.time}|${trip.type}|${trip.startLocation}|${trip.endLocation}|${trip.fare}|${trip.busService || ''}`;

            // Only add if we haven't seen this exact trip before
            if (!uniqueTripsMap.has(tripKey)) {
              uniqueTripsMap.set(tripKey, {
                date: journey.date,
                time: trip.time,
                mode: trip.type,
                busService: trip.busService,
                startLocation: trip.startLocation,
                endLocation: trip.endLocation,
                fare: trip.fare,
                distance: trip.distance,
                statement_id: statement.id,
                statement_month: statement.statement_month,
              });
            }
          }
        } else {
          console.log(`❌ Journey ${journey.date} (${journeyDateFormatted}) is NOT in range (${startDate} to ${endDate})`);
        }
      }
    }

    // Convert Map values to array
    const tripsInRange = Array.from(uniqueTripsMap.values());

    console.log(`🎯 Total unique trips found in range: ${tripsInRange.length}`);

    // Sort by date and time
    tripsInRange.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    return tripsInRange;
  }

  async getConcessionFaresByUserIdAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<{ totalFareExcludingBus: number; totalFareExcludingMrt: number }> {
    // Get all statements for the user
    const statements = await sql<
      {
        id: string;
        journeys_json: string;
      }[]
    >`SELECT id, journeys_json FROM statements WHERE user_id = ${userId}`;

    // Collect all journeys within the date range
    const journeysInRange: Journey[] = [];

    for (const statement of statements) {
      const journeys: Journey[] = JSON.parse(statement.journeys_json);

      for (const journey of journeys) {
        // Parse journey date from "DD MMM YYYY" format to YYYY-MM-DD for comparison
        const journeyDateFormatted = this.parseJourneyDate(journey.date);

        if (journeyDateFormatted >= startDate && journeyDateFormatted <= endDate) {
          journeysInRange.push(journey);
        }
      }
    }

    // Use existing concessionFareCalcService to calculate fares
    const fares = await concessionFareCalcService.calculateFaresOnConcession(journeysInRange);

    return {
      totalFareExcludingBus: Math.round(fares.totalFareExcludingBus * 100) / 100,
      totalFareExcludingMrt: Math.round(fares.totalFareExcludingMrt * 100) / 100,
    };
  }

  private async calculateFareByDistance(distance: number): Promise<number> {
    const fareRow = await sql<{ fare: number }[]>`
      SELECT fare
      FROM fare_table
      WHERE ${distance} BETWEEN min_distance_km AND max_distance_km
      ORDER BY fare ASC
      LIMIT 1
    `;
    return fareRow.length > 0 ? fareRow[0].fare : 0;
  }
}

export const statementsRepository = new StatementsRepository();
