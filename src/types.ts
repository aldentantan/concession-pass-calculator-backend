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
    mrtDistance: number;
    busDistance: number;
    totalDistance: number;
    totalFare: number;
}