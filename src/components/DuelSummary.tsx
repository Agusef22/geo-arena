"use client";

import { useEffect } from "react";
import Link from "next/link";
import { formatDistance } from "@/lib/game";
import { DUEL_STARTING_SCORE } from "@/lib/duel";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface DuelRoundData {
  location: { lat: number; lng: number };
  myGuess: { lat: number; lng: number };
  opponentGuess: { lat: number; lng: number };
  myDistance: number;
  opponentDistance: number;
  penalty: number;
  iWon: boolean;
  isDraw: boolean;
}

interface DuelSummaryProps {
  rounds: DuelRoundData[];
  myScore: number;
  opponentScore: number;
  myName: string;
  myEmoji: string;
  opponentName: string;
  opponentEmoji: string;
}

export default function DuelSummary({
  rounds,
  myScore,
  opponentScore,
  myName,
  myEmoji,
  opponentName,
  opponentEmoji,
}: DuelSummaryProps) {
  const animatedMyScore = useAnimatedNumber(myScore, 1200);
  const animatedOpponentScore = useAnimatedNumber(opponentScore, 1200);

  const iWin = myScore > opponentScore;
  const isDraw = myScore === opponentScore;
  const iLose = myScore < opponentScore;

  const roundsWon = rounds.filter((r) => r.iWon).length;
  const roundsLost = rounds.filter((r) => !r.iWon && !r.isDraw).length;
  const roundsDrawn = rounds.filter((r) => r.isDraw).length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col items-center justify-start sm:justify-center gap-4 sm:gap-6 h-full text-center px-4 py-6 sm:py-8 overflow-y-auto">
      {/* Result */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-3">
          Duel Complete
        </p>
        <h1
          className={`font-display text-4xl sm:text-5xl font-extrabold tracking-tight ${
            isDraw
              ? "text-yellow-400"
              : iWin
              ? "text-emerald-400"
              : "text-red-400"
          }`}
        >
          {isDraw ? "Draw!" : iWin ? "You Win!" : "You Lose"}
        </h1>
      </div>

      {/* Score comparison */}
      <div className="flex items-center gap-4 sm:gap-8">
        {/* Me */}
        <div className={`rounded-2xl p-4 sm:p-6 min-w-[140px] ${iWin ? "bg-emerald-950/30 border border-emerald-900/40" : isDraw ? "bg-zinc-800" : "bg-zinc-800"}`}>
          <span className="text-3xl">{myEmoji}</span>
          <p className="text-sm font-medium text-white mt-1">{myName}</p>
          <p className={`text-3xl sm:text-4xl font-bold tabular-nums mt-2 ${iWin ? "text-emerald-400" : isDraw ? "text-yellow-400" : "text-red-400"}`}>
            {animatedMyScore.toLocaleString()}
          </p>
          <div className="w-full h-1.5 bg-zinc-700 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${iWin ? "bg-emerald-400" : isDraw ? "bg-yellow-400" : "bg-red-400"}`}
              style={{
                width: `${Math.min(100, (myScore / DUEL_STARTING_SCORE) * 100)}%`,
              }}
            />
          </div>
        </div>

        <span className="text-neutral-600 font-bold text-lg">vs</span>

        {/* Opponent */}
        <div className={`rounded-2xl p-4 sm:p-6 min-w-[140px] ${iLose ? "bg-emerald-950/30 border border-emerald-900/40" : isDraw ? "bg-zinc-800" : "bg-zinc-800"}`}>
          <span className="text-3xl">{opponentEmoji}</span>
          <p className="text-sm font-medium text-white mt-1">{opponentName}</p>
          <p className={`text-3xl sm:text-4xl font-bold tabular-nums mt-2 ${iLose ? "text-emerald-400" : isDraw ? "text-yellow-400" : "text-red-400"}`}>
            {animatedOpponentScore.toLocaleString()}
          </p>
          <div className="w-full h-1.5 bg-zinc-700 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${iLose ? "bg-emerald-400" : isDraw ? "bg-yellow-400" : "bg-red-400"}`}
              style={{
                width: `${Math.min(100, (opponentScore / DUEL_STARTING_SCORE) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <div className="text-center">
          <p className="text-emerald-400 font-bold text-lg">{roundsWon}</p>
          <p className="text-neutral-500 text-xs">Won</p>
        </div>
        <div className="text-center">
          <p className="text-yellow-400 font-bold text-lg">{roundsDrawn}</p>
          <p className="text-neutral-500 text-xs">Draw</p>
        </div>
        <div className="text-center">
          <p className="text-red-400 font-bold text-lg">{roundsLost}</p>
          <p className="text-neutral-500 text-xs">Lost</p>
        </div>
      </div>

      {/* Round breakdown */}
      <div className="w-full max-w-md">
        <h3 className="text-xs sm:text-sm text-zinc-500 uppercase tracking-wider mb-2 sm:mb-3">
          Round Breakdown
        </h3>
        <div className="flex flex-col gap-1.5">
          {rounds.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-zinc-500 w-4">{i + 1}</span>

              {/* My distance */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm">{myEmoji}</span>
                <span className="text-xs text-zinc-300 truncate">
                  {formatDistance(r.myDistance)}
                </span>
              </div>

              {/* Result */}
              <span
                className={`text-xs font-bold px-2 ${
                  r.isDraw
                    ? "text-yellow-400"
                    : r.iWon
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {r.isDraw ? "DRAW" : r.iWon ? "WIN" : `-${r.penalty.toLocaleString()}`}
              </span>

              {/* Opponent distance */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                <span className="text-xs text-zinc-300 truncate">
                  {formatDistance(r.opponentDistance)}
                </span>
                <span className="text-sm">{opponentEmoji}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-4">
        <Link
          href="/"
          className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-all cursor-pointer"
        >
          Menu
        </Link>
        <Link
          href="/duel"
          className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-[#0a0a0a] font-bold py-3 px-8 rounded-full shadow-lg transition-all cursor-pointer"
        >
          Play Again
        </Link>
      </div>
    </div>
  );
}
