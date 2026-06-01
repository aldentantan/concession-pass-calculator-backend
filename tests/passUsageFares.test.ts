import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import sql from "../src/db";
import { concessionFareCalcService } from "../src/services/concessionFareCalculatorService";
import { pdfParserService } from "../src/services/pdfParserService";
import type { DayGroup, Journey } from "../src/types";

type ExpectedPassUsageFixture = {
  relativePath: string;
  expectedDays: number;
  expectedJourneys: number;
  expectedPassUsageJourneys: number;
  expectedComputedTotals: {
    totalFareWithNewPrices: number;
    totalFareExcludingBus: number;
    totalFareExcludingMrt: number;
  };
  representativeJourney: {
    date: string;
    journeyIndex: number;
    startLocation: string;
    endLocation: string;
    tripCount: number;
    tripTypes: Array<"mrt" | "bus">;
    computedTotalFare: number;
  };
};

const backendRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.resolve(backendRoot, "..");

const fixtures: ExpectedPassUsageFixture[] = [
  {
    relativePath: path.join("pdfs", "SimplyGo Statement Feb 2026 7039.pdf"),
    expectedDays: 25,
    expectedJourneys: 62,
    expectedPassUsageJourneys: 62,
    expectedComputedTotals: {
      totalFareWithNewPrices: 116,
      totalFareExcludingBus: 100.93,
      totalFareExcludingMrt: 70.94,
    },
    representativeJourney: {
      date: "01 Feb 2026",
      journeyIndex: 0,
      startLocation: "Opp Blk 115",
      endLocation: "Kent Ridge",
      tripCount: 2,
      tripTypes: ["bus", "mrt"],
      computedTotalFare: 2.15,
    },
  },
  {
    relativePath: path.join("pdfs", "SimplyGo Statement Sep 2025 0681.pdf"),
    expectedDays: 21,
    expectedJourneys: 53,
    expectedPassUsageJourneys: 45,
    expectedComputedTotals: {
      totalFareWithNewPrices: 97.41,
      totalFareExcludingBus: 92.73,
      totalFareExcludingMrt: 9.53,
    },
    representativeJourney: {
      date: "01 Sep 2025",
      journeyIndex: 0,
      startLocation: "Bedok Reservoir",
      endLocation: "Kent Ridge",
      tripCount: 1,
      tripTypes: ["mrt"],
      computedTotalFare: 2.33,
    },
  },
  {
    relativePath: "SimplyGo Statement Mar 2026 7039.pdf",
    expectedDays: 27,
    expectedJourneys: 61,
    expectedPassUsageJourneys: 61,
    expectedComputedTotals: {
      totalFareWithNewPrices: 115.26,
      totalFareExcludingBus: 91.27,
      totalFareExcludingMrt: 76.24,
    },
    representativeJourney: {
      date: "01 Mar 2026",
      journeyIndex: 0,
      startLocation: "Opp Blk 115",
      endLocation: "Braddell",
      tripCount: 2,
      tripTypes: ["bus", "mrt"],
      computedTotalFare: 1.59,
    },
  },
];

after(async () => {
  await sql.end({ timeout: 5 });
});

test("Pass Usage statements preserve journeys and reconstruct fares from distances", async () => {
  for (const fixture of fixtures) {
    const pdfPath = path.join(fixtureRoot, fixture.relativePath);
    const buffer = await fs.readFile(pdfPath);
    const { dayGroups } = await pdfParserService.parsePdf(buffer);

    assert.equal(dayGroups.length, fixture.expectedDays, fixture.relativePath);
    assert.equal(countJourneys(dayGroups), fixture.expectedJourneys, fixture.relativePath);

    const passUsageJourneys = collectPassUsageJourneys(dayGroups);
    assert.equal(
      passUsageJourneys.length,
      fixture.expectedPassUsageJourneys,
      fixture.relativePath,
    );

    for (const { journey } of passUsageJourneys) {
      assert.equal(journey.fareSource, "pass_usage", fixture.relativePath);
      assert.equal(journey.statementFare, null, fixture.relativePath);
      assert.equal(
        roundCurrency(journey.trips.reduce((sum, trip) => sum + trip.fare, 0)),
        0,
        fixture.relativePath,
      );
    }

    const representativeBeforeCalculation = getJourney(
      dayGroups,
      fixture.representativeJourney.date,
      fixture.representativeJourney.journeyIndex,
    );
    assert.equal(
      representativeBeforeCalculation.startLocation,
      fixture.representativeJourney.startLocation,
      fixture.relativePath,
    );
    assert.equal(
      representativeBeforeCalculation.endLocation,
      fixture.representativeJourney.endLocation,
      fixture.relativePath,
    );
    assert.equal(
      representativeBeforeCalculation.trips.length,
      fixture.representativeJourney.tripCount,
      fixture.relativePath,
    );
    assert.deepEqual(
      representativeBeforeCalculation.trips.map((trip) => trip.type),
      fixture.representativeJourney.tripTypes,
      fixture.relativePath,
    );

    const computedTotals = await concessionFareCalcService.calculateFaresOnConcession(
      dayGroups,
      "adult",
    );

    assert.deepEqual(roundComputedTotals(computedTotals), fixture.expectedComputedTotals);

    const zeroFareJourneys = passUsageJourneys.filter(({ journey }) => {
      const totalDistance = journey.busDistance + journey.mrtDistance;
      return totalDistance > 0 && roundCurrency(journey.totalFare) === 0;
    });
    assert.deepEqual(zeroFareJourneys, [], fixture.relativePath);

    assert.equal(
      roundCurrency(representativeBeforeCalculation.totalFare),
      fixture.representativeJourney.computedTotalFare,
      fixture.relativePath,
    );
  }
});

function countJourneys(dayGroups: DayGroup[]): number {
  return dayGroups.reduce((total, dayGroup) => total + dayGroup.journeys.length, 0);
}

function collectPassUsageJourneys(
  dayGroups: DayGroup[],
): Array<{ dayGroup: DayGroup; journey: Journey; journeyIndex: number }> {
  return dayGroups.flatMap((dayGroup) =>
    dayGroup.journeys
      .map((journey, journeyIndex) => ({ dayGroup, journey, journeyIndex }))
      .filter(({ journey }) => journey.fareSource === "pass_usage"),
  );
}

function getJourney(
  dayGroups: DayGroup[],
  date: string,
  journeyIndex: number,
): Journey {
  const dayGroup = dayGroups.find((candidate) => candidate.date === date);
  assert.ok(dayGroup, `Expected day group ${date}`);

  const journey = dayGroup.journeys[journeyIndex];
  assert.ok(journey, `Expected journey ${journeyIndex} on ${date}`);

  return journey;
}

function roundComputedTotals(totals: {
  totalFareWithNewPrices: number;
  totalFareExcludingBus: number;
  totalFareExcludingMrt: number;
}): {
  totalFareWithNewPrices: number;
  totalFareExcludingBus: number;
  totalFareExcludingMrt: number;
} {
  return {
    totalFareWithNewPrices: roundCurrency(totals.totalFareWithNewPrices),
    totalFareExcludingBus: roundCurrency(totals.totalFareExcludingBus),
    totalFareExcludingMrt: roundCurrency(totals.totalFareExcludingMrt),
  };
}

function roundCurrency(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}
