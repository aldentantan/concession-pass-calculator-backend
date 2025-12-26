import { busRepository } from "../repositories/busRepository";
import { busStopFuzzyMatchService } from "./busStopFuzzyMatchService";
import type { TripIssue } from "../types";

type BusTripDistanceResult = {
    distanceKm: number | null;
    issues: TripIssue[];
}

class BusTripDistanceService {
    async calculateBusTripDistance(busService: string, startStopName: string, endStopName: string): Promise<BusTripDistanceResult> {
        const issues: TripIssue[] = [];

        // Need to handle edge case of duplicate bus stop names in the same service
        // Fetch all bus stop codes for the given bus stop names
        // Choose the nearest valid bus stop that is closest to the non-duplicate source/dest bus stop
        let startBusStopCodes: string[] | null = await busRepository.getBusStopCodes(startStopName);
        let endBusStopCodes: string[] | null = await busRepository.getBusStopCodes(endStopName);

        // Fuzzy match if the bus stop name doesn't match the LTA open-data API bus stop names exactly
        if (!startBusStopCodes) {
            startBusStopCodes = await busStopFuzzyMatchService.findBusStop(startStopName);

            // Hardcoded fix for Woodlands Checkpoint having the same bus stop names
            // 46101 is the bus stop to alight to cross to JB, 46109 is the bus stop after coming back from JB to go home
            if (startBusStopCodes?.[0] === "46101") startBusStopCodes = ["46109"];

            if (!startBusStopCodes) {
                issues.push({
                    code: 'BUS_STOP_NOT_FOUND',
                    message: `Could not find bus stop: ${startStopName}`,
                    busService,
                    unknownStopName: startStopName
                })
                // console.log(`Fuzzy matched start bus stop: ${startBusStopCodes}`);
            }
        }

        if (!endBusStopCodes) {
            // console.log(`Bus stop codes not found for ${endStopName}`);
            endBusStopCodes = await busStopFuzzyMatchService.findBusStop(endStopName);
            if (!endBusStopCodes) {
                // console.log(`Fuzzy matched end bus stop: ${endBusStopCodes}`);
                issues.push({
                    code: 'BUS_STOP_NOT_FOUND',
                    message: `Could not find bus stop: ${endStopName}`,
                    busService,
                    unknownStopName: endStopName
                })
            }
        }

        if (!startBusStopCodes || !endBusStopCodes) {
            return {
                distanceKm: null,
                issues
            };
        }

        // Get the bus route information for the specified bus service and stop codes in order to calculate bus trip distance
        const startBusRouteStops = await busRepository.getRouteStops(busService, startBusStopCodes);
        const endBusRouteStops = await busRepository.getRouteStops(busService, endBusStopCodes);

        // Handle edge case of the bus service serves bus stops with the same name
        // Returns the distance of the 2 valid bus stops that are closest to each other
        // i.e. same direction and end stop sequence > start stop sequence
        for (const startStop of startBusRouteStops) {
            for (const endStop of endBusRouteStops) {
                // Ensure both stops are on the same direction
                if (startStop.direction === endStop.direction) {
                    const distance = endStop.bus_stop_distance_km - startStop.bus_stop_distance_km;
                    if (distance > 0) {
                        const roundedDistance = Math.round(distance * 100) / 100;
                        // console.log(`Calculated bus trip distance for service ${busService} from ${startStopName} to ${endStopName}: ${roundedDistance} km`);
                        return {
                            distanceKm: roundedDistance,
                            issues
                        };
                    }
                }
            }
        }
        return {
            distanceKm: null,
            issues
        };
    }
}

export const busTripDistanceService = new BusTripDistanceService();