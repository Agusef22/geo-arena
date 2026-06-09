import { createClient } from "./client";
import type { Location } from "@/lib/locations";

interface PoolRow {
  id: string;
  lat: number;
  lng: number;
  pano_id: string;
  heading: number | null;
}

/**
 * Pick `count` distinct random locations from the curated pool. `countries`
 * (ISO codes) optionally restricts to a region; null/undefined means worldwide.
 * Returns [] if the pool is empty or the query fails, so callers can fall back
 * to a live Street View search (e.g. before the pool has been seeded).
 */
export async function getRandomPoolLocations(
  count: number,
  countries?: string[] | null
): Promise<Location[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_random_locations", {
    n: count,
    countries: countries ?? null,
  });

  if (error || !data) return [];

  return (data as PoolRow[]).map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    panoId: r.pano_id,
    heading: r.heading ?? undefined,
  }));
}
