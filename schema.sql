CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statements (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    filepath TEXT NOT NULL,
    filename TEXT NOT NULL,
    journeys_json JSONB,
    total_fare DECIMAL(10, 2),
    journey_count INT,
    statement_month TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statements_user_id ON statements (user_id);

CREATE TABLE IF NOT EXISTS lta_bus_stops (
    id SERIAL PRIMARY KEY,
    bus_stop_code TEXT UNIQUE NOT NULL,     -- "01012"
    bus_stop_name TEXT NOT NULL,            -- "Hotel Grand Pacific"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lta_bus_stops_name ON lta_bus_stops (lower(bus_stop_name));

CREATE TABLE IF NOT EXISTS lta_bus_routes (
    id SERIAL PRIMARY KEY,
    bus_service_no VARCHAR(50) NOT NULL,                -- "53"
    direction INT NOT NULL,                             -- 1 or 2
    bus_stop_code TEXT NOT NULL REFERENCES lta_bus_stops(bus_stop_code),
    bus_stop_sequence INT NOT NULL,                     -- The i-th stop in the route
    bus_stop_distance_km DECIMAL(10, 2) NOT NULL,       -- Distance from starting stop in km
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (bus_service_no, direction, bus_stop_sequence)
);

CREATE INDEX idx_lta_bus_routes_lookup ON lta_bus_routes (bus_service_no, bus_stop_code);

CREATE TABLE IF NOT EXISTS bus_trip_distance_cache (
    id SERIAL PRIMARY KEY,
    bus_service_no VARCHAR(50) NOT NULL,
    from_stop_code TEXT NOT NULL REFERENCES lta_bus_stops(bus_stop_code),
    to_stop_code TEXT NOT NULL REFERENCES lta_bus_stops(bus_stop_code),
    distance_km DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (bus_service_no, from_stop_code, to_stop_code)
);

CREATE INDEX idx_bus_trip_lookup ON bus_trip_distance_cache (bus_service_no, from_stop_code, to_stop_code);

CREATE TABLE IF NOT EXISTS mrt_stations (
    id SERIAL PRIMARY KEY,
    station_name TEXT UNIQUE NOT NULL,          -- "Jurong East", "Raffles Place"
    station_code TEXT NOT NULL,                 -- "NS1", "EW12", "CC1"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mrt_stations_name ON mrt_stations (LOWER(station_name));
CREATE INDEX idx_mrt_stations_code ON mrt_stations (station_code);

-- Adjacent list of edges between MRT stations weighted graph
CREATE TABLE mrt_edges (
  id SERIAL PRIMARY KEY,
  from_station_id INT NOT NULL REFERENCES mrt_stations(id) ON DELETE CASCADE,
  to_station_id INT NOT NULL REFERENCES mrt_stations(id) ON DELETE CASCADE,
  distance_km DECIMAL(10, 1) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_station_id, to_station_id),
  CHECK (from_station_id != to_station_id)
);

CREATE INDEX idx_mrt_edges_from ON mrt_edges (from_station_id);
CREATE INDEX idx_mrt_edges_to ON mrt_edges (to_station_id);

CREATE TABLE IF NOT EXISTS mrt_trip_distance_cache (
    id SERIAL PRIMARY KEY,
    from_station TEXT NOT NULL REFERENCES mrt_stations(station_name),
    to_station TEXT NOT NULL REFERENCES mrt_stations(station_name),
    distance_km DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (from_station, to_station)
);

CREATE INDEX idx_mrt_trip_lookup ON mrt_trip_distance_cache (from_station, to_station);

CREATE TABLE IF NOT EXISTS fare_table (
    id SERIAL PRIMARY KEY,
    service_type TEXT NOT NULL CHECK (service_type IN ('basic', 'express')),
    commuter_type TEXT NOT NULL CHECK (commuter_type IN ('adult', 'student', 'senior/pwd')),
    min_distance_km DECIMAL(10, 1) NOT NULL,
    max_distance_km DECIMAL(10, 1) NOT NULL,
    fare DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (min_distance_km < max_distance_km),
    UNIQUE (service_type, commuter_type, min_distance_km, max_distance_km)
);

CREATE INDEX idx_fare_lookup ON fare_table (service_type, commuter_type, min_distance_km, max_distance_km);