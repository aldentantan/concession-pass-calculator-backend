CREATE OR REPLACE FUNCTION add_bidirectional_edge(
    station_1 TEXT,
    station_2 TEXT,
    dist DECIMAL
) RETURNS VOID AS $$
DECLARE
    id_1 INT;
    id_2 INT;
BEGIN
    id_1 := (SELECT id FROM mrt_stations WHERE station_name = station_1);
    id_2 := (SELECT id FROM mrt_stations WHERE station_name = station_2);

    -- Insert both directions
    INSERT INTO mrt_edges (from_station_id, to_station_id, distance_km)
    VALUES (id_1, id_2, dist)
    ON CONFLICT DO NOTHING;

    INSERT INTO mrt_edges (from_station_id, to_station_id, distance_km)
    VALUES (id_2, id_1, dist)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- East West Line
SELECT add_bidirectional_edge('Changi Airport', 'Expo', 4.5);
SELECT add_bidirectional_edge('Expo', 'Tanah Merah', 1.9);

SELECT add_bidirectional_edge('Pasir Ris', 'Tampines', 2.4);
SELECT add_bidirectional_edge('Tampines', 'Simei', 1.4);
SELECT add_bidirectional_edge('Simei', 'Tanah Merah', 2.5);
SELECT add_bidirectional_edge('Tanah Merah', 'Bedok', 1.9);
SELECT add_bidirectional_edge('Bedok', 'Kembangan', 2.0);
SELECT add_bidirectional_edge('Kembangan', 'Eunos', 1.1);
SELECT add_bidirectional_edge('Eunos', 'Paya Lebar', 1.1);
SELECT add_bidirectional_edge('Paya Lebar', 'Aljunied', 1.2);
SELECT add_bidirectional_edge('Aljunied', 'Kallang', 1.4);
SELECT add_bidirectional_edge('Kallang', 'Lavender', 1.1);
SELECT add_bidirectional_edge('Lavender', 'Bugis', 1.1);
SELECT add_bidirectional_edge('Bugis', 'City Hall', 1.0);
SELECT add_bidirectional_edge('City Hall', 'Raffles Place', 1.0);
SELECT add_bidirectional_edge('Raffles Place', 'Tanjong Pagar', 1.2);
SELECT add_bidirectional_edge('Tanjong Pagar', 'Outram Park', 1.0);
SELECT add_bidirectional_edge('Outram Park', 'Tiong Bahru', 1.5);
SELECT add_bidirectional_edge('Tiong Bahru', 'Redhill', 1.2);
SELECT add_bidirectional_edge('Redhill', 'Queenstown', 1.4);
SELECT add_bidirectional_edge('Queenstown', 'Commonwealth', 1.2);
SELECT add_bidirectional_edge('Commonwealth', 'Buona Vista', 1.1);
SELECT add_bidirectional_edge('Buona Vista', 'Dover', 1.4);
SELECT add_bidirectional_edge('Dover', 'Clementi', 1.7);
SELECT add_bidirectional_edge('Clementi', 'Jurong East', 3.5);
SELECT add_bidirectional_edge('Jurong East', 'Chinese Garden', 1.5);
SELECT add_bidirectional_edge('Chinese Garden', 'Lakeside', 1.4);
SELECT add_bidirectional_edge('Lakeside', 'Boon Lay', 1.8);
SELECT add_bidirectional_edge('Boon Lay', 'Pioneer', 0.9);
SELECT add_bidirectional_edge('Pioneer', 'Joo Koon', 2.6);
SELECT add_bidirectional_edge('Joo Koon', 'Gul Circle', 2.3);
SELECT add_bidirectional_edge('Gul Circle', 'Tuas Crescent', 1.7);
SELECT add_bidirectional_edge('Tuas Crescent', 'Tuas West Road', 1.4);
SELECT add_bidirectional_edge('Tuas West Road', 'Tuas Link', 1.3);

-- North East Line
SELECT add_bidirectional_edge('Punggol Coast', 'Punggol', 1.6);
SELECT add_bidirectional_edge('Punggol', 'Sengkang', 1.7);
SELECT add_bidirectional_edge('Sengkang', 'Buangkok', 1.1);
SELECT add_bidirectional_edge('Buangkok', 'Hougang', 1.3);
SELECT add_bidirectional_edge('Hougang', 'Kovan', 1.5);
SELECT add_bidirectional_edge('Kovan', 'Serangoon', 1.7);
SELECT add_bidirectional_edge('Serangoon', 'Woodleigh', 1.2);
SELECT add_bidirectional_edge('Woodleigh', 'Potong Pasir', 0.9);
SELECT add_bidirectional_edge('Potong Pasir', 'Boon Keng', 1.6);
SELECT add_bidirectional_edge('Boon Keng', 'Farrer Park', 1.2);
SELECT add_bidirectional_edge('Farrer Park', 'Little India', 0.8);
SELECT add_bidirectional_edge('Little India', 'Dhoby Ghaut', 1.0);
SELECT add_bidirectional_edge('Dhoby Ghaut', 'Clarke Quay', 1.4);
SELECT add_bidirectional_edge('Clarke Quay', 'Chinatown', 0.6);
SELECT add_bidirectional_edge('Chinatown', 'Outram Park', 0.7);
SELECT add_bidirectional_edge('Outram Park', 'HarbourFront', 2.6);

-- Circle Line
SELECT add_bidirectional_edge('Promenade', 'Bayfront', 1.3);
SELECT add_bidirectional_edge('Bayfront', 'Marina Bay', 0.8);

SELECT add_bidirectional_edge('Dhoby Ghaut', 'Bras Basah', 0.6);
SELECT add_bidirectional_edge('Bras Basah', 'Esplanade', 0.7);
SELECT add_bidirectional_edge('Esplanade', 'Promenade', 0.8);
SELECT add_bidirectional_edge('Promenade', 'Nicoll Highway', 0.8);
SELECT add_bidirectional_edge('Nicoll Highway', 'Stadium', 1.5);
SELECT add_bidirectional_edge('Stadium', 'Mountbatten', 0.9);
SELECT add_bidirectional_edge('Mountbatten', 'Dakota', 0.7);
SELECT add_bidirectional_edge('Dakota', 'Paya Lebar', 1.2);
SELECT add_bidirectional_edge('Paya Lebar', 'MacPherson', 1.1);
SELECT add_bidirectional_edge('MacPherson', 'Tai Seng', 1.0);
SELECT add_bidirectional_edge('Tai Seng', 'Bartley', 1.3);
SELECT add_bidirectional_edge('Bartley', 'Serangoon', 1.3);
SELECT add_bidirectional_edge('Serangoon', 'Lorong Chuan', 0.9);
SELECT add_bidirectional_edge('Lorong Chuan', 'Bishan', 1.7);
SELECT add_bidirectional_edge('Bishan', 'Marymount', 1.6);
SELECT add_bidirectional_edge('Marymount', 'Caldecott', 1.2);
SELECT add_bidirectional_edge('Caldecott', 'Botanic Gardens', 3.9);
SELECT add_bidirectional_edge('Botanic Gardens', 'Farrer Road', 1.0);
SELECT add_bidirectional_edge('Farrer Road', 'Holland Village', 1.4);
SELECT add_bidirectional_edge('Holland Village', 'Buona Vista', 0.9);
SELECT add_bidirectional_edge('Buona Vista', 'one-north', 0.8);
SELECT add_bidirectional_edge('one-north', 'Kent Ridge', 0.8);
SELECT add_bidirectional_edge('Kent Ridge', 'Haw Par Villa', 1.4);
SELECT add_bidirectional_edge('Haw Par Villa', 'Pasir Panjang', 1.3);
SELECT add_bidirectional_edge('Pasir Panjang', 'Labrador Park', 1.4);
SELECT add_bidirectional_edge('Labrador Park', 'Telok Blangah', 0.8);
SELECT add_bidirectional_edge('Telok Blangah', 'HarbourFront', 1.5);

-- North South Line
SELECT add_bidirectional_edge('Jurong East', 'Bukit Batok', 2.1);
SELECT add_bidirectional_edge('Bukit Batok', 'Bukit Gombak', 1.2);
SELECT add_bidirectional_edge('Bukit Gombak', 'Choa Chu Kang', 3.3);
SELECT add_bidirectional_edge('Choa Chu Kang', 'Yew Tee', 1.4);
SELECT add_bidirectional_edge('Yew Tee', 'Kranji', 4.1);
SELECT add_bidirectional_edge('Kranji', 'Marsiling', 1.7);
SELECT add_bidirectional_edge('Marsiling', 'Woodlands', 1.5);
SELECT add_bidirectional_edge('Woodlands', 'Admiralty', 1.7);
SELECT add_bidirectional_edge('Admiralty', 'Sembawang', 2.4);
SELECT add_bidirectional_edge('Sembawang', 'Canberra', 1.5);
SELECT add_bidirectional_edge('Canberra', 'Yishun', 1.7);
SELECT add_bidirectional_edge('Yishun', 'Khatib', 1.4);
SELECT add_bidirectional_edge('Khatib', 'Yio Chu Kang', 4.9);
SELECT add_bidirectional_edge('Yio Chu Kang', 'Ang Mo Kio', 1.5);
SELECT add_bidirectional_edge('Ang Mo Kio', 'Bishan', 2.4);
SELECT add_bidirectional_edge('Bishan', 'Braddell', 1.2);
SELECT add_bidirectional_edge('Braddell', 'Toa Payoh', 0.9);
SELECT add_bidirectional_edge('Toa Payoh', 'Novena', 1.5);
SELECT add_bidirectional_edge('Novena', 'Newton', 1.2);
SELECT add_bidirectional_edge('Newton', 'Orchard', 1.2);
SELECT add_bidirectional_edge('Orchard', 'Somerset', 1.0);
SELECT add_bidirectional_edge('Somerset', 'Dhoby Ghaut', 0.8);
SELECT add_bidirectional_edge('Dhoby Ghaut', 'City Hall', 1.0);
SELECT add_bidirectional_edge('City Hall', 'Raffles Place', 1.0);
SELECT add_bidirectional_edge('Raffles Place', 'Marina Bay', 1.0);
SELECT add_bidirectional_edge('Marina Bay', 'Marina South Pier', 1.4);

-- Thomson East Coast Line
SELECT add_bidirectional_edge('Woodlands North', 'Woodlands', 1.4);
SELECT add_bidirectional_edge('Woodlands', 'Woodlands South', 1.4);
SELECT add_bidirectional_edge('Woodlands South', 'Springleaf', 4.4);
SELECT add_bidirectional_edge('Springleaf', 'Lentor', 2.6);
SELECT add_bidirectional_edge('Lentor', 'Mayflower', 1.7);
SELECT add_bidirectional_edge('Mayflower', 'Bright Hill', 1.1);
SELECT add_bidirectional_edge('Bright Hill', 'Upper Thomson', 1.4);
SELECT add_bidirectional_edge('Upper Thomson', 'Caldecott', 2.2);
SELECT add_bidirectional_edge('Caldecott', 'Stevens', 3.0);
SELECT add_bidirectional_edge('Stevens', 'Napier', 1.7);
SELECT add_bidirectional_edge('Napier', 'Orchard Boulevard', 0.9);
SELECT add_bidirectional_edge('Orchard Boulevard', 'Orchard', 1.0);
SELECT add_bidirectional_edge('Orchard', 'Great World', 1.0);
SELECT add_bidirectional_edge('Great World', 'Havelock', 0.7);
SELECT add_bidirectional_edge('Havelock', 'Outram Park', 1.0);
SELECT add_bidirectional_edge('Outram Park', 'Maxwell', 0.6);
SELECT add_bidirectional_edge('Maxwell', 'Shenton Way', 0.8);
SELECT add_bidirectional_edge('Shenton Way', 'Marina Bay', 0.7);
SELECT add_bidirectional_edge('Marina Bay', 'Gardens by the Bay', 1.7);
SELECT add_bidirectional_edge('Gardens by the Bay', 'Tanjong Rhu', 2.8);
SELECT add_bidirectional_edge('Tanjong Rhu', 'Katong Park', 1.5);
SELECT add_bidirectional_edge('Katong Park', 'Tanjong Katong', 1.3);
SELECT add_bidirectional_edge('Tanjong Katong', 'Marine Parade', 1.0);
SELECT add_bidirectional_edge('Marine Parade', 'Marine Terrace', 1.2);
SELECT add_bidirectional_edge('Marine Terrace', 'Siglap', 1.6);
SELECT add_bidirectional_edge('Siglap', 'Bayshore', 1.4);

-- Downtown Line
SELECT add_bidirectional_edge('Bukit Panjang', 'Cashew', 1.2);
SELECT add_bidirectional_edge('Cashew', 'Hillview', 0.9);
SELECT add_bidirectional_edge('Hillview', 'Hume', 1.0);
SELECT add_bidirectional_edge('Hume', 'Beauty World', 1.7);
SELECT add_bidirectional_edge('Beauty World', 'King Albert Park', 1.2);
SELECT add_bidirectional_edge('King Albert Park', 'Sixth Avenue', 1.6);
SELECT add_bidirectional_edge('Sixth Avenue', 'Tan Kah Kee', 1.3);
SELECT add_bidirectional_edge('Tan Kah Kee', 'Botanic Gardens', 1.1);
SELECT add_bidirectional_edge('Botanic Gardens', 'Stevens', 1.1);
SELECT add_bidirectional_edge('Stevens', 'Newton', 1.6);
SELECT add_bidirectional_edge('Newton', 'Little India', 1.4);
SELECT add_bidirectional_edge('Little India', 'Rochor', 0.5);
SELECT add_bidirectional_edge('Rochor', 'Bugis', 0.8);
SELECT add_bidirectional_edge('Bugis', 'Promenade', 0.9);
SELECT add_bidirectional_edge('Promenade', 'Bayfront', 1.3);
SELECT add_bidirectional_edge('Bayfront', 'Downtown', 0.9);
SELECT add_bidirectional_edge('Downtown', 'Telok Ayer', 0.6);
SELECT add_bidirectional_edge('Telok Ayer', 'Chinatown', 0.6);
SELECT add_bidirectional_edge('Chinatown', 'Fort Canning', 1.0);
SELECT add_bidirectional_edge('Fort Canning', 'Bencoolen', 1.0);
SELECT add_bidirectional_edge('Bencoolen', 'Jalan Besar', 0.9);
SELECT add_bidirectional_edge('Jalan Besar', 'Bendemeer', 1.3);
SELECT add_bidirectional_edge('Bendemeer', 'Geylang Bahru', 1.4);
SELECT add_bidirectional_edge('Geylang Bahru', 'Mattar', 1.5);
SELECT add_bidirectional_edge('Mattar', 'MacPherson', 0.8);
SELECT add_bidirectional_edge('MacPherson', 'Ubi', 1.1);
SELECT add_bidirectional_edge('Ubi', 'Kaki Bukit', 1.2);
SELECT add_bidirectional_edge('Kaki Bukit', 'Bedok North', 1.1);
SELECT add_bidirectional_edge('Bedok North', 'Bedok Reservoir', 1.8);
SELECT add_bidirectional_edge('Bedok Reservoir', 'Tampines West', 1.7);
SELECT add_bidirectional_edge('Tampines West', 'Tampines', 1.3);
SELECT add_bidirectional_edge('Tampines', 'Tampines East', 1.4);
SELECT add_bidirectional_edge('Tampines East', 'Upper Changi', 2.6);
SELECT add_bidirectional_edge('Upper Changi', 'Expo', 0.9);

-- Bukit Panjang LRT
SELECT add_bidirectional_edge('Choa Chu Kang', 'South View', 0.6);
SELECT add_bidirectional_edge('South View', 'Keat Hong', 0.5);
SELECT add_bidirectional_edge('Keat Hong', 'Teck Whye', 0.6);
SELECT add_bidirectional_edge('Teck Whye', 'Phoenix', 0.5);
SELECT add_bidirectional_edge('Phoenix', 'Bukit Panjang', 0.7);
SELECT add_bidirectional_edge('Bukit Panjang', 'Petir', 0.4);
SELECT add_bidirectional_edge('Petir', 'Pending', 0.6);
SELECT add_bidirectional_edge('Pending', 'Bangkit', 0.5);
SELECT add_bidirectional_edge('Bangkit', 'Fajar', 0.9);
SELECT add_bidirectional_edge('Fajar', 'Segar', 0.5);
SELECT add_bidirectional_edge('Segar', 'Jelapang', 0.7);
SELECT add_bidirectional_edge('Jelapang', 'Senja', 0.6);
SELECT add_bidirectional_edge('Senja', 'Bukit Panjang', 0.6);

-- Sengkang LRT
SELECT add_bidirectional_edge('Sengkang', 'Cheng Lim', 0.8);
SELECT add_bidirectional_edge('Cheng Lim', 'Farmway', 0.5);
SELECT add_bidirectional_edge('Farmway', 'Kupang', 0.9);
SELECT add_bidirectional_edge('Kupang', 'Thanggam', 0.7);
SELECT add_bidirectional_edge('Thanggam', 'Fernvale', 0.6);
SELECT add_bidirectional_edge('Fernvale', 'Layar', 0.5);
SELECT add_bidirectional_edge('Layar', 'Tongkang', 0.7);
SELECT add_bidirectional_edge('Tongkang', 'Renjong', 0.6);
SELECT add_bidirectional_edge('Renjong', 'Sengkang', 0.9);

SELECT add_bidirectional_edge('Sengkang', 'Compassvale', 0.8);
SELECT add_bidirectional_edge('Compassvale', 'Rumbia', 0.7);
SELECT add_bidirectional_edge('Rumbia', 'Bakau', 0.5);
SELECT add_bidirectional_edge('Bakau', 'Kangkar', 0.6);
SELECT add_bidirectional_edge('Kangkar', 'Ranggung', 0.8);
SELECT add_bidirectional_edge('Ranggung', 'Sengkang', 1.0);

-- Punggol LRT
SELECT add_bidirectional_edge('Punggol', 'Sam Kee', 0.6);
SELECT add_bidirectional_edge('Sam Kee', 'Teck Lee', 0.4);
SELECT add_bidirectional_edge('Teck Lee', 'Punggol Point', 0.5);
SELECT add_bidirectional_edge('Punggol Point', 'Samudera', 0.6);
SELECT add_bidirectional_edge('Samudera', 'Nibong', 0.5);
SELECT add_bidirectional_edge('Nibong', 'Sumang', 0.4);
SELECT add_bidirectional_edge('Sumang', 'Soo Teck', 0.4);
SELECT add_bidirectional_edge('Soo Teck', 'Punggol', 1.0);

SELECT add_bidirectional_edge('Punggol', 'Cove', 1.0);
SELECT add_bidirectional_edge('Cove', 'Meridian', 0.4);
SELECT add_bidirectional_edge('Meridian', 'Coral Edge', 0.5);
SELECT add_bidirectional_edge('Coral Edge', 'Riviera', 0.5);
SELECT add_bidirectional_edge('Riviera', 'Kadaloor', 0.7);
SELECT add_bidirectional_edge('Kadaloor', 'Oasis', 0.5);
SELECT add_bidirectional_edge('Oasis', 'Damai', 0.6);
SELECT add_bidirectional_edge('Damai', 'Punggol', 0.9);

-- Clean up
DROP FUNCTION add_bidirectional_edge(TEXT, TEXT, DECIMAL);