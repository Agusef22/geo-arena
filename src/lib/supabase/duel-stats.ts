import { createClient } from "./client";

export interface DuelStats {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface DuelHistoryEntry {
  opponentNickname: string;
  opponentEmoji: string;
  myScore: number;
  opponentScore: number;
  result: "win" | "loss" | "draw";
  createdAt: string;
}

export interface RankingEntry {
  id: string;
  nickname: string;
  emoji: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  isMe: boolean;
}

/** A player's duel rating + W/L/D record (from their public profile). */
export async function getDuelStats(playerId: string): Promise<DuelStats | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("duel_rating, duel_wins, duel_losses, duel_draws")
    .eq("id", playerId)
    .single();
  if (error || !data) return null;
  return {
    rating: data.duel_rating,
    wins: data.duel_wins,
    losses: data.duel_losses,
    draws: data.duel_draws,
  };
}

/** The caller's recent finished duels with outcomes. */
export async function getDuelHistory(limit = 20): Promise<DuelHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_duel_history", {
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    opponentNickname: (r.opponent_nickname as string) ?? "Unknown",
    opponentEmoji: (r.opponent_emoji as string) ?? "🌍",
    myScore: r.my_score as number,
    opponentScore: r.opponent_score as number,
    result: r.result as "win" | "loss" | "draw",
    createdAt: r.created_at as string,
  }));
}

/** The caller + their friends, ranked by duel rating. */
export async function getFriendsDuelRanking(): Promise<RankingEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_friends_duel_ranking");
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    nickname: (r.nickname as string) ?? "Unknown",
    emoji: (r.emoji as string) ?? "🌍",
    rating: r.rating as number,
    wins: r.wins as number,
    losses: r.losses as number,
    draws: r.draws as number,
    isMe: r.is_me as boolean,
  }));
}
