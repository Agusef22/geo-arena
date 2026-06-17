const EARTH_RADIUS_KM = 6371;

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export const ROUNDS_PER_GAME = 5;

// Additive scoring, GeoGuessr-style: each round earns 0–5,000 points, a full
// game tops out at 25,000. Higher is better and the score accumulates.
export const MAX_ROUND_SCORE = 5000;
export const MAX_GAME_SCORE = MAX_ROUND_SCORE * ROUNDS_PER_GAME;

// Diagonal of the "world" used to scale scoring when no region is selected.
// Capped at half the Earth's circumference (the largest meaningful distance).
export const WORLD_DIAGONAL_KM = 20015;

/**
 * Round score from distance, GeoGuessr's formula:
 *
 *   S = 5000 · e^(−10 · d / D)
 *
 * where `d` is the guess error and `D` is the diagonal of the played map
 * (region). A smaller D (a country) demands more precision for the same points;
 * a larger D (the world) is forgiving. A guess inside ~1/100,000 of the
 * diagonal (min 25 m) snaps to a perfect 5,000.
 *
 * On the world map (D ≈ 20,015 km) this reduces to ≈ 5000·e^(−d/2000):
 *   100 km → 4,756 · 500 km → 3,894 · 1,000 km → 3,033 · 5,000 km → 410.
 */
export function roundScore(distanceKm: number, diagonalKm: number): number {
  const D = diagonalKm > 0 ? diagonalKm : WORLD_DIAGONAL_KM;
  const perfectThreshold = Math.max(0.025, D / 100000);
  if (distanceKm <= perfectThreshold) return MAX_ROUND_SCORE;
  const score = MAX_ROUND_SCORE * Math.exp((-10 * distanceKm) / D);
  return Math.max(0, Math.round(score));
}

// Tier for a round, by how many of the 5,000 points it earned.
export function getScoreTier(points: number): { label: string; color: string } {
  if (points >= MAX_ROUND_SCORE) return { label: "Perfect!", color: "#22c55e" };
  if (points >= 4500) return { label: "Great!", color: "#84cc16" };
  if (points >= 3000) return { label: "Good", color: "#eab308" };
  if (points >= 1000) return { label: "OK", color: "#f97316" };
  return { label: "Far off", color: "#ef4444" };
}

// Final-score message, scaled to the 25,000 ceiling.
export function getScoreMessage(score: number): {
  color: string;
  message: string;
} {
  if (score >= 23750) return { color: "#facc15", message: "Legendary!" };
  if (score >= 20000) return { color: "#f97316", message: "Amazing!" };
  if (score >= 15000) return { color: "#22c55e", message: "Great job!" };
  if (score >= 10000) return { color: "#3b82f6", message: "Not bad!" };
  return { color: "#a1a1aa", message: "Keep exploring!" };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}
