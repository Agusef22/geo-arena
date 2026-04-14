import { createClient } from "./client";
import type { RoundData } from "@/lib/types";

export async function saveGameResult({
  score,
  rounds,
  gameOver,
}: {
  score: number;
  rounds: RoundData[];
  gameOver: boolean;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in — skip silently (game works without auth)
  if (!user) return null;

  const totalPenalty = rounds.reduce((sum, r) => sum + r.penalty, 0);
  const totalBonus = rounds.reduce((sum, r) => sum + r.bonus, 0);

  // Serialize rounds without the full Location object (just lat/lng)
  const roundsSerialized = rounds.map((r) => ({
    lat: r.location.lat,
    lng: r.location.lng,
    guessLat: r.guessLat,
    guessLng: r.guessLng,
    distance: r.distance,
    penalty: r.penalty,
    penaltyRatio: r.penaltyRatio,
    maxPenalty: r.maxPenalty,
    bonus: r.bonus,
  }));

  const { data, error } = await supabase
    .from("game_results")
    .insert({
      player_id: user.id,
      mode: "classic",
      score,
      game_over: gameOver,
      rounds_played: rounds.length,
      total_penalty: totalPenalty,
      total_bonus: totalBonus,
      rounds: roundsSerialized,
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data.id;
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

  const { data, error } = await supabase
    .from("game_results")
    .select("score, created_at, profiles(nickname, emoji)")
    .eq("mode", "classic")
    .eq("game_over", false)
    .order("score", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>, i: number) => {
    const profile = row.profiles as { nickname: string; emoji: string } | null;
    return {
      rank: i + 1,
      nickname: profile?.nickname ?? "Unknown",
      emoji: profile?.emoji ?? "🌍",
      score: row.score as number,
      created_at: row.created_at as string,
    };
  });
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
