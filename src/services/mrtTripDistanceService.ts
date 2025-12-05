import { mrtRepository } from "../repositories/mrtRepository";
import { mrtGraphService } from "./mrtGraphService";

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

    const adjacency = await mrtGraphService.getAdjacency();
    return this.dijkstra(adjacency, startId, endId);
  }

  private dijkstra(
    adjacency: Map<number, { to: number; weight: number }[]>,
    startId: number,
    endId: number
  ): number | null {
    const dist = new Map<number, number>();
    const visited = new Set<number>();

    // initialise distances
    for (const nodeId of adjacency.keys()) {
      dist.set(nodeId, Infinity);
    }
    dist.set(startId, 0);

    // simple O(V^2) Dijkstra (fine for this graph size)
    while (true) {
      let closestNode: number | null = null;
      let closestDist = Infinity;

      for (const [nodeId, d] of dist.entries()) {
        if (!visited.has(nodeId) && d < closestDist) {
          closestDist = d;
          closestNode = nodeId;
        }
      }
      if (closestNode === null) break;  // no reachable nodes left
      if (closestNode === endId) break; // reached destination

      visited.add(closestNode);

      const neighbours = adjacency.get(closestNode) || [];
      for (const { to, weight } of neighbours) {
        const currentDist = dist.get(closestNode)!;
        const newDist = currentDist + Number(weight);
        if (newDist < (dist.get(to) ?? Infinity)) {
          dist.set(to, newDist);
        }
      }
    }

    const result = dist.get(endId);
    if (result === undefined || !isFinite(result)) return null;
    const roundedDistance = Math.round(result * 100) / 100;
    return roundedDistance;
  }
}

export const mrtTripDistanceService = new MrtTripDistanceService();