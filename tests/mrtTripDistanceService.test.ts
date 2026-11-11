import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mrtRepository } from '../src/repositories/mrtRepository';
import { mrtGraphService } from '../src/services/mrtGraphService';
import { mrtTripDistanceService } from '../src/services/mrtTripDistanceService';

test('MRT distance lookup uses the direct origin-to-destination row', async () => {
  const originalGetStationIdByName = mrtRepository.getStationIdByName;
  const originalGetDistanceBetweenStations = mrtRepository.getDistanceBetweenStations;
  const originalGetAdjacency = mrtGraphService.getAdjacency;

  mrtRepository.getStationIdByName = async (stationName) =>
    stationName === 'Kovan' ? 105 : stationName === 'Punggol Coast' ? 100 : null;
  mrtRepository.getDistanceBetweenStations = async () => 7.1;
  mrtGraphService.getAdjacency = async () => new Map([
    [105, [{ to: 100, weight: 7.2 }]],
    [100, []],
  ]);

  try {
    assert.equal(
      await mrtTripDistanceService.getDistanceKm('Kovan', 'Punggol Coast'),
      7.1,
    );
  } finally {
    mrtRepository.getStationIdByName = originalGetStationIdByName;
    mrtRepository.getDistanceBetweenStations = originalGetDistanceBetweenStations;
    mrtGraphService.getAdjacency = originalGetAdjacency;
  }
});
