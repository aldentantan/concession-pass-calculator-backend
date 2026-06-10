import assert from "node:assert/strict";
import { afterEach } from "node:test";
import { test } from "node:test";

process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://example.test:6379";

import type { TripDistanceCacheStore } from "../src/cache/tripDistCache";
import {
  buildTripDistanceCacheKey,
  TRIP_DISTANCE_RULESET_VERSION,
} from "../src/services/tripDistanceCacheKeyService";
import { TripDistanceLookupService } from "../src/services/tripDistanceLookupService";
import type { DayGroup, Trip, TripDistanceResult } from "../src/types";

const originalCacheBackend = process.env.CACHE_BACKEND;
const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  restoreEnv("CACHE_BACKEND", originalCacheBackend);
  restoreEnv("REDIS_URL", originalRedisUrl);
});

test("trip distance cache key normalizes trivial formatting differences", () => {
  const firstKey = buildTripDistanceCacheKey({
    type: "bus",
    busService: "  14A ",
    startLocation: " Opp  Blk 115 ",
    endLocation: "Kent   Ridge",
  });

  const secondKey = buildTripDistanceCacheKey({
    type: "bus",
    busService: "14a",
    startLocation: "opp blk 115",
    endLocation: " kent ridge ",
  });

  assert.equal(firstKey, secondKey);
});

test("commuter type is ignored for trip distance cache keys", () => {
  const adultKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "Bedok Reservoir",
    endLocation: "Kent Ridge",
    commuterType: "adult",
  });

  const studentKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "Bedok Reservoir",
    endLocation: "Kent Ridge",
    commuterType: "student",
  });

  assert.equal(adultKey, studentKey);
});

test("bus and MRT trips have different cache keys", () => {
  const busKey = buildTripDistanceCacheKey({
    type: "bus",
    busService: "14",
    startLocation: "A",
    endLocation: "B",
  });

  const mrtKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "A",
    endLocation: "B",
  });

  assert.notEqual(busKey, mrtKey);
});

test("different bus numbers have different cache keys", () => {
  const service14Key = buildTripDistanceCacheKey({
    type: "bus",
    busService: "14",
    startLocation: "A",
    endLocation: "B",
  });

  const service16Key = buildTripDistanceCacheKey({
    type: "bus",
    busService: "16",
    startLocation: "A",
    endLocation: "B",
  });

  assert.notEqual(service14Key, service16Key);
});

test("reversed stops have different cache keys", () => {
  const outboundKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "A",
    endLocation: "B",
  });

  const inboundKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "B",
    endLocation: "A",
  });

  assert.notEqual(outboundKey, inboundKey);
});

test("version changes invalidate trip distance cache keys", () => {
  const currentKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "A",
    endLocation: "B",
    version: TRIP_DISTANCE_RULESET_VERSION,
  });

  const nextVersionKey = buildTripDistanceCacheKey({
    type: "mrt",
    startLocation: "A",
    endLocation: "B",
    version: TRIP_DISTANCE_RULESET_VERSION + 1,
  });

  assert.notEqual(currentKey, nextVersionKey);
});

test("cache hit returns cached result and skips distance calculation", async () => {
  const trip = makeTrip();
  const cache = new FakeTripDistanceCacheStore();
  const cachedResult: TripDistanceResult = { distanceKm: 3.4, issues: [] };
  await cache.set(buildTripDistanceCacheKey(trip), cachedResult, 60_000);

  let calculationCount = 0;
  const service = new TripDistanceLookupService(cache, 60_000, async () => {
    calculationCount += 1;
    return { distanceKm: 9.9, issues: [] };
  });

  const lookup = await service.getTripDistance(trip);

  assert.equal(lookup.cacheHit, true);
  assert.equal(calculationCount, 0);
  assert.deepEqual(lookup.result, cachedResult);
});

test("cache miss calculates, stores, and returns the distance result", async () => {
  const trip = makeTrip();
  const cache = new FakeTripDistanceCacheStore();
  const calculatedResult: TripDistanceResult = { distanceKm: 2.7, issues: [] };
  let calculationCount = 0;
  const service = new TripDistanceLookupService(cache, 60_000, async () => {
    calculationCount += 1;
    return calculatedResult;
  });

  const lookup = await service.getTripDistance(trip);

  assert.equal(lookup.cacheHit, false);
  assert.equal(calculationCount, 1);
  assert.deepEqual(lookup.result, calculatedResult);
  assert.deepEqual(
    await cache.get(buildTripDistanceCacheKey(trip)),
    calculatedResult,
  );
});

test("cached result equals uncached result", async () => {
  const trip = makeTrip();
  const cache = new FakeTripDistanceCacheStore();
  const calculatedResult: TripDistanceResult = { distanceKm: 4.1, issues: [] };
  let calculationCount = 0;
  const service = new TripDistanceLookupService(cache, 60_000, async () => {
    calculationCount += 1;
    return calculatedResult;
  });

  const uncachedLookup = await service.getTripDistance(trip);
  const cachedLookup = await service.getTripDistance(trip);

  assert.equal(uncachedLookup.cacheHit, false);
  assert.equal(cachedLookup.cacheHit, true);
  assert.equal(calculationCount, 1);
  assert.deepEqual(cachedLookup.result, uncachedLookup.result);
});

test("distance resolver computes repeated trip signatures once per analysis run", async () => {
  const dayGroups = makeDayGroups([
    makeTrip({
      busService: "14A",
      startLocation: " Opp  Blk 115 ",
      endLocation: "Kent Ridge",
    }),
    makeTrip({
      busService: "14a",
      startLocation: "opp blk 115",
      endLocation: " kent   ridge ",
    }),
  ]);
  const cache = new FakeTripDistanceCacheStore();
  let calculationCount = 0;
  const service = new TripDistanceLookupService(cache, 60_000, async () => {
    calculationCount += 1;
    return { distanceKm: 1.25, issues: [] };
  });

  const metrics = await service.resolveTripDistances(dayGroups);

  assert.equal(calculationCount, 1);
  assert.equal(metrics.totalTrips, 2);
  assert.equal(metrics.uniqueTripSignatures, 1);
  assert.equal(metrics.cacheMisses, 1);
  assert.equal(metrics.cacheHits, 0);
  assert.equal(metrics.duplicateTripsAvoided, 1);
  assert.equal(dayGroups[0].journeys[0].trips[0].distance, 1.25);
  assert.equal(dayGroups[0].journeys[0].trips[1].distance, 1.25);
  assert.equal(dayGroups[0].journeys[0].busDistance, 2.5);
  assert.equal(dayGroups[0].busDistance, 2.5);
  assert.equal(dayGroups[0].totalDistance, 2.5);
});

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    time: "08:00 AM",
    type: "bus",
    busService: "14",
    startLocation: "A",
    endLocation: "B",
    fare: 0,
    distance: 0,
    ...overrides,
  };
}

function makeDayGroups(trips: Trip[]): DayGroup[] {
  return [
    {
      date: "01 Jan 2026",
      day: "Thu",
      journeys: [
        {
          startLocation: trips[0]?.startLocation ?? "",
          endLocation: trips[trips.length - 1]?.endLocation ?? "",
          trips,
          tripIssues: [],
          fareSource: "statement",
          statementFare: 0,
          busDistance: 0,
          mrtDistance: 0,
          fareExcludingBus: 0,
          fareExcludingMrt: 0,
          totalFare: 0,
        },
      ],
      tripIssues: [],
      mrtDistance: 0,
      busDistance: 0,
      totalDistance: 0,
      totalFareExcludingBus: 0,
      totalFareExcludingMrt: 0,
      totalFare: 0,
    },
  ];
}

class FakeTripDistanceCacheStore implements TripDistanceCacheStore {
  private values = new Map<string, TripDistanceResult>();

  async get(key: string): Promise<TripDistanceResult | undefined> {
    const value = this.values.get(key);
    if (!value) return undefined;

    return {
      distanceKm: value.distanceKm,
      issues: value.issues.map((issue) => ({ ...issue })),
    };
  }

  async set(
    key: string,
    value: TripDistanceResult,
    _ttlMs: number,
  ): Promise<void> {
    this.values.set(key, {
      distanceKm: value.distanceKm,
      issues: value.issues.map((issue) => ({ ...issue })),
    });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
