"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import PlayerStatsCard from "@/components/PlayerStats";
import { getRecentGames, type RecentGame } from "@/lib/supabase/game-results";

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
  }, [user]);

  if (authLoading || !user || !profile) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#fafaf9]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500 hover:text-emerald-400 transition-colors"
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
            className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 hover:text-emerald-400 border border-neutral-800 hover:border-emerald-900/50 rounded-full px-4 py-2 transition-colors"
          >
            Edit
          </Link>
        </div>

        {/* Stats */}
        <div className="mb-10">
          <PlayerStatsCard />
        </div>

        {/* History */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-400">↳</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Recent games
          </span>
        </div>

        {gamesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 bg-neutral-900/50 rounded-lg animate-pulse"
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
                className="flex items-center gap-3 rounded-lg px-4 py-3 bg-neutral-900/50"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 w-16">
                  {g.mode}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-neutral-300">
                    {g.roundsPlayed} {g.roundsPlayed === 1 ? "round" : "rounds"}
                  </span>
                  {g.gameOver && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-red-500/80">
                      game over
                    </span>
                  )}
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
