import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareBusData, summarizeWarnings, type LtaBusRouteRecord, type LtaBusStopRecord } from '../scripts/ltaBusData';

const stops: LtaBusStopRecord[] = [
  { BusStopCode: '63101', Description: 'Opp Blk 169' },
  { BusStopCode: '62231', Description: "Bef S'pore Girls' Hme" },
  { BusStopCode: '94031', Description: 'Opp Bayshore Stn Exit 3' },
];

function route(stopSequence: number, busStopCode: string, distance: number, overrides: Partial<LtaBusRouteRecord> = {}): LtaBusRouteRecord {
  return { ServiceNo: '55', Direction: 1, StopSequence: stopSequence, BusStopCode: busStopCode, Distance: distance, ...overrides };
}

const routes: LtaBusRouteRecord[] = [route(1, '63101', 0), route(2, '62231', 0.4), route(3, '94031', 10.1)];

test('valid LTA data is converted to table rows with no errors or warnings', () => {
  const result = prepareBusData(stops, routes, null);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.stops[0], { bus_stop_code: '63101', bus_stop_name: 'Opp Blk 169' });
  assert.deepEqual(result.routes[2], {
    bus_service_no: '55',
    direction: 1,
    bus_stop_sequence: 3,
    bus_stop_code: '94031',
    bus_stop_distance_km: 10.1,
  });
});

test('records with missing fields are skipped with a warning', () => {
  const result = prepareBusData(
    [...stops, { BusStopCode: '99999', Description: '  ' }],
    [...routes, route(4, '94031', null as unknown as number)],
    null,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.stops.length, 3);
  assert.equal(result.routes.length, 3);
  assert.ok(result.warnings.some((w) => /1 bus stop record.*missing/i.test(w)), result.warnings.join('\n'));
  assert.ok(result.warnings.some((w) => /1 bus route record.*missing/i.test(w)), result.warnings.join('\n'));
});

test('identical duplicate records from paging are dropped; conflicting duplicates are errors', () => {
  const identical = prepareBusData([...stops, stops[0]], [...routes, routes[1]], null);
  assert.deepEqual(identical.errors, []);
  assert.equal(identical.stops.length, 3);
  assert.equal(identical.routes.length, 3);

  const conflicting = prepareBusData(
    [...stops, { BusStopCode: '63101', Description: 'Blk 169' }],
    [...routes, route(2, '62231', 0.5)],
    null,
  );
  assert.ok(conflicting.errors.some((e) => /63101/.test(e)), conflicting.errors.join('\n'));
  assert.ok(conflicting.errors.some((e) => /55 direction 1 stop 2/.test(e)), conflicting.errors.join('\n'));
});

test('a route stop that is not in the bus stops data is an error', () => {
  const result = prepareBusData(stops, [...routes, route(4, '11111', 11)], null);
  assert.ok(result.errors.some((e) => /11111/.test(e)), result.errors.join('\n'));
});

test('empty datasets are errors', () => {
  assert.ok(prepareBusData([], routes, null).errors.some((e) => /no bus stops/i.test(e)));
  assert.ok(prepareBusData(stops, [], null).errors.some((e) => /no bus routes/i.test(e)));
});

test('distances that go backwards and gaps in stop numbering are warnings, not errors', () => {
  const result = prepareBusData(stops, [route(1, '63101', 0), route(2, '62231', 9), route(4, '94031', 4.3)], null);

  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => /55 direction 1.*backwards.*stop 4.*9 km.*4\.3 km/.test(w)), result.warnings.join('\n'));
  assert.ok(result.warnings.some((w) => /55 direction 1.*stop 3 is missing/.test(w)), result.warnings.join('\n'));
});

test('row counts dropping more than 10% from the current tables are errors', () => {
  const tooFewStops = prepareBusData(stops, routes, { stops: 4, routes: 3 });
  assert.ok(tooFewStops.errors.some((e) => /bus stops.*4.*3/i.test(e)), tooFewStops.errors.join('\n'));

  const tooFewRoutes = prepareBusData(stops, routes, { stops: 3, routes: 4 });
  assert.ok(tooFewRoutes.errors.some((e) => /bus route.*4.*3/i.test(e)), tooFewRoutes.errors.join('\n'));

  assert.deepEqual(prepareBusData(stops, routes, { stops: 3, routes: 3 }).errors, []);
  assert.deepEqual(prepareBusData(stops, routes, { stops: 0, routes: 0 }).errors, []);
});

test('warning output counts stop-numbering gaps and lists other warnings, unless verbose', () => {
  const { warnings } = prepareBusData(
    [...stops, { BusStopCode: '99999', Description: '' }],
    [route(1, '63101', 0), route(3, '62231', 9), route(6, '94031', 4.3)],
    null,
  );

  assert.deepEqual(summarizeWarnings(warnings, false), [
    '  - Skipped 1 bus stop record(s) with missing fields',
    '  - Bus 55 direction 1: distance goes backwards at stop 6 (9 km to 4.3 km)',
    "  - 2 gap(s) in stop numbering (these don't affect distances); rerun with --verbose to list them",
  ]);
  assert.deepEqual(summarizeWarnings(warnings, true), warnings.map((warning) => `  - ${warning}`));
  assert.deepEqual(summarizeWarnings([], false), []);
});
