"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { generateDuelCode, DUEL_STARTING_HP } from "@/lib/duel";
import { REGIONS, resolveRegion } from "@/lib/regions";

export default function DuelLobby() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Code of a duel the player is already in (waiting/playing), so they can
  // jump back in with one click after closing the tab.
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Game mode chosen by the host when creating.
  const [timed, setTimed] = useState(false);
  const [noMove, setNoMove] = useState(false);
  const [regionKey, setRegionKey] = useState("world");

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.rpc("get_active_duel").then(({ data }) => {
      if (typeof data === "string" && data) setActiveCode(data);
    });
  }, [user]);

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
        timed,
        no_move: noMove,
        countries: resolveRegion(regionKey).countries,
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
      score: DUEL_STARTING_HP,
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
      score: DUEL_STARTING_HP,
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
      <main className="pop-bg min-h-dvh text-[#fafaf9] flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-display text-3xl font-extrabold tracking-tight mb-4">
            Duel Mode
          </h1>
          <p className="text-neutral-500 text-sm mb-8">
            You need to sign in to play Duel mode.
          </p>
          <Link
            href="/login"
            style={{ ["--pop-shadow" as string]: "#047857" }}
            className="pop-press inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-[#06281c] font-extrabold py-3.5 px-7 rounded-2xl"
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
      <main className="pop-bg min-h-dvh text-[#fafaf9] flex items-center justify-center">
        <p className="text-neutral-500 animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pop-bg min-h-dvh text-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm mb-8"
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

        <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-2">
          <span className="anim-wiggle inline-block">⚔️</span> Duel
        </h1>
        <p className="text-neutral-400 text-sm mb-8">
          Challenge a friend. Same locations — win rounds to drain their HP.
        </p>

        {/* Resume a game already in progress */}
        {activeCode && (
          <Link
            href={`/duel/${activeCode}`}
            className="flex items-center justify-between gap-2 w-full bg-cyan-500/15 border border-cyan-400/30 hover:bg-cyan-500/25 rounded-2xl px-4 py-3 mb-4 transition-colors"
          >
            <span className="flex items-center gap-2 text-cyan-300 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Resume game in progress
            </span>
            <span className="font-mono text-cyan-400 tracking-[0.2em] font-bold">
              {activeCode} →
            </span>
          </Link>
        )}

        {/* Game options */}
        <div className="surface-pop p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-200">Region</span>
            <select
              value={regionKey}
              onChange={(e) => setRegionKey(e.target.value)}
              className="bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none cursor-pointer"
            >
              {REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.emoji} {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle label="⏱️ Timed" active={timed} onClick={() => setTimed((v) => !v)} />
            <ModeToggle label="🚷 No Move" active={noMove} onClick={() => setNoMove((v) => !v)} />
          </div>
        </div>

        {/* Create game */}
        <button
          onClick={handleCreate}
          disabled={loading}
          style={{ ["--pop-shadow" as string]: "#047857" }}
          className="pop-press w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-[#06281c] font-extrabold py-4 px-6 rounded-2xl cursor-pointer text-lg mb-4"
        >
          {loading ? "Creating..." : "Create game"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-neutral-500 text-xs font-semibold uppercase tracking-wider">
            or join
          </span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Join game */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="CODE"
            maxLength={4}
            className="input-pop flex-1 text-center text-xl font-mono uppercase tracking-[0.3em] placeholder:tracking-[0.3em]"
          />
          <button
            onClick={handleJoin}
            disabled={loading || joinCode.trim().length !== 4}
            style={{ ["--pop-shadow" as string]: "#3730a3" }}
            className="pop-press bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:pointer-events-none text-white font-extrabold py-3 px-6 rounded-2xl cursor-pointer"
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

function ModeToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-sm font-semibold py-2 rounded-xl border transition-colors cursor-pointer ${
        active
          ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
          : "bg-white/5 border-white/10 text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
