import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { closeTripDistanceCache } from "../src/cache/tripDistCache";
import sql from "../src/db";
import { concessionFareCalcService } from "../src/services/concessionFareCalculatorService";
import { pdfParserService } from "../src/services/pdfParserService";
import type { CommuterType, DayGroup, Journey, TripIssue } from "../src/types";

type ParsedJourneySnapshot = {
  date: string;
  day: string;
  journeyIndex: number;
  startLocation: string;
  endLocation: string;
  fareSource: Journey["fareSource"];
  parsedFare: number;
};

type FareMismatch = {
  pdfName: string;
  date: string;
  day: string;
  journeyIndex: number;
  startLocation: string;
  endLocation: string;
  parsedFare: number;
  computedFare: number;
  delta: number;
  busDistance: number;
  mrtDistance: number;
  totalDistance: number;
  trips: Array<{
    time: string;
    type: "mrt" | "bus";
    busService?: string;
    startLocation: string;
    endLocation: string;
    parsedFare: number;
    distance: number;
  }>;
  tripIssues: TripIssue[];
};

type PdfSummary = {
  pdfName: string;
  daysParsed: number;
  journeysChecked: number;
  mismatches: number;
};

type FareDiscrepancyReport = {
  generatedAt: string;
  commuterType: CommuterType;
  toleranceCents: number;
  pdfsScanned: number;
  journeysChecked: number;
  mismatchCount: number;
  pdfSummaries: PdfSummary[];
  mismatches: FareMismatch[];
};

const backendRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.resolve(backendRoot, "..");
const outputDir = path.join(backendRoot, "output");
const reportPath = path.join(outputDir, "fare-discrepancies.json");
const commuterType = normalizeCommuterType(process.env.FARE_TEST_COMMUTER_TYPE);
const toleranceCents = normalizeToleranceCents(process.env.FARE_TEST_TOLERANCE_CENTS);

after(async () => {
  await closeTripDistanceCache();
  await sql.end({ timeout: 5 });
});

test("computed journey fares match parsed PDF journey fares", async () => {
  const pdfPaths = await findSimplyGoPdfFixtures();
  assert.ok(
    pdfPaths.length > 0,
    `No SimplyGo Statement*.pdf fixtures found in ${fixtureRoot}`,
  );

  const report: FareDiscrepancyReport = {
    generatedAt: new Date().toISOString(),
    commuterType,
    toleranceCents,
    pdfsScanned: pdfPaths.length,
    journeysChecked: 0,
    mismatchCount: 0,
    pdfSummaries: [],
    mismatches: [],
  };

  for (const pdfPath of pdfPaths) {
    const pdfName = path.basename(pdfPath);
    const buffer = await fs.readFile(pdfPath);
    const { dayGroups } = await pdfParserService.parsePdf(buffer);
    const snapshots = snapshotParsedJourneys(dayGroups);

    await concessionFareCalcService.calculateFaresOnConcession(
      dayGroups,
      commuterType,
    );

    const pdfMismatches = collectMismatches(pdfName, dayGroups, snapshots);
    const journeysChecked = countStatementFareSnapshots(snapshots);

    report.pdfSummaries.push({
      pdfName,
      daysParsed: dayGroups.length,
      journeysChecked,
      mismatches: pdfMismatches.length,
    });
    report.journeysChecked += journeysChecked;
    report.mismatches.push(...pdfMismatches);
  }

  report.mismatchCount = report.mismatches.length;
  await writeReport(report);

  assert.equal(
    report.mismatchCount,
    0,
    [
      `${report.mismatchCount} fare mismatches found across ${report.pdfsScanned} PDFs.`,
      `${report.journeysChecked} journeys checked.`,
      `Diagnostic report: ${reportPath}`,
    ].join(" "),
  );
});

async function findSimplyGoPdfFixtures(): Promise<string[]> {
  const entries = await fs.readdir(fixtureRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^SimplyGo Statement.*\.pdf$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(fixtureRoot, name));
}

function snapshotParsedJourneys(dayGroups: DayGroup[]): ParsedJourneySnapshot[][] {
  return dayGroups.map((dayGroup) =>
    dayGroup.journeys.map((journey, journeyIndex) => ({
      date: dayGroup.date,
      day: dayGroup.day,
      journeyIndex,
      startLocation: journey.startLocation,
      endLocation: journey.endLocation,
      fareSource: journey.fareSource,
      parsedFare: roundCurrency(journey.statementFare ?? journey.totalFare),
    })),
  );
}

function collectMismatches(
  pdfName: string,
  dayGroups: DayGroup[],
  snapshots: ParsedJourneySnapshot[][],
): FareMismatch[] {
  const mismatches: FareMismatch[] = [];

  dayGroups.forEach((dayGroup, dayIndex) => {
    dayGroup.journeys.forEach((journey, journeyIndex) => {
      const snapshot = snapshots[dayIndex]?.[journeyIndex];
      if (!snapshot) return;
      if (snapshot.fareSource === "pass_usage") return;

      const parsedFare = snapshot.parsedFare;
      const computedFare = roundCurrency(journey.totalFare);
      const delta = roundCurrency(computedFare - parsedFare);

      if (Math.abs(Math.round(delta * 100)) <= toleranceCents) {
        return;
      }

      mismatches.push(toMismatch(pdfName, snapshot, journey, computedFare, delta));
    });
  });

  return mismatches;
}

function countStatementFareSnapshots(snapshots: ParsedJourneySnapshot[][]): number {
  return snapshots.reduce(
    (total, daySnapshots) =>
      total +
      daySnapshots.filter((snapshot) => snapshot.fareSource === "statement").length,
    0,
  );
}

function toMismatch(
  pdfName: string,
  snapshot: ParsedJourneySnapshot,
  journey: Journey,
  computedFare: number,
  delta: number,
): FareMismatch {
  const busDistance = roundDistance(journey.busDistance);
  const mrtDistance = roundDistance(journey.mrtDistance);

  return {
    pdfName,
    date: snapshot.date,
    day: snapshot.day,
    journeyIndex: snapshot.journeyIndex,
    startLocation: snapshot.startLocation,
    endLocation: snapshot.endLocation,
    parsedFare: snapshot.parsedFare,
    computedFare,
    delta,
    busDistance,
    mrtDistance,
    totalDistance: roundDistance(busDistance + mrtDistance),
    trips: journey.trips.map((trip) => ({
      time: trip.time,
      type: trip.type,
      busService: trip.busService,
      startLocation: trip.startLocation,
      endLocation: trip.endLocation,
      parsedFare: roundCurrency(trip.fare),
      distance: roundDistance(trip.distance),
    })),
    tripIssues: journey.tripIssues,
  };
}

async function writeReport(report: FareDiscrepancyReport): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function normalizeCommuterType(value: string | undefined): CommuterType {
  return value === "student" ? "student" : "adult";
}

function normalizeToleranceCents(value: string | undefined): number {
  if (!value) return 4;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 4;
  return Math.round(parsed);
}

function roundCurrency(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

function roundDistance(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}
