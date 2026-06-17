// Region presets for the "play a specific area" mode. Each region maps to the
// ISO country codes present in the pool (see scripts/vali-pool-live*.json).
// `countries: null` means the whole world.

export interface Region {
  key: string;
  label: string;
  emoji: string;
  countries: string[] | null;
  // Rough diagonal of the region (km), used to scale scoring for anonymous
  // games. Logged-in games use the exact diagonal the server computes from the
  // pool, so this is only a display fallback when there's no server session.
  diagonalKm: number;
}

export const REGIONS: Region[] = [
  { key: "world", label: "World", emoji: "🌍", countries: null, diagonalKm: 20015 },
  {
    key: "europe",
    label: "Europe",
    emoji: "🇪🇺",
    countries: [
      "ES", "FR", "IT", "DE", "GB", "NL", "SE", "PL", "PT", "IE",
      "CH", "AT", "BE", "DK", "NO", "FI", "CZ", "HU", "RO", "GR",
    ],
    diagonalKm: 4800,
  },
  {
    key: "asia",
    label: "Asia",
    emoji: "🌏",
    countries: ["JP", "KR", "TH", "ID", "TW", "MY", "SG", "PH", "IN", "LK", "IL", "TR", "HK"],
    diagonalKm: 10500,
  },
  {
    key: "north-america",
    label: "North America",
    emoji: "🌎",
    countries: ["US", "CA", "MX", "GT", "CR", "DO"],
    diagonalKm: 7000,
  },
  {
    key: "south-america",
    label: "South America",
    emoji: "🌎",
    countries: ["BR", "AR", "CL", "CO", "PE", "EC", "UY"],
    diagonalKm: 7500,
  },
  {
    key: "africa",
    label: "Africa",
    emoji: "🌍",
    countries: ["ZA", "KE", "GH", "NG", "SN", "UG", "BW"],
    diagonalKm: 7000,
  },
  {
    key: "oceania",
    label: "Oceania",
    emoji: "🇦🇺",
    countries: ["AU", "NZ"],
    diagonalKm: 4500,
  },
];

const REGION_BY_KEY = new Map(REGIONS.map((r) => [r.key, r]));

// Resolve a region key (e.g. from a URL param) to a Region. Unknown/missing
// keys fall back to World.
export function resolveRegion(key: string | null | undefined): Region {
  return (key && REGION_BY_KEY.get(key)) || REGIONS[0];
}

// Reverse-map a stored countries[] back to a region label (for display).
// Null/empty means worldwide → no label.
export function regionLabelFromCountries(
  countries: string[] | null | undefined
): string | null {
  if (!countries || countries.length === 0) return null;
  const set = new Set(countries);
  const match = REGIONS.find(
    (r) =>
      r.countries &&
      r.countries.length === set.size &&
      r.countries.every((c) => set.has(c))
  );
  return match ? `${match.emoji} ${match.label}` : "🗺️ Custom region";
}
