import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOrderedOriginDestinationPairs,
  generateMrtEdgesSql,
  mapLtaStationOptions,
  parseLtaDistanceKm,
  parseLocalStationNames,
} from '../scripts/mrtOriginDestinationData';

test('LTA station option IDs map to normalized local station names', () => {
  const mapping = mapLtaStationOptions(
    [
      { id: '104_68', label: 'Hougang (NE14)' },
      { id: '105_69', label: 'Kovan (NE13)' },
      { id: '104_68', label: 'Hougang (NE14)' },
    ],
    ['Hougang', 'Kovan'],
  );

  assert.deepEqual(mapping.errors, []);
  assert.deepEqual(mapping.stations, [
    { ltaId: '104', ltaOptionValue: '104_68', ltaLabel: 'Hougang (NE14)', stationName: 'Hougang' },
    { ltaId: '105', ltaOptionValue: '105_69', ltaLabel: 'Kovan (NE13)', stationName: 'Kovan' },
  ]);
});

test('unmapped LTA options and local stations include IDs and labels for err.txt', () => {
  const mapping = mapLtaStationOptions(
    [
      { id: '104_68', label: 'Unknown Station (XX1)' },
      { id: 'invalid', label: 'Kovan (NE13)' },
    ],
    ['Kovan', 'Hougang'],
  );

  assert.ok(mapping.errors.some((error) =>
    error.code === 'LTA_STATION_NOT_FOUND' &&
    error.ltaId === '104' &&
    error.ltaLabel === 'Unknown Station (XX1)',
  ));
  assert.ok(mapping.errors.some((error) =>
    error.code === 'INVALID_LTA_ID' && error.ltaId === 'invalid' && error.ltaLabel === 'Kovan (NE13)',
  ));
  assert.ok(mapping.errors.some((error) =>
    error.code === 'LOCAL_STATION_NOT_MAPPED' && error.stationName === 'Hougang',
  ));
});

test('LTA distance responses are converted from hundredths of a kilometre', () => {
  assert.equal(parseLtaDistanceKm('{"distance":"710"}'), 7.1);
  assert.throws(() => parseLtaDistanceKm('<html>error</html>'), /valid JSON/);
  assert.throws(() => parseLtaDistanceKm('{"fare":"168"}'), /distance field/);
});

test('all ordered station pairs are generated once, excluding same-station pairs', () => {
  const stations = [
    { ltaId: '1', ltaOptionValue: '1_1', ltaLabel: 'Alpha', stationName: 'Alpha' },
    { ltaId: '2', ltaOptionValue: '2_2', ltaLabel: 'Beta', stationName: 'Beta' },
    { ltaId: '3', ltaOptionValue: '3_3', ltaLabel: 'Gamma', stationName: 'Gamma' },
  ];
  const pairs = buildOrderedOriginDestinationPairs(stations);

  assert.equal(pairs.length, 6);
  assert.deepEqual(
    pairs.map(({ from, to }) => `${from.stationName}->${to.stationName}`),
    ['Alpha->Beta', 'Alpha->Gamma', 'Beta->Alpha', 'Beta->Gamma', 'Gamma->Alpha', 'Gamma->Beta'],
  );
});

test('station seed parsing and SQL generation use local station names for each directed row', () => {
  const localNames = parseLocalStationNames(`INSERT INTO mrt_stations VALUES
    ('Kovan', 'NE13'),
    ('Hougang', 'NE14');`);
  assert.deepEqual(localNames, ['Kovan', 'Hougang']);

  const sql = generateMrtEdgesSql([
    { fromStationName: 'Kovan', toStationName: 'Hougang', distanceKm: 1.3 },
    { fromStationName: 'Hougang', toStationName: 'Kovan', distanceKm: 1.3 },
  ]);
  assert.match(sql, /TRUNCATE TABLE mrt_edges RESTART IDENTITY/);
  assert.match(sql, /\('Kovan', 'Hougang', 1\.3\)/);
  assert.match(sql, /\('Hougang', 'Kovan', 1\.3\)/);
  assert.match(sql, /JOIN mrt_stations AS origin ON origin\.station_name = od\.origin_name/);
});
