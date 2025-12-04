import { BusRepository } from "../repositories/busRepository";

const busRepository = new BusRepository();

export class BusTripDistanceService {
    async calculateBusTripDistance(busService: string, startStopName: string, endStopName: string): Promise<number> {
        // Implementation for calculating bus trip distance

        // Need to handle edge case of duplicate bus stop names in the same service
        // Fetch all bus stop codes for the given bus stop names
        // Choose the nearest valid bus stop that is closest to the non-duplicate source/dest bus stop
        const startBusStopCodes = await busRepository.getBusStopCodes(startStopName);
        const endBusStopCodes = await busRepository.getBusStopCodes(endStopName);

        if (!startBusStopCodes || !endBusStopCodes) {
            console.log(`Bus stop codes not found for ${startStopName} or ${endStopName}`);
            return 0;
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
                        return roundedDistance;
                    }
                }
            }
        }
        return 0;
    }
}