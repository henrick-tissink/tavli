/**
 * One-shot backfill: geocode the address of every restaurant whose lat/lng
 * is NULL (or 0,0). Idempotent — runs on each restaurant once and skips
 * any that successfully geocode.
 *
 * Usage:
 *   npx tsx --env-file=.env.prod scripts/backfill-geocoding.ts
 *   npx tsx --env-file=.env.local scripts/backfill-geocoding.ts
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_GEOCODING_KEY  (or NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY as fallback)
 */
import { createClient } from "@supabase/supabase-js";

interface Coords {
  lat: number;
  lng: number;
}

async function geocode(address: string, key: string): Promise<Coords | null> {
  if (!address || address.trim() === "") return null;
  const params = new URLSearchParams({ address, key });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    if (body.status !== "OK") return null;
    const loc = body.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey =
    process.env.GOOGLE_GEOCODING_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file pointing at .env.prod or .env.local.",
    );
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Missing GOOGLE_GEOCODING_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY).");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await sb
    .from("restaurants")
    .select("id, name, address, lat, lng")
    .or("lat.is.null,lng.is.null");

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  console.log(`Found ${rows?.length ?? 0} restaurants without coords.`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    if (!row.address) {
      skipped++;
      console.log(`  - ${row.name}: no address — skipped`);
      continue;
    }
    const coords = await geocode(row.address, apiKey);
    if (!coords) {
      skipped++;
      console.log(`  - ${row.name}: geocoding returned no result — skipped`);
      continue;
    }
    const { error: updateError } = await sb
      .from("restaurants")
      .update({ lat: coords.lat, lng: coords.lng })
      .eq("id", row.id);
    if (updateError) {
      console.error(`  - ${row.name}: update failed —`, updateError.message);
      continue;
    }
    updated++;
    console.log(
      `  ✓ ${row.name}: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    );
    // Friendly throttle (Google free tier ~50 QPS).
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`Done. updated=${updated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
