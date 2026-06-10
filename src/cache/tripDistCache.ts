import "dotenv/config";
import { createClient, type RedisClientType } from "redis";
import type { TripDistanceResult, TripDistCacheKey } from "../types";

export interface TripDistanceCacheStore {
  get(key: TripDistCacheKey): Promise<TripDistanceResult | undefined>;
  set(
    key: TripDistCacheKey,
    value: TripDistanceResult,
    ttlMs: number,
  ): Promise<void>;
  delete(key: TripDistCacheKey): Promise<void>;
}

type RedisTripDistanceCacheOptions = {
  namespace?: string;
  url: string;
  client?: RedisClientType;
};

const REDIS_CACHE_RETRY_DELAY_MS = 5_000;

export class RedisTripDistanceCache implements TripDistanceCacheStore {
  private client: RedisClientType;
  private connectPromise: Promise<void> | null = null;
  private namespace: string;
  private unavailableUntil = 0;

  constructor(options: RedisTripDistanceCacheOptions) {
    this.namespace = options.namespace ?? "trip-distance";
    this.client =
      options.client ??
      createClient({
        url: options.url,
        socket: {
          connectTimeout: 1_000,
          reconnectStrategy: false,
        },
      });

    this.client.on("error", (error) => {
      console.warn("Redis trip distance cache error:", error);
    });
  }

  async get(key: TripDistCacheKey): Promise<TripDistanceResult | undefined> {
    try {
      await this.connect();
      if (!this.client.isOpen) return undefined;

      const cachedValue = await this.client.get(this.toRedisKey(key));
      if (!cachedValue) return undefined;

      const parsedValue = parseTripDistanceResult(cachedValue);
      if (!parsedValue) {
        await this.client.del(this.toRedisKey(key));
      }

      return parsedValue;
    } catch (error) {
      this.markUnavailable("get", error);
      return undefined;
    }
  }

  async set(
    key: TripDistCacheKey,
    value: TripDistanceResult,
    ttlMs: number,
  ): Promise<void> {
    try {
      await this.connect();
      if (!this.client.isOpen) return;

      await this.client.set(this.toRedisKey(key), JSON.stringify(value), {
        PX: ttlMs,
      });
    } catch (error) {
      this.markUnavailable("set", error);
    }
  }

  async delete(key: TripDistCacheKey): Promise<void> {
    try {
      await this.connect();
      if (!this.client.isOpen) return;

      await this.client.del(this.toRedisKey(key));
    } catch (error) {
      this.markUnavailable("delete", error);
    }
  }

  async close(): Promise<void> {
    if (!this.client.isOpen) return;

    await this.client.close();
  }

  private async connect(): Promise<void> {
    if (Date.now() < this.unavailableUntil) return;
    if (this.client.isOpen) return;

    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => undefined);
    }

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private toRedisKey(key: TripDistCacheKey): string {
    return `${this.namespace}:${key}`;
  }

  private markUnavailable(operation: string, error: unknown): void {
    this.unavailableUntil = Date.now() + REDIS_CACHE_RETRY_DELAY_MS;
    console.warn(`Redis trip distance cache ${operation} failed:`, error);
  }
}

export function createTripDistanceCache(): TripDistanceCacheStore {
  const cacheBackend = process.env.CACHE_BACKEND?.trim().toLowerCase();
  const redisUrl = process.env.REDIS_URL;

  if (cacheBackend && cacheBackend !== "redis") {
    throw new Error(
      `Unsupported CACHE_BACKEND "${cacheBackend}". Only "redis" is supported.`,
    );
  }

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL environment variable is required for the trip distance cache.",
    );
  }

  return new RedisTripDistanceCache({
    namespace: process.env.TRIP_DISTANCE_CACHE_NAMESPACE,
    url: redisUrl,
  });
}

function parseTripDistanceResult(value: string): TripDistanceResult | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<TripDistanceResult>;

    if (
      !("distanceKm" in parsed) ||
      (parsed.distanceKm !== null && typeof parsed.distanceKm !== "number") ||
      !Array.isArray(parsed.issues)
    ) {
      return undefined;
    }

    const issues = parsed.issues.map((issue) => {
      if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
        throw new Error("Invalid cached trip distance issue");
      }

      return { ...issue };
    });

    return {
      distanceKm: parsed.distanceKm,
      issues,
    };
  } catch {
    return undefined;
  }
}

export const tripDistCache = createTripDistanceCache();

export async function closeTripDistanceCache(): Promise<void> {
  if (tripDistCache instanceof RedisTripDistanceCache) {
    await tripDistCache.close();
  }
}
