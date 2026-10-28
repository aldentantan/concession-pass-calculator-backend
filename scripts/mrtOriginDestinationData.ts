export interface LtaStationOption {
  id: string;
  label: string;
}

export interface MappedLtaStation {
  ltaId: string;
  ltaOptionValue: string;
  ltaLabel: string;
  stationName: string;
}

export interface StationMappingError {
  code: 'INVALID_LTA_ID' | 'LTA_STATION_NOT_FOUND' | 'AMBIGUOUS_STATION' | 'LOCAL_STATION_NOT_MAPPED';
  ltaId: string;
  ltaLabel: string;
  stationName?: string;
  message: string;
}

export interface MrtOriginDestinationDistance {
  fromStationName: string;
  toStationName: string;
  distanceKm: number;
}

export function normalizeStationLabel(label: string): string {
  return label
    .replace(/\s*\([^)]*\)\s*$/, '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');
}

export function mapLtaStationOptions(
  options: LtaStationOption[],
  localStationNames: string[],
): { stations: MappedLtaStation[]; errors: StationMappingError[] } {
  const localNamesByNormalizedName = new Map<string, string[]>();
  for (const stationName of localStationNames) {
    const normalized = normalizeStationLabel(stationName);
    const matches = localNamesByNormalizedName.get(normalized) ?? [];
    matches.push(stationName);
    localNamesByNormalizedName.set(normalized, matches);
  }

  const uniqueOptions = new Map<string, LtaStationOption>();
  const errors: StationMappingError[] = [];
  for (const option of options) {
    const id = option.id.trim();
    const label = option.label.trim();
    if (!/^\d+(?:_\d+)?$/.test(id) || id === '00') {
      errors.push({
        code: 'INVALID_LTA_ID',
        ltaId: id,
        ltaLabel: label,
        message: `LTA station option has a non-numeric id: ${id}`,
      });
      continue;
    }

    const previous = uniqueOptions.get(id);
    if (previous && normalizeStationLabel(previous.label) !== normalizeStationLabel(label)) {
      errors.push({
        code: 'AMBIGUOUS_STATION',
        ltaId: id,
        ltaLabel: label,
        message: `LTA station id ${id} maps to both "${previous.label}" and "${label}"`,
      });
      continue;
    }
    uniqueOptions.set(id, { id, label });
  }

  const stations: MappedLtaStation[] = [];
  const mappedLocalNames = new Set<string>();
  const mappedLtaIds = new Map<string, string>();

  for (const option of uniqueOptions.values()) {
    const ltaId = option.id.split('_')[0];
    const normalizedLabel = normalizeStationLabel(option.label);
    const localMatches = localNamesByNormalizedName.get(normalizedLabel) ?? [];
    if (localMatches.length === 0) {
      errors.push({
        code: 'LTA_STATION_NOT_FOUND',
        ltaId,
        ltaLabel: option.label,
        message: `LTA station "${option.label}" (id ${ltaId}, option ${option.id}) has no matching local station`,
      });
      continue;
    }
    if (localMatches.length > 1) {
      errors.push({
        code: 'AMBIGUOUS_STATION',
        ltaId,
        ltaLabel: option.label,
        message: `LTA station "${option.label}" (id ${ltaId}, option ${option.id}) matches multiple local stations: ${localMatches.join(', ')}`,
      });
      continue;
    }

    const stationName = localMatches[0];
    const normalizedLocalName = normalizeStationLabel(stationName);
    const previousStationForId = mappedLtaIds.get(ltaId);
    if (previousStationForId && normalizeStationLabel(previousStationForId) !== normalizedLocalName) {
      errors.push({
        code: 'AMBIGUOUS_STATION',
        ltaId,
        ltaLabel: option.label,
        stationName,
        message: `LTA station id ${ltaId} maps to both "${previousStationForId}" and "${stationName}"`,
      });
      continue;
    }
    if (previousStationForId) continue;
    if (mappedLocalNames.has(normalizedLocalName)) {
      errors.push({
        code: 'AMBIGUOUS_STATION',
        ltaId,
        ltaLabel: option.label,
        stationName,
        message: `Multiple LTA ids map to local station "${stationName}"`,
      });
      continue;
    }

    mappedLocalNames.add(normalizedLocalName);
    mappedLtaIds.set(ltaId, stationName);
    stations.push({ ltaId, ltaOptionValue: option.id, ltaLabel: option.label, stationName });
  }

  for (const stationName of localStationNames) {
    if (!mappedLocalNames.has(normalizeStationLabel(stationName))) {
      errors.push({
        code: 'LOCAL_STATION_NOT_MAPPED',
        ltaId: '',
        ltaLabel: '',
        stationName,
        message: `Local station "${stationName}" has no LTA station id mapping`,
      });
    }
  }

  stations.sort((a, b) => a.stationName.localeCompare(b.stationName));
  return { stations, errors };
}

export function parseLtaDistanceKm(responseText: string): number {
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error('LTA response was not valid JSON');
  }

  if (!payload || typeof payload !== 'object' || !('distance' in payload)) {
    throw new Error('LTA response did not include a distance field');
  }

  const distanceUnits = Number((payload as { distance: unknown }).distance);
  if (!Number.isFinite(distanceUnits) || distanceUnits < 0) {
    throw new Error(`LTA response had an invalid distance value: ${String((payload as { distance: unknown }).distance)}`);
  }

  // The calculator response uses hundredths of a kilometre (e.g. 710 => 7.10 km).
  return distanceUnits / 100;
}

export function buildOrderedOriginDestinationPairs(
  stations: MappedLtaStation[],
): Array<{ from: MappedLtaStation; to: MappedLtaStation }> {
  const pairs: Array<{ from: MappedLtaStation; to: MappedLtaStation }> = [];
  for (const from of stations) {
    for (const to of stations) {
      if (from.ltaId !== to.ltaId) pairs.push({ from, to });
    }
  }
  return pairs;
}

export function parseLocalStationNames(stationSeedSql: string): string[] {
  const names = Array.from(
    stationSeedSql.matchAll(/^\s*\('((?:[^']|'')*)'\s*,\s*'[^']*'\)/gm),
    (match) => match[1].replace(/''/g, "'"),
  );
  return Array.from(new Set(names));
}

export function generateMrtEdgesSql(
  distances: MrtOriginDestinationDistance[],
  batchSize = 500,
): string {
  if (distances.length === 0) {
    throw new Error('Cannot generate an MRT distance matrix with no rows');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('SQL batch size must be a positive integer');
  }

  const statements = [
    '-- Generated from direct LTA MRT/LRT origin-to-destination distances.',
    '-- Review before applying. This replaces the contents of mrt_edges.',
    'BEGIN;',
    'TRUNCATE TABLE mrt_edges RESTART IDENTITY;',
  ];

  for (let offset = 0; offset < distances.length; offset += batchSize) {
    const batch = distances.slice(offset, offset + batchSize);
    const values = batch.map((row) => {
      if (!Number.isFinite(row.distanceKm) || row.distanceKm < 0) {
        throw new Error(`Invalid distance for ${row.fromStationName} -> ${row.toStationName}`);
      }
      return `    ('${escapeSqlString(row.fromStationName)}', '${escapeSqlString(row.toStationName)}', ${row.distanceKm.toFixed(1)})`;
    });

    statements.push(
      [
        'INSERT INTO mrt_edges (from_station_id, to_station_id, distance_km)',
        'SELECT origin.id, destination.id, od.distance_km',
        'FROM (VALUES',
        values.join(',\n'),
        ') AS od(origin_name, destination_name, distance_km)',
        'JOIN mrt_stations AS origin ON origin.station_name = od.origin_name',
        'JOIN mrt_stations AS destination ON destination.station_name = od.destination_name;',
      ].join('\n'),
    );
  }

  statements.push(
    `DO $$ BEGIN IF (SELECT COUNT(*) FROM mrt_edges) <> ${distances.length} THEN RAISE EXCEPTION 'Expected ${distances.length} MRT distance rows after population'; END IF; END $$;`,
  );
  statements.push('COMMIT;');
  return `${statements.join('\n\n')}\n`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
