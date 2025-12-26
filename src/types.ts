export interface Trip {
  time: string;
  type: 'mrt' | 'bus';
  busService?: string;
  startLocation: string;
  endLocation: string;
  fare: number;
  distance: number;
}

export interface Journey {
    date: string;
    day: string;
    startLocation: string;
    endLocation: string;
    trips: Trip[];
    tripIssues: TripIssue[];
    mrtDistance: number;
    busDistance: number;
    totalDistance: number;
    totalFare: number;
}

export interface MrtStation {
  id: number;
  name: string;
}

export interface MrtEdge {
  fromStationId: number;
  toStationId: number;
  distanceKm: number;
}

export interface FareTable {
  service_type: string;
  commuter_type: string;
  min_distance_km: number;
  max_distance_km: number;
  fare: number;
}

export interface TripIssue {
  code: 'BUS_STOP_NOT_FOUND' | 'MRT_STATION_NOT_FOUND';
  message: string;
  tripIndex?: number;
  busService?: string;
  unknownStopName: string;
}