import sql from "../db";

export class BusRepository {
  /**
   * Retrieves the unique 5-digit code for a given bus stop name.
   * There might be multiple bus stops with the same name so if duplicate names exist, all codes are returned in a list.
   *
   * @param bus_stop_name Bus Stop Name
   * @returns List of all Bus Stop 5-digit unique codes that matches the Bus Stop Name
   */
  async getBusStopCodes(bus_stop_name: string): Promise<string[] | null> {
    const result = await sql<{ bus_stop_code: string }[]>`
            SELECT bus_stop_code
            FROM lta_bus_stops
            WHERE bus_stop_name = ${bus_stop_name}
        `;
    if (result.length > 0) {
      return result.map((r) => r.bus_stop_code);
    } else {
      return null;
    }
  }

  /**
   * Get bus route information for specific stops on a bus service
   * Returns ALL matching stops (handles duplicates)
   *
   * @param service_no Bus Service Number
   * @param bus_stop_codes List of Bus Stop Codes to look up
   * @returns List of bus route details for the specified stops that are served by the specified bus service
   */
  async getRouteStops(
    service_no: string,
    bus_stop_codes: string[]
  ): Promise<
    Array<{
      bus_stop_code: string;
      bus_stop_sequence: number;
      bus_stop_distance_km: number;
      direction: number;
    }>
  > {
    if (bus_stop_codes.length === 0) {
      return [];
    }

    return await sql`
      SELECT
        bus_stop_code,
        bus_stop_sequence,
        bus_stop_distance_km,
        direction
      FROM lta_bus_routes
      WHERE bus_service_no = ${service_no}
        AND bus_stop_code = ANY(${bus_stop_codes})
      ORDER BY direction, bus_stop_sequence
    `;
  }
}
