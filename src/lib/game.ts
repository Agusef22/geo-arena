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
export const STARTING_SCORE = 10000;

// Max penalty per round — escalates each round.
// Total max = 18,000 (way more than 10,000 so you CAN die early).
const ROUND_MAX_PENALTY = [2500, 3000, 3500, 4000, 5000];

export function getRoundMaxPenalty(round: number): number {
  return ROUND_MAX_PENALTY[Math.min(round, ROUND_MAX_PENALTY.length - 1)];
}

/**
 * Distance → penalty ratio (0 to 1).
 *
 * Generous close up, brutal far away:
 *   < 150m  →  0%    (Perfect)
 *   5km     →  ~0.3%
 *   50km    →  ~3%
 *   150km   →  ~10%
 *   500km   →  ~28%
 *   1000km  →  ~49%
 *   2000km  →  ~74%
 *   5000km+ →  ~96%
 *
 * Uses 1 - e^(-d/1500) which gives a smooth curve that's
 * very flat near 0 and approaches 1 asymptotically.
 */
export function distanceToPenaltyRatio(distanceKm: number): number {
  if (distanceKm < 0.15) return 0;
  const ratio = 1 - Math.exp(-distanceKm / 1500);
  return Math.min(1, ratio);
}

// Actual penalty for a round: ratio × max penalty for that round.
export function calculatePenalty(distanceKm: number, round: number): number {
  const ratio = distanceToPenaltyRatio(distanceKm);
  const maxPenalty = getRoundMaxPenalty(round);
  return Math.round(ratio * maxPenalty);
}

// Tier based on penalty ratio (how well you did, independent of round).
export function getPenaltyTier(penaltyRatio: number): {
  label: string;
  color: string;
} {
  if (penaltyRatio === 0) return { label: "Perfect!", color: "#22c55e" };
  if (penaltyRatio < 0.05) return { label: "Great!", color: "#84cc16" };
  if (penaltyRatio < 0.2) return { label: "Good", color: "#eab308" };
  if (penaltyRatio < 0.6) return { label: "OK", color: "#f97316" };
  return { label: "Far off", color: "#ef4444" };
}

// Final score message.
export function getScoreMessage(score: number): {
  color: string;
  message: string;
} {
  if (score <= 0) return { color: "#ef4444", message: "Game Over" };
  if (score >= 9500) return { color: "#facc15", message: "Legendary!" };
  if (score >= 8000) return { color: "#f97316", message: "Amazing!" };
  if (score >= 6000) return { color: "#22c55e", message: "Great job!" };
  if (score >= 4000) return { color: "#3b82f6", message: "Not bad!" };
  return { color: "#a1a1aa", message: "Keep exploring!" };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}
