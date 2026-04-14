"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import StreetView from "./StreetView";
import GuessMap from "./GuessMap";
import RoundResult from "./RoundResult";
import GameSummary from "./GameSummary";
import { findStreetViewLocation, type Location } from "@/lib/locations";
import type { RoundData } from "@/lib/types";
import {
  haversineDistance,
  calculatePenalty,
  calculateBonus,
  distanceToPenaltyRatio,
  getRoundMaxPenalty,
  ROUNDS_PER_GAME,
  STARTING_SCORE,
} from "@/lib/game";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { saveGameResult } from "@/lib/supabase/game-results";

type GamePhase = "loading" | "playing" | "result" | "summary" | "gameover" | "error";

export default function Game() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [displayedScore, setDisplayedScore] = useState(STARTING_SCORE);
  const streetViewKeyRef = useRef(0);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const savedRef = useRef(false);
  const { playGood, playBad, playNext } = useSoundEffects();
  const animatedHud = useAnimatedNumber(displayedScore, 800, STARTING_SCORE);

  useEffect(() => {
    if (window.google) {
      svServiceRef.current = new google.maps.StreetViewService();
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setPhase("loading");
    setLoadProgress(0);

    if (!svServiceRef.current) {
      svServiceRef.current = new google.maps.StreetViewService();
    }

    const locs: Location[] = [];
    let attempts = 0;
    const maxAttempts = ROUNDS_PER_GAME * 15;

    while (locs.length < ROUNDS_PER_GAME && attempts < maxAttempts) {
      const promises = Array.from({ length: 5 }, () =>
        findStreetViewLocation(svServiceRef.current!)
      );

      const results = await Promise.all(promises);

      for (const result of results) {
        if (result && locs.length < ROUNDS_PER_GAME) {
          const tooClose = locs.some((existing) => {
            const dLat = existing.lat - result.lat;
            const dLng = existing.lng - result.lng;
            return Math.sqrt(dLat * dLat + dLng * dLng) < 0.5;
          });

          if (!tooClose) {
            locs.push(result);
            setLoadProgress(locs.length);
          }
        }
      }

      attempts += 5;
    }

    if (locs.length < ROUNDS_PER_GAME) {
      setPhase("error");
      return;
    }

    setLocations(locs);
    setCurrentRound(0);
    setRounds([]);
    setDisplayedScore(STARTING_SCORE);
    setPhase("playing");
    setMapOpen(false);
    streetViewKeyRef.current += 1;
    savedRef.current = false;
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const currentLocation = locations[currentRound];

  // Current score = starting score - penalties + bonuses
  const currentScore = useMemo(
    () => Math.max(0, STARTING_SCORE - rounds.reduce((sum, r) => sum + r.penalty, 0) + rounds.reduce((sum, r) => sum + r.bonus, 0)),
    [rounds]
  );

  const handleGuess = useCallback(
    (guessLat: number, guessLng: number) => {
      if (!currentLocation) return;
      const distance = haversineDistance(
        currentLocation.lat,
        currentLocation.lng,
        guessLat,
        guessLng
      );
      const penalty = calculatePenalty(distance, currentRound);
      const penaltyRatio = distanceToPenaltyRatio(distance);
      const maxPenalty = getRoundMaxPenalty(currentRound);
      const bonus = calculateBonus(distance);

      // Sound based on how well they did
      if (bonus > 0) {
        playGood();
      } else if (penaltyRatio < 0.2) {
        playGood();
      } else {
        playBad();
      }

      setRounds((prev) => [
        ...prev,
        {
          location: currentLocation,
          guessLat,
          guessLng,
          distance,
          penalty,
          penaltyRatio,
          maxPenalty,
          bonus,
        },
      ]);
      setPhase("result");
      setMapOpen(false);
    },
    [currentLocation, currentRound, playGood, playBad]
  );

  const handleNext = useCallback(() => {
    playNext();

    // Calculate score after this round
    const totalPenalty = rounds.reduce((sum, r) => sum + r.penalty, 0);
    const totalBonus = rounds.reduce((sum, r) => sum + r.bonus, 0);
    const scoreAfter = Math.max(0, STARTING_SCORE - totalPenalty + totalBonus);

    // Hard stop: game over if score hit 0
    if (scoreAfter <= 0) {
      setPhase("gameover");
      if (!savedRef.current) {
        savedRef.current = true;
        saveGameResult({ score: 0, rounds, gameOver: true });
      }
      return;
    }

    if (currentRound + 1 >= ROUNDS_PER_GAME) {
      setPhase("summary");
      if (!savedRef.current) {
        savedRef.current = true;
        saveGameResult({ score: scoreAfter, rounds, gameOver: false });
      }
    } else {
      setCurrentRound((r) => r + 1);
      setPhase("playing");
      setMapOpen(false);
      streetViewKeyRef.current += 1;
      setDisplayedScore(scoreAfter);
    }
  }, [currentRound, rounds, playNext]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((phase === "result" || phase === "gameover") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (phase === "result") handleNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleNext]);

  // Loading screen
  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 bg-grid px-4">
        <div className="text-center">
          <div className="relative mx-auto mb-6 w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-zinc-700 animate-pulse" />
            <div
              className="absolute inset-2 rounded-full border border-zinc-600 animate-spin"
              style={{ animationDuration: "3s" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
          </div>

          <p className="text-zinc-300 text-lg font-medium mb-1">
            Finding locations...
          </p>
          <p className="text-zinc-500 text-sm mb-4">
            Searching for Street View coverage worldwide
          </p>

          <div className="w-56 h-2 bg-zinc-800 rounded-full mx-auto overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(loadProgress / ROUNDS_PER_GAME) * 100}%`,
              }}
            />
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            {loadProgress} of {ROUNDS_PER_GAME} locations found
          </p>
        </div>
      </div>
    );
  }

  // Error screen
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 bg-grid px-4">
        <div className="text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-6 mx-auto">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
            <line x1="8" y1="8" x2="16" y2="16" stroke="#ef4444" strokeWidth="2" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">
            Couldn&apos;t find enough locations
          </h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-sm">
            Street View coverage wasn&apos;t available in enough areas. This can
            happen with slow connections. Try again!
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 px-6 rounded-full transition-all cursor-pointer"
            >
              Menu
            </Link>
            <button
              onClick={loadLocations}
              className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-3 px-8 rounded-full transition-all cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game Over screen
  if (phase === "gameover") {
    return (
      <div className="h-screen bg-zinc-950">
        <GameSummary
          finalScore={0}
          rounds={rounds}
          onPlayAgain={loadLocations}
          gameOver
        />
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="h-screen bg-zinc-950">
        <GameSummary
          finalScore={currentScore}
          rounds={rounds}
          onPlayAgain={loadLocations}
        />
      </div>
    );
  }

  if (phase === "result") {
    const lastRound = rounds[rounds.length - 1];
    const prevRounds = rounds.slice(0, -1);
    const scoreBeforeThisRound = STARTING_SCORE - prevRounds.reduce((sum, r) => sum + r.penalty, 0) + prevRounds.reduce((sum, r) => sum + r.bonus, 0);
    return (
      <div className="h-screen bg-zinc-900">
        <RoundResult
          actualLat={lastRound.location.lat}
          actualLng={lastRound.location.lng}
          guessLat={lastRound.guessLat}
          guessLng={lastRound.guessLng}
          distanceKm={lastRound.distance}
          penalty={lastRound.penalty}
          penaltyRatio={lastRound.penaltyRatio}
          maxPenalty={lastRound.maxPenalty}
          bonus={lastRound.bonus}
          currentScore={currentScore}
          previousScore={scoreBeforeThisRound}
          round={currentRound + 1}
          totalRounds={ROUNDS_PER_GAME}
          onNext={handleNext}
          isFinalRound={currentRound + 1 >= ROUNDS_PER_GAME || currentScore <= 0}
        />
      </div>
    );
  }

  if (!currentLocation) return null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      {/* Street View */}
      <div className="absolute inset-0">
        <StreetView
          key={`${currentLocation.id}-${streetViewKeyRef.current}`}
          lat={currentLocation.lat}
          lng={currentLocation.lng}
        />
      </div>

      {/* HUD top bar */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          {/* Back to menu */}
          <Link
            href="/"
            className="bg-black/70 backdrop-blur-sm rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3 text-white hover:bg-black/90 transition-colors"
            title="Back to menu"
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
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </Link>

          {/* Round info */}
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-white flex items-center gap-2 sm:gap-4">
            {/* Round dots */}
            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: ROUNDS_PER_GAME }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    i < currentRound
                      ? "bg-green-500"
                      : i === currentRound
                      ? "bg-blue-500 ring-2 ring-blue-300"
                      : "bg-zinc-600"
                  }`}
                />
              ))}
              <div className="w-px h-6 bg-zinc-600 ml-1" />
            </div>
            <span className="font-bold text-xs sm:text-sm">
              {currentRound + 1}/{ROUNDS_PER_GAME}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-5 sm:py-3 pointer-events-auto">
          <span className="text-yellow-400 font-bold text-sm sm:text-lg tabular-nums">
            {animatedHud.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Mobile: toggle map button */}
      <button
        onClick={() => setMapOpen((o) => !o)}
        className={`sm:hidden absolute z-20 bottom-4 right-4 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-full w-14 h-14 items-center justify-center shadow-xl cursor-pointer transition-all ${mapOpen ? "hidden" : "flex"}`}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </button>

      {/* Mobile: backdrop when map is open */}
      {mapOpen && (
        <div className="sm:hidden fixed inset-0 z-20 bg-black/70" />
      )}

      {/* GuessMap */}
      <div
        className={
          mapOpen
            ? "fixed inset-2 top-14 bottom-4 z-30 sm:absolute sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[70vw] sm:h-[70vh] sm:scale-[0.3] sm:hover:scale-100 sm:origin-bottom-right sm:transition-transform sm:duration-300 sm:ease-out sm:z-10"
            : "hidden sm:block absolute z-10 bottom-4 right-4 w-[70vw] h-[70vh] scale-[0.3] hover:scale-100 origin-bottom-right transition-transform duration-300 ease-out"
        }
      >
        <div className="w-full h-full rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl">
          <GuessMap onGuess={handleGuess} />
        </div>
      </div>

      {/* Mobile: close map button */}
      {mapOpen && (
        <button
          onClick={() => setMapOpen(false)}
          className="sm:hidden fixed top-3 right-3 bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer z-40"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
