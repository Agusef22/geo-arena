// Region presets for the "play a specific area" mode. Each region maps to the
// ISO country codes present in the pool (see scripts/vali-pool-live*.json).
// `countries: null` means the whole world.

export interface Region {
  key: string;
  label: string;
  emoji: string;
  countries: string[] | null;
}

export const REGIONS: Region[] = [
  { key: "world", label: "World", emoji: "🌍", countries: null },
  {
    key: "europe",
    label: "Europe",
    emoji: "🇪🇺",
    countries: [
      "ES", "FR", "IT", "DE", "GB", "NL", "SE", "PL", "PT", "IE",
      "CH", "AT", "BE", "DK", "NO", "FI", "CZ", "HU", "RO", "GR",
    ],
  },
  {
    key: "asia",
    label: "Asia",
    emoji: "🌏",
    countries: ["JP", "KR", "TH", "ID", "TW", "MY", "SG", "PH", "IN", "LK", "IL", "TR", "HK"],
  },
  {
    key: "north-america",
    label: "North America",
    emoji: "🌎",
    countries: ["US", "CA", "MX", "GT", "CR", "DO"],
  },
  {
    key: "south-america",
    label: "South America",
    emoji: "🌎",
    countries: ["BR", "AR", "CL", "CO", "PE", "EC", "UY"],
  },
  {
    key: "africa",
    label: "Africa",
    emoji: "🌍",
    countries: ["ZA", "KE", "GH", "NG", "SN", "UG", "BW"],
  },
  {
    key: "oceania",
    label: "Oceania",
    emoji: "🇦🇺",
    countries: ["AU", "NZ"],
  },
];

const REGION_BY_KEY = new Map(REGIONS.map((r) => [r.key, r]));

// Resolve a region key (e.g. from a URL param) to a Region. Unknown/missing
// keys fall back to World.
export function resolveRegion(key: string | null | undefined): Region {
  return (key && REGION_BY_KEY.get(key)) || REGIONS[0];
}
