import { haversineDistance } from "./game";

export interface Location {
  id: string;
  lat: number;
  lng: number;
  // Exact Street View panorama id, when the location comes from the curated
  // pool. Lets us load the precise validated panorama (no drift, no surprises).
  panoId?: string;
  // Initial camera heading (degrees) facing down the road, from the pool.
  heading?: number;
}

// Weighted regions to bias towards areas with good Street View coverage,
// spanning every continent that has official Google coverage (Antarctica has
// no drivable coverage, so it's excluded). Boxes are kept tight around covered
// land to avoid wasting attempts on ocean. Weights roughly track how dense the
// official coverage is, while still keeping every continent represented.
// Each region: [minLat, maxLat, minLng, maxLng, weight]
const REGIONS: [number, number, number, number, number][] = [
  // --- Europe ---
  [36, 60, -10, 30, 22],
  // --- North America (US + southern Canada) ---
  [25, 55, -125, -65, 18],
  // --- Mexico & Central America ---
  [14, 30, -106, -83, 5],
  // --- South America ---
  [-38, 6, -74, -35, 12],
  // --- Asia: Japan & South Korea ---
  [31, 43, 126, 142, 7],
  // --- Asia: Southeast Asia ---
  [-9, 22, 96, 127, 8],
  // --- Asia: South Asia (India, Sri Lanka, Bangladesh) ---
  [8, 30, 70, 90, 5],
  // --- Asia: Middle East (Israel, Jordan, UAE, Qatar...) ---
  [25, 38, 34, 52, 4],
  // --- Oceania: Australia ---
  [-38, -12, 114, 154, 7],
  // --- Oceania: New Zealand ---
  [-46, -35, 167, 178, 3],
  // --- Africa: Southern (South Africa, Botswana, Eswatini, Lesotho) ---
  [-34, -22, 17, 33, 5],
  // --- Africa: East (Kenya, Uganda, Tanzania, Rwanda) ---
  [-6, 4, 33, 41, 3],
  // --- Africa: West (Senegal, Ghana, Nigeria) ---
  [4, 15, -17, 4, 3],
];

function pickWeightedRegion(): [number, number, number, number] {
  const totalWeight = REGIONS.reduce((sum, r) => sum + r[4], 0);
  let rand = Math.random() * totalWeight;

  for (const region of REGIONS) {
    rand -= region[4];
    if (rand <= 0) {
      return [region[0], region[1], region[2], region[3]];
    }
  }

  const last = REGIONS[REGIONS.length - 1];
  return [last[0], last[1], last[2], last[3]];
}

export function generateRandomCoord(): { lat: number; lng: number } {
  const [minLat, maxLat, minLng, maxLng] = pickWeightedRegion();
  return {
    lat: minLat + Math.random() * (maxLat - minLat),
    lng: minLng + Math.random() * (maxLng - minLng),
  };
}

// Two locations are considered "too close" (and one is rejected) when they are
// within this real-world distance. Uses haversine so the separation is
// consistent everywhere (a raw lat/lng delta shrinks badly near the poles).
const MIN_SEPARATION_KM = 50;

/**
 * Find `count` distinct, well-separated Street View locations.
 *
 * Searches in batches of 5 in parallel and stops once enough valid locations
 * are collected or `count * 15` attempts are exhausted. `onProgress` is called
 * with the running total each time a location is accepted (for loading UI).
 *
 * Returns the locations found — the caller should check `result.length` and
 * treat a short result as a failure. Shared by Classic and Duel modes.
 */
export async function findGameLocations(
  svService: google.maps.StreetViewService,
  count: number,
  onProgress?: (found: number) => void
): Promise<Location[]> {
  const locs: Location[] = [];
  let attempts = 0;
  const maxAttempts = count * 15;

  while (locs.length < count && attempts < maxAttempts) {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => findStreetViewLocation(svService))
    );

    for (const result of results) {
      if (result && locs.length < count) {
        const tooClose = locs.some(
          (existing) =>
            haversineDistance(
              existing.lat,
              existing.lng,
              result.lat,
              result.lng
            ) < MIN_SEPARATION_KM
        );

        if (!tooClose) {
          locs.push(result);
          onProgress?.(locs.length);
        }
      }
    }

    attempts += 5;
  }

  return locs;
}

// Find a valid Street View location near random coordinates
// Returns null if no coverage found after trying
export function findStreetViewLocation(
  svService: google.maps.StreetViewService
): Promise<Location | null> {
  return new Promise((resolve) => {
    const coord = generateRandomCoord();

    svService.getPanorama(
      {
        location: coord,
        radius: 50000, // 50km radius search
        preference: google.maps.StreetViewPreference.NEAREST,
        source: google.maps.StreetViewSource.OUTDOOR,
      },
      (data, status) => {
        if (
          status === google.maps.StreetViewStatus.OK &&
          data?.location?.latLng
        ) {
          const latLng = data.location.latLng;
          resolve({
            id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            lat: latLng.lat(),
            lng: latLng.lng(),
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}
