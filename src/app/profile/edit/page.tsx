"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

const EMOJI_OPTIONS = [
  "🌍", "🌎", "🌏", "🗺️", "📍", "🧭", "✈️", "🚀",
  "🏔️", "🌋", "🏝️", "🌊", "🎯", "🔥", "⚡", "💎",
  "🐉", "🦅", "🐺", "🦁", "🐙", "🦊", "🐧", "🦈",
  "👑", "🎮", "🕹️", "💀", "👻", "🤖", "👽", "🥷",
];

export default function EditProfile() {
  const router = useRouter();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState("");
  const [emoji, setEmoji] = useState("🌍");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
    if (profile) {
      setNickname(profile.nickname);
      setEmoji(profile.emoji);
    }
  }, [authLoading, user, profile, router]);

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
    setSaved(false);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ nickname: trimmed, emoji })
      .eq("id", user!.id);

    setLoading(false);

    if (updateError) {
      if (updateError.code === "23505") {
        setError("That nickname is taken, try another");
      } else {
        setError(updateError.message);
      }
      return;
    }

    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (authLoading || !profile) {
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
          Edit profile
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          Change your nickname or avatar.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Preview */}
          <div className="flex items-center gap-3 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
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
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-colors"
            />
            <p className="text-xs text-neutral-600 mt-1">
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
                      : "hover:bg-zinc-800"
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
            className={`${
              saved
                ? "bg-emerald-600 text-white"
                : "bg-emerald-500 hover:bg-emerald-400 text-[#0a0a0a]"
            } disabled:bg-zinc-700 disabled:text-zinc-500 active:scale-[0.98] font-semibold py-3 px-6 rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed`}
          >
            {loading ? "Saving..." : saved ? "Saved!" : "Save changes"}
          </button>
        </form>
      </div>
    </main>
  );
}
