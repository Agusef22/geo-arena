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
export const STARTING_SCORE = 25000;

// Round multipliers: x1.0, x1.1, x1.2, x1.3, x1.4
const ROUND_MULTIPLIERS = [1.0, 1.1, 1.2, 1.3, 1.4];

export function getRoundMultiplier(round: number): number {
  return ROUND_MULTIPLIERS[Math.min(round, ROUND_MULTIPLIERS.length - 1)];
}

// Base penalty from distance.
// Near (< 50km) = small penalty, far (> 5000km) = heavy penalty.
// Max base penalty is ~5000 for being on the other side of the world.
export function calculatePenalty(distanceKm: number): number {
  if (distanceKm < 0.15) return 0;
  // Linear scaling: ~1 point per km for first 1000km, then tapers
  const penalty = Math.round(5000 * (1 - Math.pow(0.99866, distanceKm)));
  return Math.max(0, Math.min(5000, penalty));
}

// Calculate the actual penalty for a round (base penalty * multiplier)
export function calculateRoundPenalty(
  distanceKm: number,
  round: number
): number {
  const base = calculatePenalty(distanceKm);
  const multiplier = getRoundMultiplier(round);
  return Math.round(base * multiplier);
}

// Tier based on how much penalty you got (lower = better)
export function getPenaltyTier(penalty: number): {
  label: string;
  color: string;
} {
  if (penalty === 0) return { label: "Perfect!", color: "#22c55e" };
  if (penalty <= 200) return { label: "Great!", color: "#84cc16" };
  if (penalty <= 1000) return { label: "Good", color: "#eab308" };
  if (penalty <= 3000) return { label: "OK", color: "#f97316" };
  return { label: "Far off", color: "#ef4444" };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}
