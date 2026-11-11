import assert from "node:assert/strict";
import { test } from "node:test";
import { busTripDistanceService } from "../src/services/busTripDistanceService";
import { mrtTripDistanceService } from "../src/services/mrtTripDistanceService";
import { pdfParserService } from "../src/services/pdfParserService";
import type { DayGroup } from "../src/types";

// Page layout copied from SimplyGo Statement Sep 2026 2249.pdf. Every continuation page starts with
// "-- n of m --", "PAGE n OF m", "STATEMENT GENERATED ON" and the statement's print date.
const firstPageHeader = [
  "PAGE 1 OF2",
  "STATEMENT GENERATED ON",
  "10 Oct 2026",
  "Test Commuter",
  "8000 0000 0000 0000",
  "September 2026 Transit Statement",
  "01 Sep 2026 - 30 Sep 2026",
  "Date Journey Charges",
];
const pageBreak = ["-- 1 of 2 --", "PAGE 2 OF2", "STATEMENT GENERATED ON", "10 Oct 2026"];

async function parseStatementText(lines: string[]): Promise<DayGroup[]> {
  const originalBusDistance = busTripDistanceService.calculateBusTripDistance;
  const originalMrtDistance = mrtTripDistanceService.getDistanceKm;
  busTripDistanceService.calculateBusTripDistance = async () => ({ distanceKm: null, issues: [] });
  mrtTripDistanceService.getDistanceKm = async () => null;

  try {
    const parser = pdfParserService as unknown as {
      parseSimplyGoText(value: string): Promise<DayGroup[]>;
    };
    return await parser.parseSimplyGoText([...firstPageHeader, ...lines, "-- 2 of 2 --"].join("\n"));
  } finally {
    busTripDistanceService.calculateBusTripDistance = originalBusDistance;
    mrtTripDistanceService.getDistanceKm = originalMrtDistance;
  }
}

// The parser sums fares without rounding (1.68 + 0.14 === 1.8199999999999998), so compare in cents.
const cents = (amount: number | null) => (amount === null ? null : Math.round(amount * 100) / 100);

function summarize(dayGroups: DayGroup[]) {
  return dayGroups.map((dayGroup) => ({
    date: dayGroup.date,
    journeys: dayGroup.journeys.map((journey) => ({
      route: `${journey.startLocation} - ${journey.endLocation}`,
      trips: journey.trips.map((trip) => trip.time),
      statementFare: cents(journey.statementFare),
    })),
    totalFare: cents(dayGroup.totalFare),
  }));
}

test("a page break between journeys keeps every journey and trip", async () => {
  const dayGroups = await parseStatementText([
    "24 Sep 2026",
    "(Thu)",
    "Punggol Coast - Blk 105 Mkt/FC",
    "08:57 PM - 09:13 PM Train Punggol Coast - Kovan $ 1.68",
    "09:14 PM - 09:26 PM Bus 146 Kovan Stn Exit C - Blk 105 Mkt/FC $ 0.14",
    "$ 1.82",
    ...pageBreak,
    "23 Sep 2026",
    "(Wed)",
    "Bayshore - Maxwell",
    "11:03 AM - 11:30 AM Train Bayshore - Maxwell $ 2.02",
    "$ 2.02",
  ]);

  assert.deepEqual(summarize(dayGroups), [
    {
      date: "23 Sep 2026",
      journeys: [{ route: "Bayshore - Maxwell", trips: ["11:03 AM - 11:30 AM"], statementFare: 2.02 }],
      totalFare: 2.02,
    },
    {
      date: "24 Sep 2026",
      journeys: [{
        route: "Punggol Coast - Blk 105 Mkt/FC",
        trips: ["08:57 PM - 09:13 PM", "09:14 PM - 09:26 PM"],
        statementFare: 1.82,
      }],
      totalFare: 1.82,
    },
  ]);
});

test("a journey whose trips continue on the next page is not cut at the page break", async () => {
  const dayGroups = await parseStatementText([
    "24 Sep 2026",
    "(Thu)",
    "Punggol Coast - Blk 105 Mkt/FC",
    "08:57 PM - 09:13 PM Train Punggol Coast - Kovan $ 1.68",
    ...pageBreak,
    "09:14 PM - 09:26 PM Bus 146 Kovan Stn Exit C - Blk 105 Mkt/FC $ 0.14",
    "$ 1.82",
  ]);

  assert.deepEqual(summarize(dayGroups), [
    {
      date: "24 Sep 2026",
      journeys: [{
        route: "Punggol Coast - Blk 105 Mkt/FC",
        trips: ["08:57 PM - 09:13 PM", "09:14 PM - 09:26 PM"],
        statementFare: 1.82,
      }],
      totalFare: 1.82,
    },
  ]);
});
