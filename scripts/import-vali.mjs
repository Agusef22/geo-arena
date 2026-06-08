// Import a Vali (or map-making.app / GeoGuessr) location export into the
// `pool_locations` table.
//
// Vali outputs JSON like { "customCoordinates": [ { lat, lng, heading, panoId,
// countryCode, ... }, ... ] }. This script also accepts a bare array.
//
// It uses the Supabase SERVICE ROLE key (server-side, bypasses RLS) so it must
// run on your machine only. The key is read from the environment and is NEVER
// committed — do not hardcode it.
//
// Usage (service role key from the Supabase dashboard → Project Settings → API):
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
//   node scripts/import-vali.mjs path/to/vali-export.json
//
// Re-running is safe: rows are deduped by pano_id (existing ones are skipped).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!url) die("Missing env NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) die("Missing env SUPABASE_SERVICE_ROLE_KEY");
if (!file) die("Usage: node scripts/import-vali.mjs <vali-export.json>");

let raw;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  die(`Could not read/parse ${file}: ${e.message}`);
}

// Accept the Vali/GeoGuessr shape or a bare array.
const coords = Array.isArray(raw)
  ? raw
  : raw.customCoordinates ?? raw.coordinates ?? [];

if (!Array.isArray(coords) || coords.length === 0) {
  die("No locations found (expected `customCoordinates` array or a JSON array)");
}

// Normalize to our schema, tolerating field-name variants.
const rows = coords
  .map((c) => ({
    lat: typeof c.lat === "number" ? c.lat : Number(c.lat),
    lng: typeof c.lng === "number" ? c.lng : Number(c.lng),
    pano_id: c.panoId ?? c.pano ?? c.panoid ?? null,
    heading: typeof c.heading === "number" ? c.heading : null,
    country: c.countryCode ?? c.country ?? null,
  }))
  .filter(
    (r) =>
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng) &&
      typeof r.pano_id === "string" &&
      r.pano_id.length > 0
  );

if (rows.length === 0) {
  die("Locations had no usable lat/lng/panoId — is this a Vali export?");
}

// Dedupe within the file by pano_id.
const seen = new Set();
const unique = rows.filter((r) => {
  if (seen.has(r.pano_id)) return false;
  seen.add(r.pano_id);
  return true;
});

console.log(
  `Parsed ${coords.length} entries → ${unique.length} unique valid locations. Importing...`
);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let inserted = 0;
for (let i = 0; i < unique.length; i += BATCH_SIZE) {
  const batch = unique.slice(i, i + BATCH_SIZE);
  const { data, error } = await supabase
    .from("pool_locations")
    .upsert(batch, { onConflict: "pano_id", ignoreDuplicates: true })
    .select("id");

  if (error) die(`Insert failed at batch ${i / BATCH_SIZE}: ${error.message}`);

  inserted += data?.length ?? 0;
  console.log(`  ${Math.min(i + BATCH_SIZE, unique.length)}/${unique.length} processed (${inserted} new)`);
}

const { count } = await supabase
  .from("pool_locations")
  .select("*", { count: "exact", head: true });

console.log(`\n✓ Done. ${inserted} new locations inserted. Pool now has ${count ?? "?"} total.\n`);
