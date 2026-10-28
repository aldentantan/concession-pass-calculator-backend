import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PDFParse } from "pdf-parse";
import { busTripDistanceService } from "../src/services/busTripDistanceService";
import { mrtTripDistanceService } from "../src/services/mrtTripDistanceService";
import { pdfParserService } from "../src/services/pdfParserService";
import type { DayGroup } from "../src/types";

const backendRoot = path.resolve(__dirname, "..");
const statementPath = path.resolve(
  backendRoot,
  "../concession-pass-calculator/docs/SimplyGo Statement Sep 2026 2249.pdf",
);

test("SimplyGo statements with start and end trip times parse all trips and fares", async () => {
  const buffer = await fs.readFile(statementPath);
  const pdfParser = new PDFParse({ data: buffer });
  const { text } = await pdfParser.getText();
  await pdfParser.destroy();

  const originalBusDistance = busTripDistanceService.calculateBusTripDistance;
  const originalMrtDistance = mrtTripDistanceService.getDistanceKm;

  busTripDistanceService.calculateBusTripDistance = async () => ({
    distanceKm: null,
    issues: [],
  });
  mrtTripDistanceService.getDistanceKm = async () => null;

  try {
    const parser = pdfParserService as unknown as {
      parseSimplyGoText(value: string): Promise<DayGroup[]>;
    };
    const dayGroups = await parser.parseSimplyGoText(text);
    const journeys = dayGroups.flatMap((dayGroup) => dayGroup.journeys);
    const trips = journeys.flatMap((journey) => journey.trips);

    assert.equal(dayGroups.length, 21);
    assert.equal(journeys.length, 45);
    assert.equal(trips.length, 74);
    assert.equal(
      Math.round(dayGroups.reduce((total, dayGroup) => total + dayGroup.totalFare, 0) * 100) / 100,
      73.23,
    );
    assert.ok(
      trips.every((trip) => /^\d{1,2}:\d{2} (?:AM|PM) - \d{1,2}:\d{2} (?:AM|PM)$/.test(trip.time)),
      "each parsed trip should retain both its start and end time",
    );
    assert.ok(trips.some((trip) => trip.time === "05:00 PM - 05:15 PM"));
  } finally {
    busTripDistanceService.calculateBusTripDistance = originalBusDistance;
    mrtTripDistanceService.getDistanceKm = originalMrtDistance;
  }
});
