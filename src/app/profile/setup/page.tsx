"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

const EMOJI_OPTIONS = [
  "🌍", "🌎", "🌏", "🗺️", "📍", "🧭", "✈️", "🚀",
  "🏔️", "🌋", "🏝️", "🌊", "🎯", "🔥", "⚡", "💎",
  "🐉", "🦅", "🐺", "🦁", "🐙", "🦊", "🐧", "🦈",
  "👑", "🎮", "🕹️", "💀", "👻", "🤖", "👽", "🥷",
];

export default function ProfileSetup() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [nickname, setNickname] = useState("");
  const [emoji, setEmoji] = useState("🌍");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // If user already has profile, redirect home
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) router.replace("/");
          else setChecking(false);
        });
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = nickname.trim();
    if (trimmed.length < 2) {
      setError("Nickname must be at least 2 characters");
      return;
    }
    if (trimmed.length > 20) {
      setError("Nickname must be 20 characters or less");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError("Only letters, numbers, _ and - allowed");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      nickname: trimmed,
      emoji,
    });

    if (insertError) {
      setLoading(false);
      if (insertError.code === "23505") {
        setError("That nickname is taken, try another");
      } else {
        setError(insertError.message);
      }
      return;
    }

    // Tell the AuthContext to pick up the just-created profile, so the home
    // shows us logged in immediately (no refresh needed).
    await refreshProfile();
    router.replace("/");
  }

  if (checking) {
    return (
      <main className="pop-bg min-h-dvh text-[#fafaf9] flex items-center justify-center">
        <p className="text-neutral-500 animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pop-bg min-h-dvh text-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="relative z-10 w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-2">
          <span>✨</span> Set up your profile
        </h1>
        <p className="text-neutral-400 text-sm mb-8">
          Choose a nickname and an avatar. You can change these later.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Preview */}
          <div className="flex items-center gap-3 surface-pop p-4">
            <span className="text-4xl">{emoji}</span>
            <span className="font-display text-xl font-bold text-white">
              {nickname || "YourName"}
            </span>
          </div>

          {/* Nickname */}
          <div>
            <label
              htmlFor="nickname"
              className="block text-xs text-neutral-500 uppercase tracking-wider mb-2"
            >
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="GeoMaster"
              required
              maxLength={20}
              autoFocus
              className="input-pop"
            />
            <p className="text-xs text-neutral-500 mt-1">
              2-20 characters, letters, numbers, _ or -
            </p>
          </div>

          {/* Emoji picker */}
          <div>
            <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Avatar
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`text-2xl p-1.5 rounded-lg transition-all cursor-pointer ${
                    emoji === e
                      ? "bg-emerald-500/20 ring-2 ring-emerald-500 scale-110"
                      : "hover:bg-white/10"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !nickname.trim()}
            style={{ ["--pop-shadow" as string]: "#047857" }}
            className="pop-press bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-[#06281c] font-extrabold py-3.5 px-6 rounded-2xl cursor-pointer"
          >
            {loading ? "Creating..." : "Let's go"}
          </button>
        </form>
      </div>
    </main>
  );
}
