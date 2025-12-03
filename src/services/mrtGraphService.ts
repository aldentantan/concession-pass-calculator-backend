import { MrtRepository } from "../repositories/mrtRepository";

type AdjEdge = { to: number; weight: number };

export class MrtGraphService {
  private mrtRepository = new MrtRepository();

  // adjacency list: stationId -> [{to_station, weight}, ...]
  private adjacency: Map<number, AdjEdge[]> = new Map();

  private built = false;

  private async buildGraph() {
    if (this.built) return;

    const [stations, edges] = await Promise.all([
      this.mrtRepository.getAllStations(),
      this.mrtRepository.getAllEdges(),
    ]);

    // initialise keys so every stationId has an array
    for (const s of stations) {
      this.adjacency.set(s.id, []);
    }

    for (const e of edges) {
      console.log(e);
      const arr = this.adjacency.get(e.fromStationId);
      if (arr) {
        arr.push({ to: e.toStationId, weight: e.distanceKm });
      }
    }
    console.log("MRT graph built with adjacency list:", this.adjacency);

    this.built = true;
  }

  async getAdjacency(): Promise<Map<number, AdjEdge[]>> {
    await this.buildGraph();
    return this.adjacency;
  }
}
