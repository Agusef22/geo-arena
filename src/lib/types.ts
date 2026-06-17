import type { Location } from "./locations";

export interface RoundData {
  location: Location;
  guessLat: number;
  guessLng: number;
  distance: number;
  // Points earned this round (0–5,000), additive GeoGuessr-style scoring.
  points: number;
}
