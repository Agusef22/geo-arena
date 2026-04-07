export interface Location {
  id: string;
  lat: number;
  lng: number;
}

// Weighted regions to bias towards areas with good Street View coverage
// Each region: [minLat, maxLat, minLng, maxLng, weight]
const REGIONS: [number, number, number, number, number][] = [
  // Europe
  [36, 60, -10, 40, 25],
  // North America
  [25, 50, -125, -65, 20],
  // South America
  [-35, 5, -75, -35, 12],
  // Southeast Asia
  [-10, 25, 95, 145, 10],
  // Japan/Korea
  [30, 45, 125, 145, 8],
  // Australia
  [-38, -12, 115, 155, 8],
  // Southern Africa
  [-35, -22, 17, 33, 5],
  // India
  [8, 30, 70, 90, 5],
  // Middle East
  [24, 38, 35, 55, 4],
  // Mexico/Central America
  [15, 25, -105, -85, 3],
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
