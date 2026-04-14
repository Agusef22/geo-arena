"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { generateDuelCode, DUEL_STARTING_SCORE } from "@/lib/duel";

export default function DuelLobby() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!user || !profile) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Try to create a game with a unique code (retry on collision)
    let code = "";
    let attempts = 0;
    while (attempts < 5) {
      code = generateDuelCode();
      const { error: insertError } = await supabase.from("duels").insert({
        code,
        status: "waiting",
        locations: null,
      });

      if (!insertError) break;
      if (insertError.code === "23505") {
        attempts++;
        continue;
      }
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (!code) {
      setError("Failed to create game. Try again.");
      setLoading(false);
      return;
    }

    // Get the duel id
    const { data: duel } = await supabase
      .from("duels")
      .select("id")
      .eq("code", code)
      .single();

    if (!duel) {
      setError("Failed to create game. Try again.");
      setLoading(false);
      return;
    }

    // Add host as player
    const { error: playerError } = await supabase.from("duel_players").insert({
      duel_id: duel.id,
      player_id: user.id,
      score: DUEL_STARTING_SCORE,
      is_host: true,
    });

    if (playerError) {
      setError(playerError.message);
      setLoading(false);
      return;
    }

    router.push(`/duel/${code}`);
  }

  async function handleJoin() {
    if (!user || !profile) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError("Code must be 4 letters");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Find the duel
    const { data: duel } = await supabase
      .from("duels")
      .select("id, status")
      .eq("code", code)
      .single();

    if (!duel) {
      setError("Game not found. Check the code.");
      setLoading(false);
      return;
    }

    if (duel.status !== "waiting") {
      setError("This game already started or finished.");
      setLoading(false);
      return;
    }

    // Check player count
    const { data: players } = await supabase
      .from("duel_players")
      .select("id, player_id")
      .eq("duel_id", duel.id);

    if (players && players.length >= 2) {
      setError("This game is full.");
      setLoading(false);
      return;
    }

    // Check if already joined
    if (players?.some((p) => p.player_id === user.id)) {
      router.push(`/duel/${code}`);
      return;
    }

    // Join
    const { error: joinError } = await supabase.from("duel_players").insert({
      duel_id: duel.id,
      player_id: user.id,
      score: DUEL_STARTING_SCORE,
      is_host: false,
    });

    if (joinError) {
      setError(joinError.message);
      setLoading(false);
      return;
    }

    router.push(`/duel/${code}`);
  }

  // Not logged in
  if (!authLoading && (!user || !profile)) {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#fafaf9] flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-display text-3xl font-extrabold tracking-tight mb-4">
            Duel Mode
          </h1>
          <p className="text-neutral-500 text-sm mb-8">
            You need to sign in to play Duel mode.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-[#0a0a0a] font-semibold py-3 px-6 rounded-lg transition-all"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="block mt-4 text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
          >
            Back to menu
          </Link>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#fafaf9] flex items-center justify-center">
        <p className="text-neutral-500 animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors text-sm mb-8"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2">
          Duel
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          Challenge a friend. Same locations, closest guess wins.
        </p>

        {/* Create game */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 active:scale-[0.98] text-[#0a0a0a] font-semibold py-4 px-6 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed text-lg mb-4"
        >
          {loading ? "Creating..." : "Create game"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-neutral-800" />
          <span className="text-neutral-600 text-xs uppercase tracking-wider">
            or join
          </span>
          <div className="flex-1 h-px bg-neutral-800" />
        </div>

        {/* Join game */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="CODE"
            maxLength={4}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-center text-xl font-mono uppercase tracking-[0.3em] placeholder:text-zinc-600 placeholder:tracking-[0.3em] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-colors"
          />
          <button
            onClick={handleJoin}
            disabled={loading || joinCode.trim().length !== 4}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 active:scale-[0.98] text-white font-semibold py-3 px-6 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mt-4">{error}</p>
        )}
      </div>
    </main>
  );
}
