import { busRepository } from "../repositories/busRepository";
import { busStopFuzzyMatchService } from "./busStopFuzzyMatchService";

class BusTripDistanceService {
    async calculateBusTripDistance(busService: string, startStopName: string, endStopName: string): Promise<number> {
        // Implementation for calculating bus trip distance

        // Need to handle edge case of duplicate bus stop names in the same service
        // Fetch all bus stop codes for the given bus stop names
        // Choose the nearest valid bus stop that is closest to the non-duplicate source/dest bus stop
        let startBusStopCodes: string[] | null = await busRepository.getBusStopCodes(startStopName);
        let endBusStopCodes: string[] | null = await busRepository.getBusStopCodes(endStopName);

        if (!startBusStopCodes) {
            // Fuzzy matching
            startBusStopCodes = await busStopFuzzyMatchService.findBusStop(startStopName);
            if (startBusStopCodes) {
                // Hardcoded fix for Woodlands Checkpoint having the same bus stop names
                // 46101 is the bus stop to alight to cross to JB, 46109 is the bus stop after coming back from JB to go home
                if (startBusStopCodes[0] === "46101") startBusStopCodes = ["46109"];
                console.log(`Fuzzy matched start bus stop: ${startBusStopCodes}`);
            } else {
                console.log(`Bus stop codes still not found for ${startStopName}`);
                return 0;
            }
        }

        if (!endBusStopCodes) {
            console.log(`Bus stop codes not found for ${endStopName}`);
            endBusStopCodes = await busStopFuzzyMatchService.findBusStop(endStopName);
            if (endBusStopCodes) {
                console.log(`Fuzzy matched end bus stop: ${endBusStopCodes}`);
            } else {
                console.log(`Bus stop codes still not found for ${endStopName}`);
                return 0;
            }
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
                        console.log(`Calculated bus trip distance for service ${busService} from ${startStopName} to ${endStopName}: ${roundedDistance} km`);
                        return roundedDistance;
                    }
                }
            }
        }
        return 0;
    }
}

export const busTripDistanceService = new BusTripDistanceService();