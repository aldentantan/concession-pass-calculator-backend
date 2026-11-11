import sql from '../src/db';
import { prepareBusData, summarizeWarnings, type BusDataCounts, type LtaBusRouteRecord, type LtaBusStopRecord } from './ltaBusData';

/*
 * Replaces lta_bus_stops and lta_bus_routes with a fresh, validated copy of LTA DataMall's
 * BusStops and BusRoutes data in a single transaction, so the app never sees a partial refresh.
 *
 *   npm run ingest:bus-data -- --dry-run   Fetch and validate only; the database is not changed
 *   npm run ingest:bus-data                Fetch, validate, replace both tables and log the refresh
 *
 * Gaps in stop numbering are printed as a count; add --verbose to list every warning.
 * Set LTA_ALLOW_LARGE_CHANGE=1 to allow either table to shrink by more than 10%.
 * Exits with code 1 on any failure, leaving the existing tables unchanged.
 */

const DATAMALL_URL = 'https://datamall2.mytransport.sg/ltaodataservice';
const PAGE_SIZE = 500; // DataMall's fixed page size
const MAX_PAGES = 200; // Safety stop; BusRoutes is about 55 pages
const PAGE_DELAY_MS = 200;
const MAX_RETRIES = 4;
const INSERT_BATCH_SIZE = 1000;
const REFRESH_LOG_TABLE = 'lta_bus_data_refreshes';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const allowLargeChange = process.env.LTA_ALLOW_LARGE_CHANGE === '1';
  const apiKey = process.env.LTA_API_ACCOUNT_KEY;
  if (!apiKey) throw new Error('LTA_API_ACCOUNT_KEY is not set');

  if (!dryRun) {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass(${`public.${REFRESH_LOG_TABLE}`}) IS NOT NULL AS exists
    `;
    if (!exists) throw new Error(`Table ${REFRESH_LOG_TABLE} does not exist; create it with the SQL in schema.sql first`);
  }

  const stopRecords = await fetchAll<LtaBusStopRecord>('BusStops', apiKey);
  const routeRecords = await fetchAll<LtaBusRouteRecord>('BusRoutes', apiKey);
  const [current] = await sql<BusDataCounts[]>`
    SELECT (SELECT count(*) FROM lta_bus_stops)::int AS stops,
           (SELECT count(*) FROM lta_bus_routes)::int AS routes
  `;

  const data = prepareBusData(stopRecords, routeRecords, allowLargeChange ? null : current);
  console.log(
    `Prepared ${data.stops.length} bus stops and ${data.routes.length} bus route rows ` +
    `(currently ${current.stops} and ${current.routes}).`,
  );
  if (data.warnings.length > 0) {
    console.warn(
      `${data.warnings.length} warning(s) in LTA's data, loaded as-is` +
      (dryRun ? ':' : ` and saved in full to ${REFRESH_LOG_TABLE}:`),
    );
    for (const line of summarizeWarnings(data.warnings, verbose)) console.warn(line);
  }
  if (data.errors.length > 0) {
    for (const error of data.errors) console.error(`  - ${error}`);
    throw new Error(`${data.errors.length} validation error(s); the database was not changed`);
  }

  if (dryRun) {
    console.log('Dry run: validation passed; the database was not changed.');
    return;
  }

  await sql.begin(async (tx) => {
    // bus_trip_distance_cache references lta_bus_stops, so it is truncated too; cached distances are stale after a refresh.
    await tx`TRUNCATE lta_bus_routes, bus_trip_distance_cache, lta_bus_stops RESTART IDENTITY`;
    for (const batch of chunks(data.stops, INSERT_BATCH_SIZE)) {
      await tx`INSERT INTO lta_bus_stops ${tx(batch, 'bus_stop_code', 'bus_stop_name')}`;
    }
    for (const batch of chunks(data.routes, INSERT_BATCH_SIZE)) {
      await tx`
        INSERT INTO lta_bus_routes
        ${tx(batch, 'bus_service_no', 'direction', 'bus_stop_sequence', 'bus_stop_code', 'bus_stop_distance_km')}
      `;
    }
    await tx`
      INSERT INTO lta_bus_data_refreshes (bus_stop_count, bus_route_count, warnings)
      VALUES (${data.stops.length}, ${data.routes.length}, ${tx.json(data.warnings)})
    `;
  });
  console.log(`Replaced lta_bus_stops (${data.stops.length} rows) and lta_bus_routes (${data.routes.length} rows).`);
}

/** Fetches every page of a DataMall dataset; DataMall returns an empty page after the last record. */
async function fetchAll<T>(dataset: string, apiKey: string): Promise<T[]> {
  const records: T[] = [];
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) throw new Error(`${dataset}: no empty page after ${MAX_PAGES} pages; check the DataMall response`);
    if (page > 0) await wait(PAGE_DELAY_MS);
    const pageRecords = await fetchPage<T>(dataset, page * PAGE_SIZE, apiKey);
    if (pageRecords.length === 0) break;
    records.push(...pageRecords);
  }
  console.log(`Fetched ${records.length} ${dataset} records.`);
  return records;
}

async function fetchPage<T>(dataset: string, skip: number, apiKey: string): Promise<T[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${DATAMALL_URL}/${dataset}?$skip=${skip}`, {
        headers: { AccountKey: apiKey, accept: 'application/json' },
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 300);
        const retryable = response.status === 429 || response.status >= 500;
        throw Object.assign(new Error(`${dataset} $skip=${skip}: HTTP ${response.status} ${body}`), { retryable });
      }
      const data = (await response.json()) as { value?: unknown };
      if (!Array.isArray(data.value)) throw new Error(`${dataset} $skip=${skip}: response has no "value" array`);
      return data.value as T[];
    } catch (error) {
      // Network errors and malformed responses are retried; client errors such as a bad API key are not.
      const retryable = (error as { retryable?: boolean }).retryable ?? true;
      if (!retryable || attempt >= MAX_RETRIES) throw error;
      const delayMs = 1000 * 2 ** attempt;
      console.warn(`${dataset} $skip=${skip}: ${(error as Error).message}; retrying in ${delayMs} ms`);
      await wait(delayMs);
    }
  }
}

function chunks<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) result.push(rows.slice(offset, offset + size));
  return result;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main()
  .catch((error) => {
    console.error(`Bus data refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
