import { mrtRepository } from "../repositories/mrtRepository";

class MrtTripDistanceService {
  async getDistanceKm(startName: string, endName: string): Promise<number | null> {
    if (startName === endName) return 0;

    const startId = await mrtRepository.getStationIdByName(startName);
    const endId = await mrtRepository.getStationIdByName(endName);

    if (!startId || !endId) {
      console.warn("Unknown MRT station(s):", { startName, endName });
      return null;
    }

    if (startId === endId) return 0;

    return mrtRepository.getDistanceBetweenStations(startId, endId);
  }
}

export const mrtTripDistanceService = new MrtTripDistanceService();
