"use client";

import { useEffect, useRef } from "react";
import {
  formatDistance,
  getScoreTier,
  MAX_ROUND_SCORE,
  MAX_GAME_SCORE,
} from "@/lib/game";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { createPinIcon } from "@/lib/map-utils";
import { useAuth } from "@/context/AuthContext";

interface RoundResultProps {
  actualLat: number;
  actualLng: number;
  guessLat: number;
  guessLng: number;
  distanceKm: number;
  points: number;
  currentScore: number;
  previousScore: number;
  round: number;
  totalRounds: number;
  onNext: () => void;
  isFinalRound: boolean;
}

export default function RoundResult({
  actualLat,
  actualLng,
  guessLat,
  guessLng,
  distanceKm,
  points,
  currentScore,
  previousScore,
  round,
  totalRounds,
  onNext,
  isFinalRound,
}: RoundResultProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const animatedPoints = useAnimatedNumber(points, 1000);
  const animatedTotal = useAnimatedNumber(currentScore, 1000, previousScore);
  const tier = getScoreTier(points);
  const locationName = useReverseGeocode(actualLat, actualLng);
  const { profile } = useAuth();
  // The player's avatar for their guess pin; falls back to a target when
  // playing without an account.
  const myEmoji = profile?.emoji ?? "🎯";

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    const bounds = new google.maps.LatLngBounds();
    const actual = { lat: actualLat, lng: actualLng };
    const guess = { lat: guessLat, lng: guessLng };
    bounds.extend(actual);
    bounds.extend(guess);

    const map = new google.maps.Map(mapRef.current, {
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
    });

    map.fitBounds(bounds, 60);

    new google.maps.Marker({
      position: actual,
      map,
      icon: createPinIcon("#22c55e", "#15803d"),
      title: "Actual location",
      label: { text: "📍", fontSize: "13px" },
      zIndex: 1,
    });

    new google.maps.Marker({
      position: guess,
      map,
      icon: createPinIcon("#3b82f6", "#1d4ed8"),
      title: "Your guess",
      label: { text: myEmoji, fontSize: "14px" },
      zIndex: 2,
    });

    new google.maps.Polyline({
      path: [actual, guess],
      map,
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 1,
            strokeColor: "#ef4444",
            scale: 3,
          },
          offset: "0",
          repeat: "16px",
        },
      ],
      geodesic: true,
    });
  }, [actualLat, actualLng, guessLat, guessLng, myEmoji]);

  const scoreBarWidth = `${Math.min(100, (currentScore / MAX_GAME_SCORE) * 100)}%`;

  return (
    <div className="flex flex-col h-full">
      {/* Top info bar */}
      <div className="bg-zinc-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto">
          {/* Location name */}
          <div className="text-center sm:text-left mb-2 sm:mb-0 sm:float-left">
            <h2 className="font-display text-lg sm:text-2xl font-bold text-white">
              {locationName}
            </h2>
            <p className="text-zinc-400 text-xs sm:text-sm">
              Round {round} of {totalRounds}
            </p>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center sm:justify-end gap-3 sm:gap-6 sm:clear-none clear-both">
            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Distance
              </p>
              <p className="text-sm sm:text-lg font-bold text-zinc-300">
                {formatDistance(distanceKm)}
              </p>
            </div>

            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Points
              </p>
              <p
                className="text-lg sm:text-2xl font-bold tabular-nums"
                style={{ color: tier.color }}
              >
                +{animatedPoints.toLocaleString()}
              </p>
              <p
                className="text-[10px] sm:text-xs font-medium"
                style={{ color: tier.color }}
              >
                {tier.label}
              </p>
            </div>

            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Total
              </p>
              <p className="text-sm sm:text-lg font-bold tabular-nums text-yellow-400">
                {animatedTotal.toLocaleString()}
              </p>
              <div className="w-16 sm:w-24 h-1.5 bg-zinc-700 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out bg-yellow-400"
                  style={{ width: scoreBarWidth }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapRef} className="w-full h-full" />

        {/* Legend */}
        <div className="absolute top-3 right-3 bg-black/75 backdrop-blur-sm rounded-lg px-3 py-2 text-xs space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-zinc-300">📍 Actual location</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-blue-300 font-medium">
              {myEmoji} Your guess
            </span>
          </div>
        </div>

        {points >= MAX_ROUND_SCORE && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500/90 backdrop-blur-sm text-white font-bold text-lg sm:text-xl px-6 py-2 rounded-full shadow-lg animate-pulse z-10">
            PERFECT · 5,000
          </div>
        )}
      </div>

      {/* Next button — fixed on mobile so it's always visible */}
      <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20 sm:absolute sm:bottom-6">
        <button
          onClick={onNext}
          className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-2.5 sm:py-3 px-8 sm:px-10 rounded-full shadow-lg transition-all text-base sm:text-lg cursor-pointer flex items-center gap-2"
        >
          <span>{isFinalRound ? "Final Results" : "Next Round"}</span>
          <kbd className="hidden sm:inline text-xs bg-blue-600/50 px-1.5 py-0.5 rounded">
            Enter
          </kbd>
        </button>
      </div>
    </div>
  );
}
