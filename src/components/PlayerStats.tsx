"use client";

import { useState, useEffect } from "react";
import { getPlayerStats, type PlayerStats } from "@/lib/supabase/game-results";
import { useAuth } from "@/context/AuthContext";

function StatBox({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-neutral-900/50 rounded-lg p-3 text-center">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function PlayerStatsCard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    getPlayerStats(user.id).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [user]);

  if (!user || !profile) return null;

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-400">↳</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Your stats
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-neutral-900/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-400">↳</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Your stats
          </span>
        </div>
        <p className="text-neutral-600 text-sm text-center py-6">
          Play a game to see your stats here.
        </p>
      </div>
    );
  }

  const winRate = stats.gamesPlayed > 0
    ? Math.round(
        ((stats.gamesPlayed - stats.gameOvers) / stats.gamesPlayed) * 100
      )
    : 0;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-emerald-400">↳</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          Your stats
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Games" value={stats.gamesPlayed.toString()} />
        <StatBox
          label="Best"
          value={stats.bestScore.toLocaleString()}
          color="text-yellow-400"
        />
        <StatBox
          label="Average"
          value={stats.avgScore.toLocaleString()}
          color="text-neutral-300"
        />
        <StatBox
          label="Survival"
          value={`${winRate}%`}
          color={winRate >= 50 ? "text-emerald-400" : "text-red-400"}
        />
        <StatBox
          label="Perfects"
          value={stats.perfectRounds.toString()}
          color="text-emerald-400"
        />
        <StatBox
          label="Deaths"
          value={stats.gameOvers.toString()}
          color="text-red-400"
        />
      </div>
    </div>
  );
}
