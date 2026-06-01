import sql from '../db';
import type { CommuterType, FareTable } from '../types';

export class FareTableRepository {
    async getFaresByCommuterType(commuter_type: CommuterType): Promise<FareTable[]> {
        return await sql<FareTable[]>`
            SELECT service_type, commuter_type, min_distance_km, max_distance_km, fare
            FROM fare_table
            WHERE commuter_type = ${commuter_type}
        `;
    }
}
