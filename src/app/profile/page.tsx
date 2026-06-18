"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import PlayerStatsCard from "@/components/PlayerStats";
import { getRecentGames, type RecentGame } from "@/lib/supabase/game-results";
import {
  getDuelStats,
  getDuelHistory,
  type DuelStats,
  type DuelHistoryEntry,
} from "@/lib/supabase/duel-stats";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [games, setGames] = useState<RecentGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [duelStats, setDuelStats] = useState<DuelStats | null>(null);
  const [duels, setDuels] = useState<DuelHistoryEntry[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    getRecentGames(user.id).then((g) => {
      setGames(g);
      setGamesLoading(false);
    });
    getDuelStats(user.id).then(setDuelStats);
    getDuelHistory(10).then(setDuels);
  }, [user]);

  if (authLoading || !user || !profile) {
    return (
      <main className="pop-bg min-h-dvh flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
      </main>
    );
  }

  return (
    <main className="pop-bg min-h-dvh text-[#fafaf9]">
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/"
          className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
        >
          ← Back
        </Link>

        {/* Identity */}
        <div className="flex items-center gap-4 mt-6 mb-10">
          <span className="text-5xl">{profile.emoji}</span>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-extrabold tracking-tight truncate">
              {profile.nickname}
            </h1>
            <p className="text-sm text-neutral-500 truncate">{user.email}</p>
          </div>
          <Link
            href="/profile/edit"
            className="ml-auto shrink-0 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 transition-colors"
          >
            Edit
          </Link>
        </div>

        {/* Classic stats */}
        <div className="mb-10">
          <PlayerStatsCard />
        </div>

        {/* Duel record */}
        {duelStats && (duelStats.wins + duelStats.losses + duelStats.draws > 0) && (
          <div className="mb-10">
            <h2 className="font-display text-lg font-extrabold text-white mb-3 flex items-center gap-2">
              <span>⚔️</span> Duel record
            </h2>
            <div className="grid grid-cols-4 gap-2">
              <DuelStatBox label="Rating" value={duelStats.rating} color="text-cyan-400" />
              <DuelStatBox label="Wins" value={duelStats.wins} color="text-emerald-400" />
              <DuelStatBox label="Losses" value={duelStats.losses} color="text-red-400" />
              <DuelStatBox label="Draws" value={duelStats.draws} color="text-neutral-300" />
            </div>

            {duels.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {duels.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5 bg-white/5"
                  >
                    <span
                      className={`text-[10px] font-bold uppercase w-10 ${
                        d.result === "win"
                          ? "text-emerald-400"
                          : d.result === "loss"
                          ? "text-red-400"
                          : "text-neutral-400"
                      }`}
                    >
                      {d.result === "win" ? "Win" : d.result === "loss" ? "Loss" : "Draw"}
                    </span>
                    <span className="text-lg">{d.opponentEmoji}</span>
                    <span className="flex-1 min-w-0 text-sm text-neutral-300 truncate">
                      {d.opponentNickname}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {d.myScore.toLocaleString()}–{d.opponentScore.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-neutral-600 w-12 text-right">
                      {timeAgo(d.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Classic history */}
        <h2 className="font-display text-lg font-extrabold text-white mb-4 flex items-center gap-2">
          <span>🎯</span> Recent games
        </h2>

        {gamesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 bg-white/5 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : games.length === 0 ? (
          <p className="text-neutral-600 text-sm text-center py-8">
            No games yet.{" "}
            <Link href="/play" className="text-emerald-400 hover:underline">
              Play one!
            </Link>
          </p>
        ) : (
          <div className="space-y-1.5">
            {games.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white/5"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 w-16">
                  {g.mode}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-neutral-300">
                    {g.roundsPlayed} {g.roundsPlayed === 1 ? "round" : "rounds"}
                  </span>
                </div>
                <span className="text-sm font-bold text-yellow-400 tabular-nums">
                  {g.score.toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-600 w-14 text-right">
                  {timeAgo(g.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function DuelStatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white/5 rounded-2xl p-3 text-center">
      <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-xl font-extrabold tabular-nums ${color}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
