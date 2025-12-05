import sql from "../db";
import type { MrtStation, MrtEdge } from "../types";

export class MrtRepository {
  async getAllStations(): Promise<MrtStation[]> {
    return await sql<MrtStation[]>`
            SELECT id, station_name AS name
            FROM mrt_stations
        `;
  }

  async getAllEdges(): Promise<MrtEdge[]> {
    return await sql<MrtEdge[]>`
            SELECT from_station_id AS "fromStationId", to_station_id AS "toStationId", distance_km AS "distanceKm"
            FROM mrt_edges
        `;
  }

  /**
   * Retrieves the MRT station row ID given the station name.
   *
   * @param station_name The MRT station name
   * @returns The row ID of the MRT station in the mrt_stations table
   */
  async getStationIdByName(station_name: string): Promise<number | null> {
    const result = await sql<{ id: number }[]>`
            SELECT id
            FROM mrt_stations
            WHERE station_name = ${station_name}
        `;
    return result.length > 0 ? result[0].id : null;
  }

  async getDistanceBetweenStations(
    from_station_id: number,
    to_station_id: number
  ): Promise<number | null> {
    const result = await sql<{ distance_km: number }[]>`
            SELECT distance_km::float
            FROM mrt_edges
            WHERE from_station_id = ${from_station_id}
              AND to_station_id = ${to_station_id}
        `;
    return result.length > 0 ? Number(result[0].distance_km) : null;
  }
}

export const mrtRepository = new MrtRepository();