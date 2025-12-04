import sql from '../db';
import type { FareTable } from '../types';

export class FareTableRepository {
    async getFaresByCommuterType(commuter_type: string): Promise<FareTable[]> {
        commuter_type = 'adult'; // Temporary hardcode until commuter type handling is implemented
        return await sql<FareTable[]>`
            SELECT service_type, commuter_type, min_distance_km, max_distance_km, fare
            FROM fare_table
            WHERE commuter_type = ${commuter_type}
        `;
    }

    async calculateFareByDistance(distance: number): Promise<number> {
        return await sql<{ fare: number }[]>`
            SELECT fare
            FROM fare_table
            WHERE ${distance} BETWEEN min_distance_km AND max_distance_km
            ORDER BY fare ASC
            LIMIT 1
        `.then(results => results[0]?.fare || 0);
    }
}