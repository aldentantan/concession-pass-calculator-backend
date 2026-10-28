import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcessionFareCalculatorService } from '../src/services/concessionFareCalculatorService';
import type { CommuterType, DayGroup, FareTable, Journey, Trip } from '../src/types';

const fareRows: Record<CommuterType, FareTable[]> = {
  adult: [
    { service_type: 'mrt', commuter_type: 'adult', min_distance_km: 0, max_distance_km: 2.99, fare: 0.5 },
    { service_type: 'mrt', commuter_type: 'adult', min_distance_km: 3, max_distance_km: 4.99, fare: 1 },
    { service_type: 'mrt', commuter_type: 'adult', min_distance_km: 5, max_distance_km: 9.99, fare: 2 },
    { service_type: 'mrt', commuter_type: 'adult', min_distance_km: 10, max_distance_km: 100, fare: 3 },
  ],
  student: [
    { service_type: 'mrt', commuter_type: 'student', min_distance_km: 0, max_distance_km: 2.99, fare: 0.25 },
    { service_type: 'mrt', commuter_type: 'student', min_distance_km: 3, max_distance_km: 4.99, fare: 0.5 },
    { service_type: 'mrt', commuter_type: 'student', min_distance_km: 5, max_distance_km: 9.99, fare: 1 },
    { service_type: 'mrt', commuter_type: 'student', min_distance_km: 10, max_distance_km: 100, fare: 1.5 },
  ],
};

function createService(): ConcessionFareCalculatorService {
  return new ConcessionFareCalculatorService({
    getFaresByCommuterType: async (commuterType) => fareRows[commuterType],
  });
}

function createTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    time: '09:00 AM - 09:20 AM',
    type: 'mrt',
    startLocation: 'Kovan',
    endLocation: 'Serangoon',
    fare: 1.25,
    distance: 4,
    ...overrides,
  };
}

function createDayGroup(day: string, trips: Trip[]): DayGroup {
  const mrtDistance = trips
    .filter((trip) => trip.type === 'mrt')
    .reduce((distance, trip) => distance + trip.distance, 0);
  const busDistance = trips
    .filter((trip) => trip.type === 'bus')
    .reduce((distance, trip) => distance + trip.distance, 0);
  const journey: Journey = {
    trips,
    startLocation: trips[0]?.startLocation ?? '',
    endLocation: trips[trips.length - 1]?.endLocation ?? '',
    tripIssues: [],
    fareSource: 'statement',
    statementFare: 1.25,
    mrtDistance,
    busDistance,
    fareExcludingBus: 0,
    fareExcludingMrt: 0,
    totalFare: 0,
  };

  return {
    date: '01 Oct 2025',
    day,
    tripIssues: [],
    journeys: [journey],
    mrtDistance,
    busDistance,
    totalDistance: mrtDistance + busDistance,
    totalFareExcludingBus: 0,
    totalFareExcludingMrt: 0,
    totalFare: trips.reduce((fare, trip) => fare + trip.fare, 0),
  };
}

const timingCases = [
  ['07:29 AM', true],
  ['07:30 AM', false],
  ['07:31 AM', false],
  ['08:59 AM', false],
  ['09:00 AM', true],
  ['09:01 AM', true],
  ['09:44 AM', true],
  ['09:45 AM', true],
  ['09:46 AM', false],
] as const;

test('Northeast off-peak fare timing includes the specified boundaries', async () => {
  for (const [startTime, isFree] of timingCases) {
    const dayGroups = [createDayGroup('Wed', [createTrip({
      time: `${startTime} - 09:20 AM`,
    })])];

    await createService().calculateFaresOnConcession(dayGroups, 'adult');

    assert.equal(
      dayGroups[0].journeys[0].totalFare,
      isFree ? 0 : 1,
      `${startTime} should ${isFree ? 'qualify' : 'not qualify'}`,
    );
  }
});

test('the rule applies on weekdays only and only at selected boarding stations', async () => {
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    const dayGroups = [createDayGroup(day, [createTrip()])];
    await createService().calculateFaresOnConcession(dayGroups, 'adult');
    assert.equal(dayGroups[0].journeys[0].totalFare, 0, `${day} should qualify`);
  }

  for (const day of ['Sat', 'Sun']) {
    const dayGroups = [createDayGroup(day, [createTrip()])];
    await createService().calculateFaresOnConcession(dayGroups, 'adult');
    assert.equal(dayGroups[0].journeys[0].totalFare, 1, `${day} should not qualify`);
  }

  const outsideStation = createDayGroup('Wed', [createTrip({ startLocation: 'Serangoon' })]);
  await createService().calculateFaresOnConcession([outsideStation], 'adult');
  assert.equal(outsideStation.journeys[0].totalFare, 1);

  const lrtStation = createDayGroup('Wed', [createTrip({ startLocation: '  Compassvale ' })]);
  await createService().calculateFaresOnConcession([lrtStation], 'adult');
  assert.equal(lrtStation.journeys[0].totalFare, 0);

  const selectedStations = [
    'Kovan', 'Buangkok', 'Hougang', 'Sengkang', 'Punggol', 'Punggol Coast',
    'Compassvale', 'Rumbia', 'Bakau', 'Kangkar', 'Ranggung', 'Cheng Lim',
    'Farmway', 'Kupang', 'Thanggam', 'Fernvale', 'Layar', 'Tongkang', 'Renjong',
    'Cove', 'Meridian', 'Coral Edge', 'Riviera', 'Kadaloor', 'Oasis', 'Damai',
    'Sam Kee', 'Teck Lee', 'Punggol Point', 'Samudera', 'Nibong', 'Sumang', 'Soo Teck',
  ];
  for (const station of selectedStations) {
    const group = createDayGroup('Wed', [createTrip({ startLocation: station })]);
    await createService().calculateFaresOnConcession([group], 'adult');
    assert.equal(group.journeys[0].totalFare, 0, `${station} should qualify`);
  }
});

test('only the first qualifying MRT trip is free and distance and PDF fares are preserved', async () => {
  const firstTrip = createTrip({ distance: 4, fare: 1.25 });
  const secondTrip = createTrip({
    startLocation: 'Punggol',
    endLocation: 'Hougang',
    distance: 2.5,
    fare: 0.75,
  });
  const busTrip = createTrip({
    type: 'bus',
    startLocation: 'Kovan',
    endLocation: 'Hougang',
    distance: 3,
    fare: 0.5,
  });
  const dayGroup = createDayGroup('Wed', [firstTrip, secondTrip, busTrip]);

  await createService().calculateFaresOnConcession([dayGroup], 'adult');

  const journey = dayGroup.journeys[0];
  assert.equal(journey.mrtDistance, 6.5);
  assert.equal(journey.busDistance, 3);
  assert.equal(journey.totalFare, 2);
  assert.equal(journey.fareExcludingBus, 0.5);
  assert.equal(journey.fareExcludingMrt, 1);
  assert.deepEqual(journey.trips.map((trip) => trip.fare), [1.25, 0.75, 0.5]);
  assert.equal(dayGroup.mrtDistance, 6.5);
  assert.equal(dayGroup.totalFare, 2.5);
});

test('free trip distance is excluded using the selected commuter fare table', async () => {
  const adultDay = createDayGroup('Wed', [createTrip({ distance: 4 })]);
  const studentDay = createDayGroup('Wed', [createTrip({ distance: 4 })]);

  await createService().calculateFaresOnConcession([adultDay], 'adult');
  await createService().calculateFaresOnConcession([studentDay], 'student');

  assert.equal(adultDay.journeys[0].totalFare, 0);
  assert.equal(studentDay.journeys[0].totalFare, 0);

  const studentNonqualifyingDay = createDayGroup('Wed', [createTrip({
    time: '07:30 AM - 07:50 AM',
    distance: 4,
  })]);
  const adultNonqualifyingDay = createDayGroup('Wed', [createTrip({
    time: '07:30 AM - 07:50 AM',
    distance: 4,
  })]);
  await createService().calculateFaresOnConcession([studentNonqualifyingDay], 'student');
  await createService().calculateFaresOnConcession([adultNonqualifyingDay], 'adult');
  assert.equal(studentNonqualifyingDay.journeys[0].totalFare, 0.5);
  assert.equal(adultNonqualifyingDay.journeys[0].totalFare, 1);
});

test('the direct MRT distance keeps the complete journey in the 8.2 km fare band', async () => {
  const service = new ConcessionFareCalculatorService({
    getFaresByCommuterType: async (commuterType) => [
      {
        service_type: 'mrt',
        commuter_type: commuterType,
        min_distance_km: 0,
        max_distance_km: 8.2,
        fare: 1.75,
      },
      {
        service_type: 'mrt',
        commuter_type: commuterType,
        min_distance_km: 8.3,
        max_distance_km: 100,
        fare: 1.82,
      },
    ],
  });
  const dayGroup = createDayGroup('Tue', [
    createTrip({ distance: 7.1 }),
    createTrip({ type: 'bus', distance: 1.1 }),
  ]);

  await service.calculateFaresOnConcession([dayGroup], 'adult');

  assert.equal(dayGroup.journeys[0].mrtDistance, 7.1);
  assert.equal(dayGroup.journeys[0].busDistance, 1.1);
  assert.equal(dayGroup.journeys[0].totalFare, 1.75);
});
