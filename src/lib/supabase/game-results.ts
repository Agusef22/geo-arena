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
): Promise<{
  gameId: string;
  locations: Location[];
  diagonalKm: number;
} | null> {
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
    diagonal_km: number;
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
  return { gameId: row.game_id, locations, diagonalKm: row.diagonal_km };
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

export interface RecentGame {
  id: string;
  mode: string;
  score: number;
  gameOver: boolean;
  roundsPlayed: number;
  createdAt: string;
}

/**
 * A player's most recent games (newest first), for the profile history.
 */
export async function getRecentGames(
  playerId: string,
  limit = 15
): Promise<RecentGame[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("game_results")
    .select("id, mode, score, game_over, rounds_played, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id as string,
    mode: r.mode as string,
    score: r.score as number,
    gameOver: r.game_over as boolean,
    roundsPlayed: r.rounds_played as number,
    createdAt: r.created_at as string,
  }));
}

export interface PlayerStats {
  gamesPlayed: number;
  bestScore: number;
  avgScore: number;
  perfectRounds: number;
  // Best single-round score across all games (0–5,000).
  bestRound: number;
}

export async function getPlayerStats(
  playerId: string
): Promise<PlayerStats | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("game_results")
    .select("score, rounds")
    .eq("player_id", playerId)
    .eq("mode", "classic");

  if (error || !data || data.length === 0) return null;

  const gamesPlayed = data.length;
  const bestScore = Math.max(...data.map((g) => g.score));
  const avgScore = Math.round(
    data.reduce((sum, g) => sum + g.score, 0) / gamesPlayed
  );

  // Perfect rounds (5,000 pts) and the best single round, from the per-round
  // points the server stored.
  let perfectRounds = 0;
  let bestRound = 0;
  for (const game of data) {
    const rounds = game.rounds as Array<{ points?: number }>;
    if (Array.isArray(rounds)) {
      for (const r of rounds) {
        const pts = r.points ?? 0;
        if (pts >= 5000) perfectRounds += 1;
        if (pts > bestRound) bestRound = pts;
      }
    }
  }

  return { gamesPlayed, bestScore, avgScore, perfectRounds, bestRound };
}
