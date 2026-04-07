import type { Location } from "./locations";

export interface RoundData {
  location: Location;
  guessLat: number;
  guessLng: number;
  distance: number;
  penalty: number;
  multiplier: number;
}
