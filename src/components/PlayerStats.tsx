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
    <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-2xl p-3 text-center">
      <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function PlayerStatsCard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // When logged out the component renders null anyway, so we only need to
    // resolve the loading state once we actually have a user to fetch for.
    if (!user) return;
    getPlayerStats(user.id).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [user]);

  if (!user || !profile) return null;

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto">
        <h3 className="flex items-center gap-2 mb-4 font-display text-lg font-extrabold text-white">
          <span>📊</span> Your stats
        </h3>
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
        <h3 className="flex items-center gap-2 mb-4 font-display text-lg font-extrabold text-white">
          <span>📊</span> Your stats
        </h3>
        <p className="text-neutral-600 text-sm text-center py-6">
          Play a game to see your stats here.
        </p>
      </div>
    );
  }

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
          label="Best round"
          value={stats.bestRound.toLocaleString()}
          color="text-yellow-400"
        />
        <StatBox
          label="Perfects"
          value={stats.perfectRounds.toString()}
          color="text-emerald-400"
        />
      </div>
    </div>
  );
}
