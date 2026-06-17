"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MAX_GAME_SCORE,
  ROUNDS_PER_GAME,
  formatDistance,
  getScoreTier,
  getScoreMessage,
} from "@/lib/game";
import type { RoundData } from "@/lib/types";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface GameSummaryProps {
  finalScore: number;
  rounds: RoundData[];
  onPlayAgain: () => void;
}

// Wordle-style emoji square per round, by how many points it earned.
function roundSquare(round: RoundData): string {
  if (round.points >= 4000) return "🟩";
  if (round.points >= 2000) return "🟨";
  return "🟥";
}

// A shareable, no-PII summary: score, per-round squares, and a link.
function buildShareText(finalScore: number, rounds: RoundData[]): string {
  const squares = rounds.map(roundSquare).join("");
  const url =
    typeof window !== "undefined" ? window.location.origin : "https://geoarena";
  const headline = `GeoArena 🌍 — ${finalScore.toLocaleString()}/${MAX_GAME_SCORE.toLocaleString()} pts`;
  return `${headline}\n${squares}\nCan you beat me? ${url}`;
}

function ResultIcon({ color }: { color: string }) {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
      <circle cx="12" cy="12" r="3" fill={color} opacity="0.2" />
    </svg>
  );
}

function RoundRow({ round, index }: { round: RoundData; index: number }) {
  const name = useReverseGeocode(round.location.lat, round.location.lng);
  const tier = getScoreTier(round.points);

  return (
    <div className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="text-xs text-zinc-500 w-4 shrink-0">{index + 1}</span>
        <div className="text-left min-w-0">
          <p className="text-xs sm:text-sm font-medium text-white truncate">
            {name}
          </p>
          <p className="text-[10px] sm:text-xs text-zinc-500">
            {formatDistance(round.distance)}
          </p>
        </div>
      </div>
      <span
        className="font-bold text-xs sm:text-sm shrink-0 ml-2 tabular-nums"
        style={{ color: tier.color }}
      >
        +{round.points.toLocaleString()}
      </span>
    </div>
  );
}

export default function GameSummary({
  finalScore,
  rounds,
  onPlayAgain,
}: GameSummaryProps) {
  const { color, message } = getScoreMessage(finalScore);
  const animatedScore = useAnimatedNumber(finalScore, 1200, 0);
  const pct = Math.min(100, Math.round((finalScore / MAX_GAME_SCORE) * 100));
  const [shared, setShared] = useState(false);

  async function handleShare() {
    const text = buildShareText(finalScore, rounds);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      // user cancelled the share sheet, or it failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // clipboard blocked — nothing else we can do
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayAgain]);

  return (
    <div className="flex flex-col items-center justify-start sm:justify-center gap-4 sm:gap-6 h-full text-center px-4 py-6 sm:py-8 overflow-y-auto">
      <ResultIcon color={color} />

      <div>
        <h1 className="font-display text-2xl sm:text-4xl font-bold text-white mb-1">
          {message}
        </h1>
        <p className="text-zinc-400 text-sm">
          {ROUNDS_PER_GAME} rounds completed
        </p>
      </div>

      {/* Score card */}
      <div className="rounded-2xl p-4 sm:p-6 w-full max-w-[320px] bg-zinc-800">
        <p className="text-xs sm:text-sm text-zinc-400 uppercase tracking-wider mb-1">
          Final Score
        </p>
        <p className="text-4xl sm:text-5xl font-bold tabular-nums text-yellow-400">
          {animatedScore.toLocaleString()}
        </p>
        <div className="w-full h-2 bg-zinc-700 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 bg-yellow-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs sm:text-sm mt-2">
          <span className="text-zinc-500">
            of {MAX_GAME_SCORE.toLocaleString()}
          </span>
          <span className="text-zinc-500">{pct}%</span>
        </div>
      </div>

      {/* Round breakdown */}
      <div className="w-full max-w-md">
        <h3 className="text-xs sm:text-sm text-zinc-500 uppercase tracking-wider mb-2 sm:mb-3">
          Round Breakdown
        </h3>
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {rounds.map((r, i) => (
            <RoundRow key={i} round={r} index={i} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 pb-4">
        <Link
          href="/"
          className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-full shadow-lg transition-all text-base sm:text-lg cursor-pointer"
        >
          Menu
        </Link>
        <button
          onClick={handleShare}
          className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 sm:py-4 px-5 sm:px-6 rounded-full shadow-lg transition-all text-base sm:text-lg cursor-pointer flex items-center gap-2"
          title="Share your result"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span className="hidden sm:inline">{shared ? "Copied!" : "Share"}</span>
        </button>
        <button
          onClick={onPlayAgain}
          className="bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold py-3 sm:py-4 px-6 sm:px-10 rounded-full shadow-lg transition-all text-base sm:text-xl cursor-pointer flex items-center gap-2"
        >
          <span>Play Again</span>
          <kbd className="hidden sm:inline text-xs bg-green-600 px-1.5 py-0.5 rounded">
            Enter
          </kbd>
        </button>
      </div>
    </div>
  );
}
