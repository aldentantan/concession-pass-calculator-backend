import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  buildOrderedOriginDestinationPairs,
  generateMrtEdgesSql,
  mapLtaStationOptions,
  parseLtaDistanceKm,
  parseLocalStationNames,
  type LtaStationOption,
  type MappedLtaStation,
  type MrtOriginDestinationDistance,
  type StationMappingError,
} from './mrtOriginDestinationData';

const CALCULATOR_URL = 'https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator.html';
const DISTANCE_ENDPOINT = 'https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator/jcr:content/map2-content/farecalculator.mrtget.html';
const KNOWN_LTA_STATION_IDS: Record<string, string> = {
  Hougang: '104',
  Kovan: '105',
};
const UNBUILT_LOCAL_STATIONS = new Set(['Xilin', 'Bedok South', 'Sungei Bedok']);
const REQUEST_TRIP_INFO = [
  'usiAccumulatedDistance1=0',
  'usiAccumulatedDistance2=0',
  'usiAccumulatedDistance3=0',
  'usiAccumulatedDistance4=0',
  'usiAccumulatedDistance5=0',
  'usiAccumulatedDistance6=0',
  'usiAccumulatedFare1=0',
  'usiAccumulatedFare2=0',
  'usiAccumulatedFare3=0',
  'usiAccumulatedFare4=0',
  'usiAccumulatedFare5=0',
  'usiAccumulatedFare6=0',
].join('-');

const scriptsDirectory = __dirname;
const stationSeedPath = path.join(scriptsDirectory, 'populateMrtStations.sql');
const stationMapPath = path.join(scriptsDirectory, 'ltaMrtStationIdMap.json');
const progressPath = path.join(scriptsDirectory, 'mrtOriginDestinationProgress.jsonl');
const sqlOutputPath = path.join(scriptsDirectory, 'populateMrtOriginDestinationDistances.sql');
const errorLogPath = path.join(scriptsDirectory, 'err.txt');

interface ProgressRecord extends MrtOriginDestinationDistance {
  fromLtaId: string;
  toLtaId: string;
  mappingHash: string;
}

async function main(): Promise<void> {
  const delayMs = parseEnvironmentInteger('LTA_MRT_REQUEST_DELAY_MS', 250, 0);
  const batchSize = parseEnvironmentInteger('LTA_MRT_BATCH_SIZE', 6, 1);
  if (batchSize > 6) {
    throw new Error('LTA_MRT_BATCH_SIZE must be between 1 and 6 to match the LTA calculator trip limit');
  }
  const maxRequests = parseOptionalEnvironmentInteger('LTA_MRT_MAX_REQUESTS');
  const mappingOnly = process.env.LTA_MRT_MAPPING_ONLY === '1';
  const forceRefresh = process.env.LTA_MRT_REFRESH === '1';
  const localStationNames = parseLocalStationNames(await fs.readFile(stationSeedPath, 'utf8'));
  if (localStationNames.length === 0) {
    throw new Error(`No local MRT stations found in ${stationSeedPath}`);
  }

  await fs.appendFile(errorLogPath, `\n--- LTA MRT distance generation started ${new Date().toISOString()} ---\n`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const options = await readLtaStationOptions(page, localStationNames);
    const adultFareTypeId = await readAdultFareTypeId(page);
    const mapping = mapLtaStationOptions(options, localStationNames);
    const excludedStations = mapping.errors.filter((error) =>
      error.code === 'LOCAL_STATION_NOT_MAPPED' &&
      error.stationName !== undefined &&
      UNBUILT_LOCAL_STATIONS.has(error.stationName),
    );
    const mappingErrors = mapping.errors.filter((error) => !excludedStations.includes(error));
    await writeStationMap(mapping.stations, mappingErrors, excludedStations, adultFareTypeId);

    for (const error of mappingErrors) {
      await logError({ stage: 'station_mapping', ...error });
    }
    if (mappingErrors.length > 0) {
      throw new Error(`Found ${mappingErrors.length} invalid LTA/local station mappings; see ${errorLogPath}`);
    }

    const knownMappingErrors = mapping.stations
      .filter((station) =>
        station.stationName in KNOWN_LTA_STATION_IDS &&
        KNOWN_LTA_STATION_IDS[station.stationName] !== station.ltaId,
      )
      .map((station) => ({
        code: 'KNOWN_STATION_ID_MISMATCH',
        stationName: station.stationName,
        ltaLabel: station.ltaLabel,
        ltaId: station.ltaId,
        expectedLtaId: KNOWN_LTA_STATION_IDS[station.stationName],
        message: `Expected ${station.stationName} to have LTA id ${KNOWN_LTA_STATION_IDS[station.stationName]}, got ${station.ltaId}`,
      }));
    for (const error of knownMappingErrors) await logError({ stage: 'station_mapping', ...error });
    if (knownMappingErrors.length > 0) {
      throw new Error(`Known station ID validation failed; see ${errorLogPath}`);
    }

    if (mappingOnly) {
      console.log(`Validated ${mapping.stations.length} station ID mappings and wrote ${stationMapPath}`);
      return;
    }

    const pairs = buildOrderedOriginDestinationPairs(mapping.stations);
    const mappingHash = createMappingHash(mapping.stations);
    const completed = forceRefresh ? new Map<string, ProgressRecord>() : await readCompletedDistances(mappingHash);
    const missingPairs = pairs.filter(({ from, to }) => !completed.has(pairKey(from.ltaId, to.ltaId)));
    console.log(`${mapping.stations.length} stations; ${pairs.length} directed pairs; ${completed.size} already complete; ${missingPairs.length} remaining.`);
    console.log(`Sending up to ${batchSize} requests concurrently; ${delayMs} ms between batches. Set LTA_MRT_BATCH_SIZE or LTA_MRT_MAX_REQUESTS to adjust this run.`);
    if (forceRefresh) console.log('Refresh mode enabled; existing progress is ignored for this run.');

    let requestsThisRun = 0;
    let nextProgressLogAt = 100;
    for (let offset = 0; offset < missingPairs.length; offset += batchSize) {
      if (maxRequests !== null && requestsThisRun >= maxRequests) break;
      if (requestsThisRun > 0) await wait(delayMs);
      const remainingRequestCount = maxRequests === null
        ? batchSize
        : Math.min(batchSize, maxRequests - requestsThisRun);
      const batch = missingPairs.slice(offset, offset + remainingRequestCount);
      requestsThisRun += batch.length;

      const results = await Promise.all(batch.map(async ({ from, to }) => {
        try {
          const distanceKm = await fetchDistanceKmWithRetry(page, from, to, adultFareTypeId);
          if (distanceKm === 0) {
            throw new Error('LTA returned zero distance for two different stations');
          }

          return {
            from,
            to,
            record: {
              fromStationName: from.stationName,
              toStationName: to.stationName,
              distanceKm,
              fromLtaId: from.ltaId,
              toLtaId: to.ltaId,
              mappingHash,
            } satisfies ProgressRecord,
          };
        } catch (error) {
          return {
            from,
            to,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }));

      for (const result of results) {
        if ('record' in result && result.record !== undefined) {
          await fs.appendFile(progressPath, `${JSON.stringify(result.record)}\n`);
          completed.set(pairKey(result.from.ltaId, result.to.ltaId), result.record);
        } else {
          await logError({
            stage: 'distance_request',
            originStation: result.from.stationName,
            originLtaId: result.from.ltaId,
            destinationStation: result.to.stationName,
            destinationLtaId: result.to.ltaId,
            message: result.error,
          });
        }
      }

      if (requestsThisRun >= nextProgressLogAt) {
        console.log(`${requestsThisRun} requests attempted; ${completed.size}/${pairs.length} distances saved.`);
        nextProgressLogAt = requestsThisRun + 100;
      }
    }

    const missingAfterRun = pairs.filter(({ from, to }) => !completed.has(pairKey(from.ltaId, to.ltaId)));
    if (missingAfterRun.length > 0) {
      if (maxRequests !== null && requestsThisRun >= maxRequests) {
        console.log(
          `Request cap reached with ${missingAfterRun.length} directed distances remaining. Progress is saved in ${progressPath}; no SQL matrix was generated.`,
        );
        return;
      }
      throw new Error(
        `${missingAfterRun.length} directed distances remain. Progress is saved in ${progressPath}; no SQL matrix was generated.`,
      );
    }

    const distances = pairs.map(({ from, to }) => {
      const record = completed.get(pairKey(from.ltaId, to.ltaId))!;
      return {
        fromStationName: from.stationName,
        toStationName: to.stationName,
        distanceKm: record.distanceKm,
      };
    });
    await fs.writeFile(sqlOutputPath, generateMrtEdgesSql(distances), 'utf8');
    console.log(`Wrote ${distances.length} directed MRT distances to ${sqlOutputPath}`);
  } finally {
    await browser.close();
  }
}

async function readLtaStationOptions(page: Page, localStationNames: string[]): Promise<LtaStationOption[]> {
  await page.goto(CALCULATOR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('select')).some((select) =>
      Array.from((select as HTMLSelectElement).options).some((option) => /\bKovan\b/i.test(option.textContent ?? '')),
    ),
    null,
    { timeout: 30000 },
  );

  const options = await page.locator('select').evaluateAll((selects, names) => {
    const normalizedNames = new Set(names.map((name) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
    return selects.flatMap((element) => {
      const select = element as HTMLSelectElement;
      const selectorHint = `${select.id} ${select.name} ${select.getAttribute('aria-label') ?? ''}`;
      const isStationSelector = /station|origin|destination|(^|\s)from(\s|$)|(^|\s)to(\s|$)/i.test(selectorHint);
      return Array.from(select.options)
        .map((option) => ({ id: option.value.trim(), label: (option.textContent ?? '').trim() }))
        .filter(({ id, label }) => {
          if (!/^\d+(?:_\d+)?$/.test(id) || id === '00') return false;
          const normalizedLabel = label
            .replace(/\s*\([^)]*\)\s*$/, '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase();
          return isStationSelector || normalizedNames.has(normalizedLabel) || /\([A-Z]{1,4}\d+/i.test(label);
        });
    });
  }, localStationNames);

  if (options.length === 0) {
    throw new Error('Could not find numeric MRT/LRT station options in the LTA calculator page');
  }
  return options;
}

async function readAdultFareTypeId(page: Page): Promise<string> {
  const adultOptions = await page.locator('#fareType option').evaluateAll((options) =>
    options
      .map((option) => ({ id: (option as HTMLOptionElement).value.trim(), label: (option.textContent ?? '').trim() }))
      .filter(({ label }) => /^adult$/i.test(label)),
  );
  if (adultOptions.length !== 1 || !/^\d+$/.test(adultOptions[0]?.id ?? '')) {
    const details = JSON.stringify(adultOptions);
    await logError({ stage: 'fare_type_mapping', ltaLabel: 'Adult', ltaId: adultOptions[0]?.id ?? '', message: `Could not identify one numeric Adult fare type option: ${details}` });
    throw new Error('Could not identify the Adult fare type option on the LTA page');
  }
  return adultOptions[0].id;
}

async function fetchDistanceKm(
  page: Page,
  from: MappedLtaStation,
  to: MappedLtaStation,
  adultFareTypeId: string,
): Promise<number> {
  const response = await page.evaluate(async ({ endpoint, params }) => {
    const result = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: new URLSearchParams(params),
    });
    return { ok: result.ok, status: result.status, text: await result.text() };
  }, {
    endpoint: DISTANCE_ENDPOINT,
    params: {
      fare: adultFareTypeId,
      from: from.ltaId,
      to: to.ltaId,
      tripInfo: REQUEST_TRIP_INFO,
      addTripInfo: '0',
    },
  });
  if (!response.ok) {
    throw new Error(`LTA returned HTTP ${response.status}: ${response.text.slice(0, 500)}`);
  }
  return parseLtaDistanceKm(response.text);
}

async function fetchDistanceKmWithRetry(
  page: Page,
  from: MappedLtaStation,
  to: MappedLtaStation,
  adultFareTypeId: string,
): Promise<number> {
  const retries = 4;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchDistanceKm(page, from, to, adultFareTypeId);
    } catch (error) {
      if (attempt >= retries) throw error;
      await wait(Math.min(60000, 1000 * (2 ** attempt)));
    }
  }
}

async function writeStationMap(
  stations: MappedLtaStation[],
  errors: StationMappingError[],
  excludedStations: StationMappingError[],
  adultFareTypeId: string,
): Promise<void> {
  await fs.writeFile(
    stationMapPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      adultFareType: { ltaId: adultFareTypeId, ltaLabel: 'Adult' },
      stations,
      excludedStations: excludedStations.map(({ stationName, message }) => ({ stationName, reason: message })),
      errors,
    }, null, 2)}\n`,
    'utf8',
  );
}

async function readCompletedDistances(mappingHash: string): Promise<Map<string, ProgressRecord>> {
  const completed = new Map<string, ProgressRecord>();
  let content: string;
  try {
    content = await fs.readFile(progressPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return completed;
    throw error;
  }

  for (const [index, line] of content.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as ProgressRecord;
      if (
        record.mappingHash === mappingHash &&
        typeof record.fromLtaId === 'string' &&
        typeof record.toLtaId === 'string' &&
        Number.isFinite(record.distanceKm) &&
        record.distanceKm > 0
      ) {
        completed.set(pairKey(record.fromLtaId, record.toLtaId), record);
      }
    } catch {
      await logError({ stage: 'progress_file', line: index + 1, message: 'Skipped malformed progress line' });
    }
  }
  return completed;
}

function createMappingHash(stations: MappedLtaStation[]): string {
  const normalized = stations
    .map(({ ltaId, stationName }) => `${ltaId}\t${stationName}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(normalized).digest('hex');
}

function pairKey(fromLtaId: string, toLtaId: string): string {
  return `${fromLtaId}->${toLtaId}`;
}

async function logError(error: Record<string, unknown>): Promise<void> {
  await fs.appendFile(errorLogPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...error })}\n`);
}

function parseEnvironmentInteger(name: string, defaultValue: number, minimum: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function parseOptionalEnvironmentInteger(name: string): number | null {
  const value = process.env[name];
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (require.main === module) {
  main().catch(async (error) => {
    await logError({ stage: 'fatal', message: error instanceof Error ? error.message : String(error) });
    console.error(error);
    process.exitCode = 1;
  });
}
