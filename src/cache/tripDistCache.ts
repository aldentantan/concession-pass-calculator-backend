import type { TripDistanceResult, TripDistCacheKey } from "../types";

type CacheEntry = {
  expiresAt: number;
  value: TripDistanceResult;
};

export interface TripDistanceCacheStore {
  get(key: TripDistCacheKey): TripDistanceResult | undefined;
  set(key: TripDistCacheKey, value: TripDistanceResult, ttlMs: number): void;
  delete(key: TripDistCacheKey): void;
}

export class InMemoryTripDistanceCache implements TripDistanceCacheStore {
  private entries = new Map<TripDistCacheKey, CacheEntry>();

  get(key: TripDistCacheKey): TripDistanceResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return cloneTripDistanceResult(entry.value);
  }

  set(
    key: TripDistCacheKey,
    value: TripDistanceResult,
    ttlMs: number,
  ): void {
    this.entries.set(key, {
      expiresAt: Date.now() + ttlMs,
      value: cloneTripDistanceResult(value),
    });
  }

  delete(key: TripDistCacheKey): void {
    this.entries.delete(key);
  }
}

function cloneTripDistanceResult(value: TripDistanceResult): TripDistanceResult {
  return {
    distanceKm: value.distanceKm,
    issues: value.issues.map((issue) => ({ ...issue })),
  };
}

export const tripDistCache = new InMemoryTripDistanceCache();
