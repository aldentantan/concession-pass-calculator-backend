import fs from "fs";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { busTripDistanceService } from "../services/busTripDistanceService";
import { mrtTripDistanceService } from "../services/mrtTripDistanceService";
import type { DayGroup, Trip } from "../types";

const monthMapping: { [key: string]: string } = {
  January: "Jan",
  February: "Feb",
  March: "Mar",
  April: "Apr",
  May: "May",
  June: "Jun",
  July: "Jul",
  August: "Aug",
  September: "Sep",
  October: "Oct",
  November: "Nov",
  December: "Dec",
};

class PdfParserService {
  // Configure multer for file uploads (in-memory storage)
  upload = multer({ storage: multer.memoryStorage() });

  /**
   *
   * @param buffer The SimplyGo Transport History PDF file uploaded
   * @returns Parsed data grouped by day
   */
  async parsePdf(
    buffer: Buffer,
  ): Promise<{ month: string; year: number; dayGroups: DayGroup[] }> {
    const parser = new PDFParse({ data: buffer }); // TODO: See if parser can be declared as a class variable and reused for multiple parsing sessions
    const result = await parser.getText();
    await parser.destroy();

    const textResult = result.text;

    const { month, year } = this.parseMonthYearFromText(textResult.split("\n"));
    const dayGroups = await this.parseSimplyGoText(textResult);

    fs.writeFile("output.txt", textResult, "utf8", (err) => {
      if (err) {
        console.error("Error writing file asynchronously:", err);
        return;
      }
    });

    return {
      month,
      year,
      dayGroups,
    };
  }

  parseMonthYearFromText(lines: string[]): { month: string; year: number } {
    if (lines.length === 0) return { month: "", year: -1 };
    if (lines.length > 10) lines = lines.slice(0, 10);

    const statementMonthPattern = /^(\w+)\s+(\d{4})\s+Transit\s+Statement$/;
    let month: string = "";
    let year: number = -1;

    for (const line of lines) {
      const match = line.match(statementMonthPattern);
      if (match) {
        month = monthMapping[match[1]];
        year = parseInt(match[2]);
        break;
      }
    }
    return { month, year };
  }

  /**
   * Removes MRT line codes (e.g. DTL, NEL, CCL) from the end of station names for interchanges (Serangoon NEL-> Serangoon)
   *
   * @param stationName String of MRT station name
   * @returns String of cleaned station name, without the MRT line at the end for MRT interchanges
   */
  private cleanStationName(stationName: string): string {
    // Remove common MRT line codes at the end
    // Pattern: station name followed by space and 2-4 letter line code (e.g. "Serangoon CCL")
    return stationName
      .replace(/\s+(NEL|NSL|EWL|CCL|DTL|TEL|NSEW|BPLRT)$/i, "")
      .trim();
  }

  private async parseSimplyGoText(text: string): Promise<DayGroup[]> {
    const dayGroupsMap = new Map<string, DayGroup>();

    if (!text || text.trim().length === 0) {
      throw new Error("No text extracted from PDF");
    }

    // Obtain all non-empty lines after "Date Journey Charges" marker
    // Date Journey Charges is the table header before all the trip entries
    let lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Extract the month of the statement so that all trips extracted will belong to only this month
    const { month: statementMonth, year: statementYear } =
      this.parseMonthYearFromText(lines);

    if (!statementMonth || !statementYear) {
      console.warn(
        "Could not determine statement month and year from PDF text",
      );
    }

    const journeyHeaderPattern = /^Date.*Journey.*Charges$/i;
    const idx = lines.findIndex((line) => journeyHeaderPattern.test(line));

    if (idx === -1) {
      throw new Error(
        "No public transport journeys found. Did you upload a SimplyGo PDF?",
      );
    }

    lines = lines.slice(idx + 1);

    // Regex patterns for strings in the SimplyGo PDF
    const datePatternExp = `^(\\d{1,2}\\s+${statementMonth}\\s+\\d{4})$`;
    const datePattern = new RegExp(datePatternExp);
    const anyDatePattern = /^\d{1,2}\s+\w{3}\s+\d{4}$/; // Matches any date like "30 Sep 2025" or "01 Oct 2025"
    const dayPattern = /^\((\w{3})\)$/;
    const journeyRoutePattern = /^(.+?)\s+-\s+(.+?)$/; // Journey summary line: "START - END"
    const busTripPattern =
      /^(\d{1,2}:\d{2}\s+(?:AM|PM))\s+Bus\s+(\d+[A-Z]*)\s+(.+?)\s+-\s+(.+?)(?:\s+\$\s*([\d.]+))?$/i;
    const mrtTripPattern =
      /^(\d{1,2}:\d{2}\s+(?:AM|PM))\s+Train\s+(.+?)\s+-\s+(.+?)(?:\s+\$\s*([\d.]+))?$/i;

    let currentDate = "";
    let currentDay = "";
    let skipCurrentJourney = false; // Flag to skip journeys from other months

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is any date line (from any month)
      const anyDateMatch = line.match(anyDatePattern);
      if (anyDateMatch) {
        // Check if it's a date from the statement month
        const statementMonthDateMatch = line.match(datePattern);
        if (statementMonthDateMatch) {
          // This is an October date (or whichever month the statement is for)
          currentDate = statementMonthDateMatch[1];
          skipCurrentJourney = false;
        } else {
          // This is a date from a different month (e.g., Sep in an Oct statement)
          skipCurrentJourney = true;
        }
        continue;
      }

      // Skip all lines for journeys from other months
      if (skipCurrentJourney) {
        continue;
      }


      // New day line (e.g. (Mon), (Tue)) indicates a new journey in the PDF
      const dayMatch = line.match(dayPattern);
      if (dayMatch) {
        currentDay = dayMatch[1];

        // Initialize day group if it doesn't exist (hasn't encountered a journey from this day yet)
        if (currentDate && !dayGroupsMap.has(currentDate)) {
          dayGroupsMap.set(currentDate, {
            date: currentDate,
            day: currentDay,
            journeys: [],
            tripIssues: [],
            mrtDistance: 0,
            busDistance: 0,
            totalDistance: 0,
            totalFareExcludingBus: 0,
            totalFareExcludingMrt: 0,
            totalFare: 0,
          });
        }

        // Add an empty journey to the day group (Every day line in the PDF indicates a new journey)
        dayGroupsMap.get(currentDate)?.journeys.push({
          startLocation: "",
          endLocation: "",
          trips: [],
          tripIssues: [],
          busDistance: 0,
          mrtDistance: 0,
          fareExcludingBus: 0,
          fareExcludingMrt: 0,
          totalFare: 0,
        });
        continue;
      }

      // Skip if we don't have a current date (shouldn't happen with valid PDFs)
      if (!currentDate) {
        continue;
      }

      const currentDayGroup = dayGroupsMap.get(currentDate);
      if (!currentDayGroup) {
        continue;
      }

      // Check for journey route start location -> end location line and add to the latest journey
      // This line appears after the day line and before individual trip details
      const journeyRouteMatch = line.match(journeyRoutePattern);
      if (
        journeyRouteMatch &&
        currentDayGroup &&
        currentDayGroup.journeys.length > 0
      ) {
        const currentJourney =
          currentDayGroup.journeys[currentDayGroup.journeys.length - 1];

        // Only set if this is a route line (not a trip detail line with time)
        // Trip detail lines also have " - " but start with a time
        if (
          !line.match(/^\d{1,2}:\d{2}\s+(?:AM|PM)/i) &&
          !line.startsWith("$")
        ) {
          currentJourney.startLocation = journeyRouteMatch[1].trim();
          currentJourney.endLocation = journeyRouteMatch[2].trim();
          continue;
        }
      }

      const currJourney =
        currentDayGroup.journeys[currentDayGroup.journeys.length - 1];

      // Pattern for Bus trips: "HH:MM AM/PM Bus [NUMBER] [START] - [END] $ [FARE]"
      const busMatch = line.match(busTripPattern);
      if (busMatch) {
        const trip: Trip = {
          time: busMatch[1],
          type: "bus",
          busService: busMatch[2],
          startLocation: busMatch[3].trim(),
          endLocation: busMatch[4].trim(),
          fare: parseFloat(busMatch[5] || "0"),
          distance: 0,
        };

        currJourney.trips.push(trip);
        currJourney.totalFare += trip.fare;
        currentDayGroup.totalFare += trip.fare;

        const { distanceKm: busDistance, issues: busTripIssues } =
          await busTripDistanceService.calculateBusTripDistance(
            busMatch[2], // Bus service number
            busMatch[3].trim(), // Source bus stop name
            busMatch[4].trim(), // Destination bus stop name
          );

        // Add bus trip distance to the current day group
        if (busDistance) {
          trip.distance = busDistance;
          currJourney.busDistance += busDistance;
          currentDayGroup.busDistance += busDistance;
          currentDayGroup.totalDistance += busDistance;
        }

        // Log bus trip issues in the day group object if any
        if (busTripIssues.length > 0) {
          const tripIndexWithIssue = currJourney.trips.length - 1;
          const issuesWithTripIndex = busTripIssues.map((issue) => ({
            ...issue,
            tripIndex: tripIndexWithIssue,
          }));

          currJourney.tripIssues.push(...issuesWithTripIndex);
          currentDayGroup.tripIssues.push(...issuesWithTripIndex);
        }
      }

      // Pattern for Train/MRT trips: "HH:MM AM/PM Train [START] - [END] $ [FARE]"
      const mrtMatch = line.match(mrtTripPattern);
      if (mrtMatch) {
        const cleanedStartStation = this.cleanStationName(mrtMatch[2].trim());
        const cleanedEndStation = this.cleanStationName(mrtMatch[3].trim());

        const trip: Trip = {
          time: mrtMatch[1],
          type: "mrt",
          startLocation: cleanedStartStation,
          endLocation: cleanedEndStation,
          fare: parseFloat(mrtMatch[4] || "0"),
          distance: 0,
        };

        currJourney.trips.push(trip);
        currJourney.totalFare += trip.fare;
        currentDayGroup.totalFare += trip.fare;

        const mrtTripDistance = await mrtTripDistanceService.getDistanceKm(
          cleanedStartStation, // Start station name
          cleanedEndStation, // End station name
        );

        if (mrtTripDistance) {
          trip.distance = mrtTripDistance;
          currJourney.mrtDistance += mrtTripDistance;
          currentDayGroup.mrtDistance += mrtTripDistance;
          currentDayGroup.totalDistance += mrtTripDistance;
          // console.log(
          //   `MRT trip from ${cleanedStartStation} to ${cleanedEndStation} is ${mrtTripDistance} km`,
          // );
        }
      }
    }

    // Convert map to array and sort by date, then sort trips within each day by time
    const dayGroups = Array.from(dayGroupsMap.values());

    // Sort day groups by date (oldest first)
    dayGroups.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    // Sorts the journeys from earliest to latest within each day group
    dayGroups.forEach((dayGroup) => {
      dayGroup.journeys.reverse();
    });

    return dayGroups;
  }
}

export const pdfParserService = new PdfParserService();
