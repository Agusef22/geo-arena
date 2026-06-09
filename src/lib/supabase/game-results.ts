import { createClient } from "./client";
import type { Location } from "@/lib/locations";

/**
 * Start a server-authoritative classic game. The server picks and stores the
 * locations, so the score can't be forged on submit. Returns the game id (to
 * submit guesses against) plus the locations to render. Returns null when the
 * player isn't logged in or the RPC fails — callers then fall back to an
 * unsaved game via getRandomPoolLocations.
 */
export async function startClassicGame(
  count: number,
  countries?: string[] | null
): Promise<{ gameId: string; locations: Location[] } | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("start_classic_game", {
    n: count,
    countries: countries ?? null,
  });
  if (error || !data || data.length === 0) return null;

  const row = data[0] as {
    game_id: string;
    locations: Array<{
      lat: number;
      lng: number;
      pano?: string;
      heading?: number;
    }>;
  };

  const locations: Location[] = (row.locations ?? []).map((l, i) => ({
    id: `loc-${i}`,
    lat: l.lat,
    lng: l.lng,
    panoId: l.pano,
    heading: l.heading,
  }));

  if (locations.length < count) return null;
  return { gameId: row.game_id, locations };
}

/**
 * Submit a classic game's guesses. The server scores them against the
 * locations it stored for this game and records the result. `guesses` are in
 * round order (length may be < the game's rounds if the player got a game
 * over). Returns the authoritative score, or null on failure.
 */
export async function submitClassicGame(
  gameId: string,
  guesses: { lat: number; lng: number }[]
): Promise<number | null> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("submit_classic_game", {
    p_game_id: gameId,
    p_guesses: guesses,
  });
  if (error) return null;

  return data as number;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  emoji: string;
  score: number;
  created_at: string;
}

export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const supabase = createClient();

  // One row per player (their best classic game) — see get_leaderboard RPC.
  const { data, error } = await supabase.rpc("get_leaderboard", { lim: limit });

  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((row, i) => ({
    rank: i + 1,
    nickname: (row.nickname as string) ?? "Unknown",
    emoji: (row.emoji as string) ?? "🌍",
    score: row.score as number,
    created_at: row.created_at as string,
  }));
}

export interface PlayerStats {
  gamesPlayed: number;
  bestScore: number;
  avgScore: number;
  totalPenalty: number;
  totalBonus: number;
  gameOvers: number;
  perfectRounds: number;
}

export async function getPlayerStats(
  playerId: string
): Promise<PlayerStats | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("game_results")
    .select("score, game_over, total_penalty, total_bonus, rounds")
    .eq("player_id", playerId)
    .eq("mode", "classic");

  if (error || !data || data.length === 0) return null;

  const gamesPlayed = data.length;
  const bestScore = Math.max(...data.map((g) => g.score));
  const avgScore = Math.round(
    data.reduce((sum, g) => sum + g.score, 0) / gamesPlayed
  );
  const totalPenalty = data.reduce((sum, g) => sum + g.total_penalty, 0);
  const totalBonus = data.reduce((sum, g) => sum + g.total_bonus, 0);
  const gameOvers = data.filter((g) => g.game_over).length;

  // Count perfect rounds (penaltyRatio === 0) across all games
  let perfectRounds = 0;
  for (const game of data) {
    const rounds = game.rounds as Array<{ penaltyRatio: number }>;
    if (Array.isArray(rounds)) {
      perfectRounds += rounds.filter((r) => r.penaltyRatio === 0).length;
    }
  }

  return {
    gamesPlayed,
    bestScore,
    avgScore,
    totalPenalty,
    totalBonus,
    gameOvers,
    perfectRounds,
  };
}
