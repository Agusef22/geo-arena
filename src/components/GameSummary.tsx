"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  STARTING_SCORE,
  ROUNDS_PER_GAME,
  formatDistance,
  getPenaltyTier,
} from "@/lib/game";
import type { RoundData } from "@/lib/types";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface GameSummaryProps {
  finalScore: number;
  rounds: RoundData[];
  onPlayAgain: () => void;
}

function getScoreMessage(score: number): { emoji: string; message: string } {
  const pct = score / STARTING_SCORE;
  if (pct >= 0.9) return { emoji: "🏆", message: "Legendary!" };
  if (pct >= 0.7) return { emoji: "🔥", message: "Amazing!" };
  if (pct >= 0.5) return { emoji: "👏", message: "Great job!" };
  if (pct >= 0.3) return { emoji: "🌍", message: "Not bad!" };
  return { emoji: "🗺️", message: "Keep exploring!" };
}

function RoundRow({ round, index }: { round: RoundData; index: number }) {
  const name = useReverseGeocode(round.location.lat, round.location.lng);
  const tier = getPenaltyTier(round.penalty);

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
            {round.multiplier > 1 && (
              <span className="ml-1.5 text-orange-400">
                x{round.multiplier.toFixed(1)}
              </span>
            )}
          </p>
        </div>
      </div>
      <span
        className="font-bold text-xs sm:text-sm shrink-0 ml-2"
        style={{ color: tier.color }}
      >
        {round.penalty === 0 ? "0" : `-${round.penalty.toLocaleString()}`}
      </span>
    </div>
  );
}

export default function GameSummary({
  finalScore,
  rounds,
  onPlayAgain,
}: GameSummaryProps) {
  const { emoji, message } = getScoreMessage(finalScore);
  const animatedScore = useAnimatedNumber(finalScore, 1200);
  const totalPenalty = rounds.reduce((sum, r) => sum + r.penalty, 0);
  const pct = Math.round((finalScore / STARTING_SCORE) * 100);

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
      <div className="text-5xl sm:text-7xl">{emoji}</div>

      <div>
        <h1 className="font-display text-2xl sm:text-4xl font-bold text-white mb-1">
          {message}
        </h1>
        <p className="text-zinc-400 text-sm">
          {ROUNDS_PER_GAME} rounds completed
        </p>
      </div>

      {/* Score card */}
      <div className="bg-zinc-800 rounded-2xl p-4 sm:p-6 w-full max-w-[320px]">
        <p className="text-xs sm:text-sm text-zinc-400 uppercase tracking-wider mb-1">
          Final Score
        </p>
        <p className="text-4xl sm:text-5xl font-bold text-yellow-400">
          {animatedScore.toLocaleString()}
        </p>
        <div className="w-full h-2 bg-zinc-700 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs sm:text-sm mt-2">
          <span className="text-zinc-500">{pct}% remaining</span>
          <span className="text-red-400">
            -{totalPenalty.toLocaleString()} lost
          </span>
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
          onClick={onPlayAgain}
          className="bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold py-3 sm:py-4 px-8 sm:px-12 rounded-full shadow-lg transition-all text-base sm:text-xl cursor-pointer flex items-center gap-2"
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
