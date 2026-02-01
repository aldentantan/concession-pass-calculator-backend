export interface Trip {
  time: string;
  type: 'mrt' | 'bus';
  busService?: string;
  startLocation: string;
  endLocation: string;
  fare: number;
  distance: number;
}

// Trips grouped by their date
export interface DayGroup {
  date: string; // "DD MMM YYYY" format e.g. "01 Oct 2025"
  day: string;
  tripIssues: TripIssue[];
  journeys: Journey[];
  mrtDistance: number;
  busDistance: number;
  totalDistance: number;
  totalFareExcludingBus: number;
  totalFareExcludingMrt: number;
  totalFare: number;
}

export interface Journey {
    trips: Trip[];
    startLocation: string;
    endLocation: string;
    tripIssues: TripIssue[];
    mrtDistance: number;
    busDistance: number;
    fareExcludingBus: number;
    fareExcludingMrt: number;
    totalFare: number;
}

export interface Trip {
  time: string;
  type: 'mrt' | 'bus';
  busService?: string;
  startLocation: string;
  endLocation: string;
  fare: number;
  distance: number;
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