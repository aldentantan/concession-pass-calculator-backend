import type { CommuterType, Trip, TripDistCacheKey } from "../types";

export const TRIP_DISTANCE_RULESET_VERSION = 1;

type TripDistanceCacheKeyInput = Pick<
  Trip,
  "type" | "busService" | "startLocation" | "endLocation"
> & {
  commuterType?: CommuterType;
  version?: number;
};

export function buildTripDistanceCacheKey(
  trip: TripDistanceCacheKeyInput,
): TripDistCacheKey {
  const type = normalizeField(trip.type);
  const keyParts = {
    version: trip.version ?? TRIP_DISTANCE_RULESET_VERSION,
    type,
    busService: type === "bus" ? normalizeField(trip.busService ?? "") : "",
    startLocation: normalizeField(trip.startLocation),
    endLocation: normalizeField(trip.endLocation),
  };

  return JSON.stringify(keyParts);
}

export function normalizeTripDistanceCacheField(value: string): string {
  return normalizeField(value);
}

function normalizeField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
