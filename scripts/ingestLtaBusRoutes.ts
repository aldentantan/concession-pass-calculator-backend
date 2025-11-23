import sql from "../src/db";
import "dotenv/config";

const LTA_API_URL = "https://datamall2.mytransport.sg/ltaodataservice/BusRoutes";
const LTA_API_KEY = process.env.LTA_API_ACCOUNT_KEY!;

if (!LTA_API_KEY) {
  console.error("❌ LTA_API_ACCOUNT_KEY is not set in environment variables.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in environment variables.");
  process.exit(1);
}

interface BusRouteRecord {
  ServiceNo: string | null;
  Operator: string | null;
  Direction: number | null;
  StopSequence: number | null;
  BusStopCode: string | null;
  Distance: number | null;
  WD_FirstBus: string | null;
  WD_LastBus: string | null;
  SAT_FirstBus: string | null;
  SAT_LastBus: string | null;
  SUN_FirstBus: string | null;
  SUN_LastBus: string | null;
}

async function fetchBusRoutesPage(skip: number): Promise<BusRouteRecord[]> {
  const url = `${LTA_API_URL}?$skip=${skip}`;
  console.log(`🌐 Fetching BusRoutes with $skip=${skip}...`);

  const res = await fetch(url, {
    headers: {
      AccountKey: LTA_API_KEY,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LTA BusRoutes fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.value ?? []) as BusRouteRecord[];
}

async function ingestBusRoutes() {
  let skip = 0;
  let totalValid = 0;
  let skipped = 0;

  try {
    while (true) {
      const page = await fetchBusRoutesPage(skip);

      if (page.length === 0) {
        console.log("✅ No more records returned. Ingestion complete.");
        break;
      }

      console.log(`📦 Received ${page.length} records, upserting into DB...`);
      console.log("Sample record:", page[0]);

      // Filter out records that are missing required fields
      const validRecords = page.filter((r) => {
        const serviceNo = r.ServiceNo?.trim();
        const direction = r.Direction;
        const stopSeq = r.StopSequence;
        const busStopCode = r.BusStopCode?.trim();
        const distance = r.Distance;

        const isValid =
          !!serviceNo &&
          typeof direction === "number" &&
          typeof stopSeq === "number" &&
          !!busStopCode &&
          typeof distance === "number";

        if (!isValid) {
          console.warn("⚠️ Skipping invalid route record:", r);
          skipped++;
        }

        return isValid;
      });

      if (validRecords.length === 0) {
        console.log("⚠️ No valid records in this batch, moving to next page...");
        skip += 500;
        continue;
      }

      // Insert/upsert in a transaction
      await sql.begin(async (tx) => {
        for (const r of validRecords) {
          const serviceNo = r.ServiceNo!.trim();
          const direction = r.Direction as number;
          const stopSeq = r.StopSequence as number;
          const busStopCode = r.BusStopCode!.trim();
          const distanceKm = r.Distance as number;

          // Extra safety: guard again right before insert
          if (
            !serviceNo ||
            !busStopCode ||
            typeof direction !== "number" ||
            typeof stopSeq !== "number" ||
            typeof distanceKm !== "number"
          ) {
            console.error("❌ Encountered invalid row inside tx, skipping:", {
              serviceNo,
              direction,
              stopSeq,
              busStopCode,
              distanceKm,
              original: r,
            });
            skipped++;
            continue;
          }

          await tx`
            INSERT INTO lta_bus_routes (
              bus_service_no,
              direction,
              bus_stop_code,
              bus_stop_sequence,
              bus_stop_distance_km
            )
            VALUES (
              ${serviceNo},
              ${direction},
              ${busStopCode},
              ${stopSeq},
              ${distanceKm}
            )
            ON CONFLICT (bus_service_no, direction, bus_stop_sequence)
            DO UPDATE SET
              bus_stop_code = EXCLUDED.bus_stop_code,
              bus_stop_distance_km = EXCLUDED.bus_stop_distance_km;
          `;
        }
      });

      totalValid += validRecords.length;
      console.log(
        `✅ Upserted ${validRecords.length} valid bus route rows (total so far: ${totalValid})`
      );

      skip += 500;

      // Optional: small delay to avoid hammering the API
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log("🎉 Finished ingesting BusRoutes.");
    console.log(`📊 Total valid processed: ${totalValid}`);
    console.log(`⚠️ Total skipped: ${skipped}`);
  } catch (err) {
    console.error("❌ Ingestion failed:", err);
  } finally {
    await sql.end();
  }
}

// Run the script
ingestBusRoutes().catch((err) => {
  console.error("❌ Top-level error:", err);
  process.exit(1);
});
