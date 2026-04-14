"use client";

import { useState, useEffect } from "react";
import {
  getLeaderboard,
  type LeaderboardEntry,
} from "@/lib/supabase/game-results";
import { useAuth } from "@/context/AuthContext";

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

const RANK_COLORS: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-neutral-300",
  3: "text-amber-600",
};

export default function Leaderboard() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard(10).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-400">↳</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Leaderboard
          </span>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 bg-neutral-900/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-400">↳</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Leaderboard
          </span>
        </div>
        <p className="text-neutral-600 text-sm text-center py-8">
          No games yet. Be the first to play!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-emerald-400">↳</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          Leaderboard
        </span>
      </div>

      <div className="space-y-1.5">
        {entries.map((entry) => {
          const isYou = profile?.nickname === entry.nickname;
          return (
            <div
              key={`${entry.nickname}-${entry.created_at}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                isYou
                  ? "bg-emerald-950/30 border border-emerald-900/30"
                  : "bg-neutral-900/50 hover:bg-neutral-900/80"
              }`}
            >
              {/* Rank */}
              <span
                className={`font-mono text-sm font-bold w-6 text-right ${
                  RANK_COLORS[entry.rank] ?? "text-neutral-600"
                }`}
              >
                {entry.rank}
              </span>

              {/* Avatar + name */}
              <span className="text-lg">{entry.emoji}</span>
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm font-medium truncate block ${
                    isYou ? "text-emerald-400" : "text-neutral-300"
                  }`}
                >
                  {entry.nickname}
                  {isYou && (
                    <span className="text-[10px] text-emerald-600 ml-1.5">
                      you
                    </span>
                  )}
                </span>
              </div>

              {/* Score + time */}
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-yellow-400 tabular-nums">
                  {entry.score.toLocaleString()}
                </span>
                <span className="block text-[10px] text-neutral-600">
                  {timeAgo(entry.created_at)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
