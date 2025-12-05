import multer from "multer";
import { PDFParse } from "pdf-parse";
import fs from "fs";
import type { Journey } from "../types";
import { busTripDistanceService } from "../services/busTripDistanceService";
import { mrtTripDistanceService } from "../services/mrtTripDistanceService";;

class PdfParserService {
  // Configure multer for file uploads (in-memory storage)
  upload = multer({ storage: multer.memoryStorage() });

  /**
   *
   * @param buffer The SimplyGo Transport History PDF file uploaded
   * @returns String output of the parsing
   */
  async parsePdf(buffer: Buffer): Promise<Journey[]> {
    const parser = new PDFParse({ data: buffer }); // TODO: See if parser can be declared as a class variable and reused for multiple parsing sessions
    const result = await parser.getText();
    await parser.destroy();

    const textResult = result.text;

    const journeys = this.parseSimplyGoText(textResult);

    fs.writeFile("output.txt", textResult, "utf8", (err) => {
      if (err) {
        console.error("Error writing file asynchronously:", err);
        return;
      }
      console.log(
        "SimplyGo PDF successfully written to output.txt (asynchronously)."
      );
    });

    return journeys;
  }

  /**
   * Removes MRT line codes (e.g. DTL, NEL, CCL) from the end of station names for interchanges (Serangoon NEL-> Serangoon)
   *
   * @param stationName String of MRT station name
   * @returns String of cleaned station name, without the MRT line at the end for MRT interchanges
   */
  private cleanStationName(stationName: string): string {
    // Remove common MRT line codes at the end
    // Pattern: station name followed by space and 2-4 letter line code
    return stationName
      .replace(/\s+(NEL|NSL|EWL|CCL|DTL|TEL|NSEW)$/i, "")
      .trim();
  }

  private async parseSimplyGoText(text: string): Promise<Journey[]> {
    const journeys: Journey[] = [];

    if (!text || text.trim().length === 0) {
      console.warn("No text extracted from PDF");
    }

    // Obtain all non-empty lines after "Date Journey Charges" marker
    // Date Journey Charges is the table header before all the trip entries
    let lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    console.log("Processing", lines.length, "lines from PDF");

    const marker = "Date Journey Charges";
    const idx = lines.indexOf(marker);
    lines = idx === -1 ? lines : lines.slice(idx + 1);

    // Regex patterns for strings in the SimplyGo PDF
    const datePattern = /^(\d{1,2}\s+\w{3}\s+\d{4})$/;
    const dayPattern = /^\((\w{3})\)$/;
    const farePattern = /^\$\s*([\d.]+)$/;
    const busTripPattern =
      /^(\d{1,2}:\d{2}\s+(?:AM|PM))\s+Bus\s+(\d+[A-Z]*)\s+(.+?)\s+-\s+(.+?)\s+\$\s*([\d.]+)$/i;
    // const mrtTripPattern =
    //   /^(\d{1,2}:\d{2}\s+(?:AM|PM))\s+Train\s+(.+?)\s+-\s+(.+?)\s+\$\s*([\d.]+)$/i;
    const mrtTripPattern =
      /^(\d{1,2}:\d{2}\s+(?:AM|PM))\s+Train\s+(.+?)\s+-\s+(.+?)(?:\s+\$\s*([\d.]+))?$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dayMatch = line.match(dayPattern);

      // Use the (DAY) line to identify the start of a journey block and not DATE because there are other dates in the PDF
      // Pushes a new journey to journeys array when (DAY) line is found
      if (dayMatch) {
        // Found the start of a journey block
        const dateLine = lines[i - 1];
        const dateMatch = dateLine.match(datePattern);
        const date = dateMatch ? dateMatch[1] : "";

        // Get start and end locations of the journey
        const journeyLine = lines[i + 1];
        const journeyParts = journeyLine.split(" - ");
        const startLocation = journeyParts[0] || "";
        const endLocation = journeyParts[1] || "";

        const journey: Journey = {
          date: date,
          day: dayMatch[1],
          startLocation: startLocation.trim(),
          endLocation: endLocation.trim(),
          trips: [],
          mrtDistance: 0,
          busDistance: 0,
          totalDistance: 0,
          totalFare: 0,
        };
        journeys.push(journey);
        i += 1; // Advance index to skip the line containing start / end locations
      }

      // Pattern for Bus trips: "HH:MM AM/PM Bus [NUMBER] [START] - [END] $ [FARE]"
      const busMatch = line.match(busTripPattern);
      if (busMatch) {
        const currentJourney = journeys[journeys.length - 1];
        if (currentJourney) {
          currentJourney.trips.push({
            time: busMatch[1],
            type: "bus",
            busService: busMatch[2],
            startLocation: busMatch[3].trim(),
            endLocation: busMatch[4].trim(),
            fare: parseFloat(busMatch[5]),
            distance: 0,
          });

          const busTripDistance =
            await busTripDistanceService.calculateBusTripDistance(
              busMatch[2], // Bus service number
              busMatch[3].trim(), // Source bus stop name
              busMatch[4].trim() // Destination bus stop name
            );
          currentJourney.trips[currentJourney.trips.length - 1].distance =
            busTripDistance;
          currentJourney.busDistance += busTripDistance || 0;
          currentJourney.totalDistance += busTripDistance || 0;
        }
      }

      // Pattern for Train/MRT trips: "HH:MM AM/PM Train [START] - [END] $ [FARE]"
      const mrtMatch = line.match(mrtTripPattern);
      if (mrtMatch) {
        const currentJourney = journeys[journeys.length - 1];
        if (currentJourney) {
          const cleanedStartStation = this.cleanStationName(mrtMatch[2].trim());
          const cleanedEndStation = this.cleanStationName(mrtMatch[3].trim());

          currentJourney.trips.push({
            time: mrtMatch[1],
            type: "mrt",
            startLocation: cleanedStartStation,
            endLocation: cleanedEndStation,
            fare: parseFloat(mrtMatch[4] || "0"),
            distance: 0, // Distance parsing not implemented yet
          });

          const mrtTripDistance = await mrtTripDistanceService.getDistanceKm(
            cleanedStartStation, // Start station name
            cleanedEndStation // End station name
          );
          currentJourney.trips[currentJourney.trips.length - 1].distance =
            mrtTripDistance || 0;
          currentJourney.mrtDistance += mrtTripDistance || 0;
          currentJourney.totalDistance += mrtTripDistance || 0;
          console.log(
            `MRT trip from ${cleanedStartStation} to ${cleanedEndStation} is ${mrtTripDistance} km`
          );
        }
      }

      // Check for the journey fare to match the summation of the trip fares
      const fareMatch = line.match(farePattern);
      if (fareMatch) {
        const fareValue = parseFloat(fareMatch[1]);
        const currentJourney = journeys[journeys.length - 1];
        if (currentJourney) {
          currentJourney.totalFare = fareValue;
        }
      }
    }
    return journeys;
  }
}

export const pdfParserService = new PdfParserService();