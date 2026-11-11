/*
 * Converts and validates LTA DataMall BusStops and BusRoutes records before they replace
 * the lta_bus_stops and lta_bus_routes tables. Errors block the refresh; warnings are
 * known LTA data quirks that are loaded and recorded.
 */

export interface LtaBusStopRecord {
  BusStopCode?: string | null;
  Description?: string | null;
}

export interface LtaBusRouteRecord {
  ServiceNo?: string | null;
  Direction?: number | null;
  StopSequence?: number | null;
  BusStopCode?: string | null;
  Distance?: number | null;
}

export interface BusStopRow {
  bus_stop_code: string;
  bus_stop_name: string;
}

export interface BusRouteRow {
  bus_service_no: string;
  direction: number;
  bus_stop_sequence: number;
  bus_stop_code: string;
  bus_stop_distance_km: number;
}

export interface BusDataCounts {
  stops: number;
  routes: number;
}

export interface PreparedBusData {
  stops: BusStopRow[];
  routes: BusRouteRow[];
  errors: string[];
  warnings: string[];
}

/** A refresh may not shrink either table by more than this fraction of its current rows. */
export const MAX_ROW_COUNT_DROP = 0.1;

const STOP_GAP_SUFFIX = 'missing from the stop sequence';

/**
 * Console lines for warnings. Gaps in stop numbering are common in LTA's data (e.g. express services)
 * and don't affect distances, so they are counted rather than listed unless verbose.
 */
export function summarizeWarnings(warnings: string[], verbose: boolean): string[] {
  if (verbose) return warnings.map((warning) => `  - ${warning}`);

  const gapCount = warnings.filter((warning) => warning.endsWith(STOP_GAP_SUFFIX)).length;
  const lines = warnings
    .filter((warning) => !warning.endsWith(STOP_GAP_SUFFIX))
    .map((warning) => `  - ${warning}`);
  if (gapCount > 0) {
    lines.push(`  - ${gapCount} gap(s) in stop numbering (these don't affect distances); rerun with --verbose to list them`);
  }
  return lines;
}

/**
 * @param previous Current table row counts, or null to skip the row-count check.
 */
export function prepareBusData(
  stopRecords: LtaBusStopRecord[],
  routeRecords: LtaBusRouteRecord[],
  previous: BusDataCounts | null,
): PreparedBusData {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validStops = stopRecords.flatMap(toStopRow);
  const skippedStops = stopRecords.length - validStops.length;
  if (skippedStops > 0) warnings.push(`Skipped ${skippedStops} bus stop record(s) with missing fields`);
  const stops = dedupe(
    validStops,
    (stop) => stop.bus_stop_code,
    (stop) => `Bus stop ${stop.bus_stop_code} appears more than once with different names`,
    errors,
  );

  const validRoutes = routeRecords.flatMap(toRouteRow);
  const skippedRoutes = routeRecords.length - validRoutes.length;
  if (skippedRoutes > 0) warnings.push(`Skipped ${skippedRoutes} bus route record(s) with missing fields`);
  const routes = dedupe(
    validRoutes,
    (row) => `${row.bus_service_no}|${row.direction}|${row.bus_stop_sequence}`,
    (row) => `Bus ${row.bus_service_no} direction ${row.direction} stop ${row.bus_stop_sequence} appears more than once with different data`,
    errors,
  );

  if (stops.length === 0) errors.push('LTA returned no bus stops');
  if (routes.length === 0) errors.push('LTA returned no bus routes');

  const stopCodes = new Set(stops.map((stop) => stop.bus_stop_code));
  for (const row of routes) {
    if (!stopCodes.has(row.bus_stop_code)) {
      errors.push(
        `Bus ${row.bus_service_no} direction ${row.direction} stop ${row.bus_stop_sequence} uses bus stop ${row.bus_stop_code}, which is not in the bus stops data`,
      );
    }
  }

  warnings.push(...findRouteQuirks(routes));

  if (previous) {
    checkRowCountDrop('Bus stops', previous.stops, stops.length, errors);
    checkRowCountDrop('Bus routes', previous.routes, routes.length, errors);
  }

  return { stops, routes, errors, warnings };
}

function toStopRow(record: LtaBusStopRecord): BusStopRow[] {
  const code = record.BusStopCode?.trim();
  const name = record.Description?.trim();
  return code && name ? [{ bus_stop_code: code, bus_stop_name: name }] : [];
}

function toRouteRow(record: LtaBusRouteRecord): BusRouteRow[] {
  const serviceNo = record.ServiceNo?.trim();
  const busStopCode = record.BusStopCode?.trim();
  const { Direction: direction, StopSequence: sequence, Distance: distance } = record;
  if (
    !serviceNo ||
    !busStopCode ||
    typeof direction !== 'number' ||
    typeof sequence !== 'number' ||
    typeof distance !== 'number' ||
    !Number.isFinite(distance)
  ) {
    return [];
  }
  return [{
    bus_service_no: serviceNo,
    direction,
    bus_stop_sequence: sequence,
    bus_stop_code: busStopCode,
    bus_stop_distance_km: distance,
  }];
}

/** Drops identical repeats (DataMall paging can return a record twice); conflicting repeats are errors. */
function dedupe<T>(rows: T[], keyOf: (row: T) => string, conflictMessage: (row: T) => string, errors: string[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
    } else if (JSON.stringify(existing) !== JSON.stringify(row)) {
      errors.push(conflictMessage(row));
    }
  }
  return [...byKey.values()];
}

/** Distances that decrease along a route and gaps in stop numbering both occur in LTA's own data. */
function findRouteQuirks(routes: BusRouteRow[]): string[] {
  const byDirection = new Map<string, BusRouteRow[]>();
  for (const row of routes) {
    const key = `${row.bus_service_no}|${row.direction}`;
    const rows = byDirection.get(key);
    if (rows) rows.push(row);
    else byDirection.set(key, [row]);
  }

  const warnings: string[] = [];
  for (const rows of byDirection.values()) {
    rows.sort((a, b) => a.bus_stop_sequence - b.bus_stop_sequence);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      const label = `Bus ${current.bus_service_no} direction ${current.direction}`;
      if (current.bus_stop_sequence > previous.bus_stop_sequence + 1) {
        const first = previous.bus_stop_sequence + 1;
        const last = current.bus_stop_sequence - 1;
        warnings.push(first === last
          ? `${label}: stop ${first} is ${STOP_GAP_SUFFIX}`
          : `${label}: stops ${first}-${last} are ${STOP_GAP_SUFFIX}`);
      }
      if (current.bus_stop_distance_km < previous.bus_stop_distance_km) {
        warnings.push(
          `${label}: distance goes backwards at stop ${current.bus_stop_sequence} (${previous.bus_stop_distance_km} km to ${current.bus_stop_distance_km} km)`,
        );
      }
    }
  }
  return warnings;
}

function checkRowCountDrop(label: string, previousCount: number, newCount: number, errors: string[]): void {
  if (previousCount > 0 && newCount < previousCount * (1 - MAX_ROW_COUNT_DROP)) {
    errors.push(
      `${label} would drop from ${previousCount} to ${newCount} rows (more than ${MAX_ROW_COUNT_DROP * 100}%). ` +
      'Check the LTA data, or rerun with LTA_ALLOW_LARGE_CHANGE=1 if the drop is expected.',
    );
  }
}
