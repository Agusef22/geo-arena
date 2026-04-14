// Duel scoring: only the player further away loses points.
// Penalty is based on the DIFFERENCE between the two distances.

export const DUEL_STARTING_SCORE = 5000;
export const DUEL_ROUNDS = 5;

/**
 * Calculate the penalty for the losing player in a duel round.
 *
 * Based on distance difference between the two guesses:
 *   < 5km difference  → draw (0 penalty)
 *   50km difference   → ~200
 *   200km difference  → ~600
 *   500km difference  → ~1100
 *   1000km difference → ~1700
 *   2000km+ difference → ~2500 (cap)
 *
 * Uses the same exponential curve as Classic but with different scaling.
 * Max penalty per round is 2500.
 */
export function calculateDuelPenalty(
  winnerDistanceKm: number,
  loserDistanceKm: number
): number {
  const diff = loserDistanceKm - winnerDistanceKm;

  // Draw threshold: less than 5km difference
  if (diff < 5) return 0;

  const MAX_PENALTY = 2500;
  const ratio = 1 - Math.exp(-diff / 800);
  return Math.round(ratio * MAX_PENALTY);
}

/**
 * Determine the result of a duel round.
 * Returns which player lost and their penalty, or a draw.
 */
export function resolveDuelRound(
  player1Distance: number,
  player2Distance: number
): {
  winnerId: 1 | 2 | null; // null = draw
  loserId: 1 | 2 | null;
  penalty: number;
  isDraw: boolean;
} {
  const diff = Math.abs(player1Distance - player2Distance);

  // Draw: difference less than 5km
  if (diff < 5) {
    return { winnerId: null, loserId: null, penalty: 0, isDraw: true };
  }

  if (player1Distance < player2Distance) {
    return {
      winnerId: 1,
      loserId: 2,
      penalty: calculateDuelPenalty(player1Distance, player2Distance),
      isDraw: false,
    };
  } else {
    return {
      winnerId: 2,
      loserId: 1,
      penalty: calculateDuelPenalty(player2Distance, player1Distance),
      isDraw: false,
    };
  }
}

/** Generate a random 4-letter room code */
export function generateDuelCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
