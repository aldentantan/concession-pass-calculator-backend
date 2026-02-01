import sql from "../db";
import type { DayGroup, Trip } from "../types";
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

  async getDayGroupsByStatementId(statementId: string): Promise<DayGroup[]> {
    const dayGroupsRow = await sql<
      { journeys_json: string }[]
    >`SELECT journeys_json FROM statements WHERE id = ${statementId}`;

    const jsonParsedDayGroups = JSON.parse(dayGroupsRow[0].journeys_json);
    if (dayGroupsRow.length === 0) {
      throw new Error("No day groups found for the given statement ID");
    }

    return jsonParsedDayGroups;
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
   * Get all day groups for a user within a specified date range (inclusive)
   * Queries across all statements for the user and filters day groups by date
   * Deduplicates trips that may appear in multiple overlapping statements
   * @param userId - The user ID
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @returns Array of day groups with trips already sorted by time
   */
  async getDayGroupsByUserIdAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<DayGroup[]> {
    // Get all statements for the user
    const statements = await sql<
      {
        id: string;
        journeys_json: string;
        statement_month: string;
      }[]
    >`SELECT id, journeys_json, statement_month FROM statements WHERE user_id = ${userId}`;

    console.log(`📊 Found ${statements.length} statements for user ${userId}`);
    console.log(`📅 Searching for day groups between ${startDate} and ${endDate}`);

    // Use a Map to track unique day groups and prevent duplicates
    const uniqueDayGroupsMap = new Map<string, DayGroup>();

    // Parse each statement's day groups and filter by date range
    for (const statement of statements) {
      const dayGroups: DayGroup[] = JSON.parse(statement.journeys_json);
      console.log(`📄 Statement ${statement.id}: ${dayGroups.length} day groups, month: ${statement.statement_month}`);

      for (const dayGroup of dayGroups) {
        // Parse day group date from "DD MMM YYYY" format to YYYY-MM-DD for comparison
        const dayDateFormatted = this.parseJourneyDate(dayGroup.date);

        // Check if day group date is within range (inclusive)
        if (dayDateFormatted >= startDate && dayDateFormatted <= endDate) {
          console.log(`✅ Day ${dayGroup.date} (${dayDateFormatted}) is in range`);

          // If this day already exists, merge trips (handling month boundaries)
          if (uniqueDayGroupsMap.has(dayGroup.date)) {
            const existingDayGroup = uniqueDayGroupsMap.get(dayGroup.date)!;

            // Add trips that don't already exist (based on trip characteristics)
            const dayGroupTrips = dayGroup.journeys.flatMap((journey) => journey.trips);
            for (const trip of dayGroupTrips) {
              const tripExists = existingDayGroup.journeys[existingDayGroup.journeys.length - 1].trips.some(
                t => t.time === trip.time &&
                     t.type === trip.type &&
                     t.startLocation === trip.startLocation &&
                     t.endLocation === trip.endLocation &&
                     t.fare === trip.fare &&
                     t.busService === trip.busService
              );

              if (!tripExists) {
                existingDayGroup.journeys[existingDayGroup.journeys.length - 1].trips.push(trip);
                existingDayGroup.totalFare += trip.fare;
                existingDayGroup.totalDistance += trip.distance;
                if (trip.type === 'bus') {
                  existingDayGroup.busDistance += trip.distance;
                } else {
                  existingDayGroup.mrtDistance += trip.distance;
                }
              }
            }

            // Merge trip issues
            existingDayGroup.tripIssues.push(...dayGroup.tripIssues);
          } else {
            // Add new day group (create a copy to avoid reference issues)
            uniqueDayGroupsMap.set(dayGroup.date, {
              ...dayGroup,
              journeys: [...dayGroup.journeys],
              tripIssues: [...dayGroup.tripIssues]
            });
          }
        } else {
          console.log(`❌ Day ${dayGroup.date} (${dayDateFormatted}) is NOT in range (${startDate} to ${endDate})`);
        }
      }
    }

    // Convert Map values to array and sort by date
    const dayGroupsInRange = Array.from(uniqueDayGroupsMap.values());
    dayGroupsInRange.sort((a, b) => {
      const dateA = new Date(this.parseJourneyDate(a.date));
      const dateB = new Date(this.parseJourneyDate(b.date));
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`🎯 Total unique day groups found in range: ${dayGroupsInRange.length}`);

    return dayGroupsInRange;
  }

  /**
   * @deprecated Use getDayGroupsByUserIdAndDateRange instead
   * Get all trips/journeys for a user within a specified date range (inclusive)
   */
  async getJourneysByUserIdAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Trip[]> {
    const dayGroups = await this.getDayGroupsByUserIdAndDateRange(userId, startDate, endDate);

    // Flatten day groups to individual trips for backward compatibility
    const trips: Trip[] = [];
    for (const dayGroup of dayGroups) {
      const dayGroupTrips = dayGroup.journeys.flatMap((journey) => journey.trips);
      for (const trip of dayGroupTrips) {
        trips.push({
          time: trip.time,
          type: trip.type,
          busService: trip.busService,
          startLocation: trip.startLocation,
          endLocation: trip.endLocation,
          fare: trip.fare,
          distance: trip.distance,
        });
      }
    }

    return trips;
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

    // Collect all day groups within the date range
    const dayGroupsInRange: DayGroup[] = [];

    for (const statement of statements) {
      const dayGroups: DayGroup[] = JSON.parse(statement.journeys_json);

      for (const dayGroup of dayGroups) {
        // Parse day group date from "DD MMM YYYY" format to YYYY-MM-DD for comparison
        const dayDateFormatted = this.parseJourneyDate(dayGroup.date);

        if (dayDateFormatted >= startDate && dayDateFormatted <= endDate) {
          dayGroupsInRange.push(dayGroup);
        }
      }
    }

    // Use existing concessionFareCalcService to calculate fares
    const fares = await concessionFareCalcService.calculateFaresOnConcession(dayGroupsInRange);

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
