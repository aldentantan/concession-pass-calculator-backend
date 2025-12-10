import { mrtRepository } from "../repositories/mrtRepository";

type AdjEdge = { to: number; weight: number };

class MrtGraphService {

  // adjacency list: stationId -> [{to_station, weight}, ...]
  private adjacency: Map<number, AdjEdge[]> = new Map();

  private built = false;

  private async buildGraph() {
    if (this.built) return;

    const [stations, edges] = await Promise.all([
      mrtRepository.getAllStations(),
      mrtRepository.getAllEdges(),
    ]);

    // initialise keys so every stationId has an array
    for (const s of stations) {
      this.adjacency.set(s.id, []);
    }

    for (const e of edges) {
      const arr = this.adjacency.get(e.fromStationId);
      if (arr) {
        arr.push({ to: e.toStationId, weight: e.distanceKm });
      }
    }
    this.built = true;
  }

  async getAdjacency(): Promise<Map<number, AdjEdge[]>> {
    await this.buildGraph();
    return this.adjacency;
  }
}

export const mrtGraphService = new MrtGraphService();