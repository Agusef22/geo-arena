// Duel scoring (GeoGuessr Duels model) lives server-side in resolve_duel_guess:
// both players start with HP, each round the lower scorer takes damage equal to
// the round-score gap times the winner's escalating multiplier. The client only
// reads the authoritative HP/damage the server computes.

export const DUEL_STARTING_HP = 6000;
export const DUEL_ROUNDS = 5;

/** Generate a random 4-letter room code */
export function generateDuelCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
