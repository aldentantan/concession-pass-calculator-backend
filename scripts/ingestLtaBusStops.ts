import sql from "../src/db";
import "dotenv/config";

const LTA_API_URL = "https://datamall2.mytransport.sg/ltaodataservice/BusStops";
const LTA_API_KEY = process.env.LTA_API_ACCOUNT_KEY!;

if (!LTA_API_KEY) {
  console.error("❌ LTA_API_ACCOUNT_KEY is not set in environment variables.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in environment variables.");
  process.exit(1);
}

interface BusStopRecord {
  BusStopCode: string | null;
  RoadName: string | null;
  Description: string | null;
  Latitude: number | null;
  Longitude: number | null;
}

async function fetchBusStopsPage(skip: number): Promise<BusStopRecord[]> {
  const url = `${LTA_API_URL}?$skip=${skip}`;
  console.log(`🌐 Fetching BusStops with $skip=${skip}...`);

  const res = await fetch(url, {
    headers: {
      AccountKey: LTA_API_KEY,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LTA BusStops fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  // console.log("Data fetched: ", data);
  return (data.value ?? []) as BusStopRecord[];
}

async function ingestBusStops() {
  let skip = 0;
  let total = 0;
  let skipped = 0;

  try {
    while (true) {
      const page = await fetchBusStopsPage(skip);

      if (page.length === 0) {
        console.log("✅ No more records returned. Ingestion complete.");
        break;
      }

      console.log(`📦 Received ${page.length} records, upserting into DB...`);
      console.log("Sample record:", page[0]);

      const validRecords = page.filter((r) => {
        const code = r.BusStopCode?.trim();
        const name = r.Description?.trim();
        const isValid = !!code && !!name;

        if (!isValid) {
          console.warn("⚠️ Skipping invalid record:", r);
          skipped++;
        }

        return isValid;
      });

      if (validRecords.length === 0) {
        console.log("⚠️ No valid records in this batch, moving to next page...");
        skip += 500;
        continue;
      }

      // Wrap batch in a transaction for speed
      await sql.begin(async (tx) => {
        for (const r of validRecords) {
          const busStopCode = r.BusStopCode!.trim();
          const busStopName = r.Description!.trim();

          // Extra safety: guard again right before insert
          if (!busStopCode || !busStopName) {
            console.error("❌ Encountered invalid row inside tx, skipping:", {
              busStopCode,
              busStopName,
              original: r,
            });
            skipped++;
            continue;
          }

          await tx`
            INSERT INTO lta_bus_stops (bus_stop_code, bus_stop_name)
            VALUES (${busStopCode}, ${busStopName})
            ON CONFLICT (bus_stop_code)
            DO UPDATE SET
              bus_stop_name = EXCLUDED.bus_stop_name;
          `;
        }
      });

      total += validRecords.length;
      console.log(
        `✅ Upserted ${validRecords.length} valid bus stops (total so far: ${total})`
      );

      skip += 500;

      // Optional: be polite & avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`🎉 Finished ingesting BusStops.`);
    console.log(`📊 Total valid processed: ${total}`);
    console.log(`⚠️ Total skipped: ${skipped}`);
  } catch (err) {
    console.error("❌ Ingestion failed:", err);
  } finally {
    await sql.end();
  }
}

// Run the script
ingestBusStops().catch((err) => {
  console.error("❌ Top-level error:", err);
  process.exit(1);
});
