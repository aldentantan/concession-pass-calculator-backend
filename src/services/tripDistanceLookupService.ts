import type { DayGroup, Trip, TripDistanceResult } from "../types";
import {
  tripDistCache,
  type TripDistanceCacheStore,
} from "../cache/tripDistCache";
import { busTripDistanceService } from "./busTripDistanceService";
import { buildTripDistanceCacheKey } from "./tripDistanceCacheKeyService";
import { mrtTripDistanceService } from "./mrtTripDistanceService";

export const DEFAULT_TRIP_DISTANCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type TripDistanceCalculator = (
  trip: Pick<Trip, "type" | "busService" | "startLocation" | "endLocation">,
) => Promise<TripDistanceResult>;

export type TripDistanceLookupMetrics = {
  totalTrips: number;
  uniqueTripSignatures: number;
  cacheHits: number;
  cacheMisses: number;
  duplicateTripsAvoided: number;
  elapsedMs: number;
};

type TripDistanceLookup = {
  cacheHit: boolean;
  key: string;
  result: TripDistanceResult;
};

export class TripDistanceLookupService {
  constructor(
    private cache: TripDistanceCacheStore = tripDistCache,
    private ttlMs = getTripDistanceCacheTtlMs(),
    private calculateTripDistance: TripDistanceCalculator =
      defaultTripDistanceCalculator,
  ) {}

  async getTripDistance(
    trip: Pick<Trip, "type" | "busService" | "startLocation" | "endLocation">,
  ): Promise<TripDistanceLookup> {
    const key = buildTripDistanceCacheKey(trip);
    const cachedResult = await this.cache.get(key);

    if (cachedResult !== undefined) {
      return {
        cacheHit: true,
        key,
        result: cachedResult,
      };
    }

    const result = await this.calculateTripDistance(trip);
    await this.cache.set(key, result, this.ttlMs);

    return {
      cacheHit: false,
      key,
      result,
    };
  }

  async resolveTripDistances(dayGroups: DayGroup[]): Promise<TripDistanceLookupMetrics> {
    const startedAt = Date.now();
    const uniqueTrips = new Map<string, Trip>();
    let totalTrips = 0;

    for (const dayGroup of dayGroups) {
      for (const journey of dayGroup.journeys) {
        for (const trip of journey.trips) {
          totalTrips += 1;
          const key = buildTripDistanceCacheKey(trip);
          if (!uniqueTrips.has(key)) {
            uniqueTrips.set(key, trip);
          }
        }
      }
    }

    const resolvedDistances = new Map<string, TripDistanceResult>();
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const [key, trip] of uniqueTrips.entries()) {
      const lookup = await this.getTripDistance(trip);
      resolvedDistances.set(key, lookup.result);

      if (lookup.cacheHit) {
        cacheHits += 1;
      } else {
        cacheMisses += 1;
      }
    }

    this.applyResolvedDistances(dayGroups, resolvedDistances);

    return {
      totalTrips,
      uniqueTripSignatures: uniqueTrips.size,
      cacheHits,
      cacheMisses,
      duplicateTripsAvoided: totalTrips - uniqueTrips.size,
      elapsedMs: Date.now() - startedAt,
    };
  }

  private applyResolvedDistances(
    dayGroups: DayGroup[],
    resolvedDistances: Map<string, TripDistanceResult>,
  ): void {
    for (const dayGroup of dayGroups) {
      dayGroup.tripIssues = [];
      dayGroup.mrtDistance = 0;
      dayGroup.busDistance = 0;
      dayGroup.totalDistance = 0;

      for (const journey of dayGroup.journeys) {
        journey.tripIssues = [];
        journey.mrtDistance = 0;
        journey.busDistance = 0;

        journey.trips.forEach((trip, tripIndex) => {
          const key = buildTripDistanceCacheKey(trip);
          const result = resolvedDistances.get(key);
          const distanceKm = result?.distanceKm ?? null;

          trip.distance = distanceKm ?? 0;

          if (distanceKm !== null) {
            if (trip.type === "mrt") {
              journey.mrtDistance += distanceKm;
              dayGroup.mrtDistance += distanceKm;
            } else {
              journey.busDistance += distanceKm;
              dayGroup.busDistance += distanceKm;
            }

            dayGroup.totalDistance += distanceKm;
          }

          if (result && result.issues.length > 0) {
            const issuesWithTripIndex = result.issues.map((issue) => ({
              ...issue,
              tripIndex,
            }));

            journey.tripIssues.push(...issuesWithTripIndex);
            dayGroup.tripIssues.push(...issuesWithTripIndex);
          }
        });
      }
    }
  }
}

async function defaultTripDistanceCalculator(
  trip: Pick<Trip, "type" | "busService" | "startLocation" | "endLocation">,
): Promise<TripDistanceResult> {
  if (trip.type === "bus") {
    return await busTripDistanceService.calculateBusTripDistance(
      trip.busService ?? "",
      trip.startLocation,
      trip.endLocation,
    );
  }

  return await mrtTripDistanceService.calculateMrtTripDistance(
    trip.startLocation,
    trip.endLocation,
  );
}

export const tripDistanceLookupService = new TripDistanceLookupService();

function getTripDistanceCacheTtlMs(): number {
  const configuredTtl = Number(process.env.TRIP_DISTANCE_CACHE_TTL_MS);

  if (Number.isFinite(configuredTtl) && configuredTtl > 0) {
    return Math.round(configuredTtl);
  }

  return DEFAULT_TRIP_DISTANCE_CACHE_TTL_MS;
}
