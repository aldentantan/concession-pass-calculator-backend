import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import sql from '../src/db';
import { mrtRepository } from '../src/repositories/mrtRepository';
import { mrtTripDistanceService } from '../src/services/mrtTripDistanceService';

// These tests read the live mrt_stations and mrt_edges tables (SELECT only).

after(async () => {
  await sql.end({ timeout: 5 });
});

async function exactStationId(stationName: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM mrt_stations WHERE station_name = ${stationName}
  `;
  assert.equal(rows.length, 1, `Expected exactly one mrt_stations row named ${stationName}`);
  return rows[0].id;
}

test('station names resolve to the exact station, not a longer name containing it', async () => {
  // Each of these is a substring of other station names, e.g. Orchard / Orchard Boulevard.
  for (const stationName of ['Orchard', 'Bedok', 'Punggol', 'Tampines', 'Woodlands']) {
    assert.equal(
      await mrtRepository.getStationIdByName(stationName),
      await exactStationId(stationName),
      `${stationName} resolved to the wrong station`,
    );
  }
});

test('station name matching ignores case', async () => {
  assert.equal(await mrtRepository.getStationIdByName('orchard'), await exactStationId('Orchard'));
  assert.equal(await mrtRepository.getStationIdByName('PUNGGOL COAST'), await exactStationId('Punggol Coast'));
});

test('partial and unknown station names do not resolve', async () => {
  assert.equal(await mrtRepository.getStationIdByName('Orch'), null);
  assert.equal(await mrtRepository.getStationIdByName('Not A Station'), null);
});

test('trip distance uses the exact origin and destination stations', async () => {
  // Orchard Boulevard -> Serangoon is 9.3 km; Orchard -> Serangoon is 8.3 km.
  assert.equal(await mrtTripDistanceService.getDistanceKm('Orchard', 'Serangoon'), 8.3);
});
