"use client";

import { useEffect, useRef } from "react";
import { formatDistance } from "@/lib/game";
import { DUEL_STARTING_SCORE } from "@/lib/duel";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { createPinIcon } from "@/lib/map-utils";
import type { Location } from "@/lib/locations";

interface DuelRoundResultProps {
  round: number;
  totalRounds: number;
  location: Location;
  myGuess: { lat: number; lng: number };
  opponentGuess: { lat: number; lng: number };
  myDistance: number;
  opponentDistance: number;
  penalty: number;
  iWon: boolean;
  isDraw: boolean;
  myScore: number;
  opponentScore: number;
  myName: string;
  myEmoji: string;
  opponentName: string;
  opponentEmoji: string;
  onNext: () => void;
  isFinalRound: boolean;
}

export default function DuelRoundResult({
  round,
  totalRounds,
  location,
  myGuess,
  opponentGuess,
  myDistance,
  opponentDistance,
  penalty,
  iWon,
  isDraw,
  myScore,
  opponentScore,
  myName,
  myEmoji,
  opponentName,
  opponentEmoji,
  onNext,
  isFinalRound,
}: DuelRoundResultProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const locationName = useReverseGeocode(location.lat, location.lng);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    const bounds = new google.maps.LatLngBounds();
    const actual = { lat: location.lat, lng: location.lng };
    bounds.extend(actual);
    bounds.extend(myGuess);
    bounds.extend(opponentGuess);

    const map = new google.maps.Map(mapRef.current, {
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
    });

    map.fitBounds(bounds, 60);

    // Actual location pin (green)
    new google.maps.Marker({
      position: actual,
      map,
      icon: createPinIcon("#22c55e", "#15803d"),
      title: "Actual location",
    });

    // My guess (cyan)
    new google.maps.Marker({
      position: myGuess,
      map,
      icon: createPinIcon("#06b6d4", "#0891b2"),
      title: myName,
    });

    // Opponent guess (red)
    new google.maps.Marker({
      position: opponentGuess,
      map,
      icon: createPinIcon("#ef4444", "#dc2626"),
      title: opponentName,
    });

    // Lines
    const dashIcon = (color: string) => ({
      path: "M 0,-1 0,1",
      strokeOpacity: 1,
      strokeColor: color,
      scale: 3,
    });

    new google.maps.Polyline({
      path: [actual, myGuess],
      map,
      strokeOpacity: 0,
      icons: [{ icon: dashIcon("#06b6d4"), offset: "0", repeat: "16px" }],
      geodesic: true,
    });

    new google.maps.Polyline({
      path: [actual, opponentGuess],
      map,
      strokeOpacity: 0,
      icons: [{ icon: dashIcon("#ef4444"), offset: "0", repeat: "16px" }],
      geodesic: true,
    });
  }, [location, myGuess, opponentGuess, myName, opponentName]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext]);

  const resultLabel = isDraw ? "Draw" : iWon ? "You won!" : "You lost";
  const resultColor = isDraw
    ? "text-yellow-400"
    : iWon
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-zinc-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                {locationName}
              </h2>
              <p className="text-zinc-500 text-xs">
                Round {round} of {totalRounds}
              </p>
            </div>
            <p className={`font-display text-xl sm:text-2xl font-bold ${resultColor}`}>
              {resultLabel}
            </p>
          </div>

          {/* Players comparison */}
          <div className="flex items-center justify-between gap-2 mt-3">
            {/* Me */}
            <div className={`flex-1 rounded-lg p-2 sm:p-3 ${iWon || isDraw ? "bg-emerald-950/30 border border-emerald-900/30" : "bg-zinc-900"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{myEmoji}</span>
                <span className="text-sm font-medium text-white truncate">
                  {myName}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {formatDistance(myDistance)}
              </p>
              <p className="text-lg font-bold text-cyan-400 tabular-nums">
                {myScore.toLocaleString()}
                {!iWon && !isDraw && (
                  <span className="text-red-400 text-sm ml-1">
                    -{penalty.toLocaleString()}
                  </span>
                )}
              </p>
            </div>

            <span className="text-zinc-600 text-xs shrink-0">vs</span>

            {/* Opponent */}
            <div className={`flex-1 rounded-lg p-2 sm:p-3 ${!iWon && !isDraw ? "bg-emerald-950/30 border border-emerald-900/30" : "bg-zinc-900"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{opponentEmoji}</span>
                <span className="text-sm font-medium text-white truncate">
                  {opponentName}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {formatDistance(opponentDistance)}
              </p>
              <p className="text-lg font-bold text-red-400 tabular-nums">
                {opponentScore.toLocaleString()}
                {iWon && (
                  <span className="text-red-400 text-sm ml-1">
                    -{penalty.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapRef} className="w-full h-full" />

        {/* Legend */}
        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-xs space-y-1 z-10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-zinc-300">Actual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span className="text-zinc-300">{myName}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-zinc-300">{opponentName}</span>
          </div>
        </div>
      </div>

      {/* Next button */}
      <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20 sm:absolute sm:bottom-6">
        <button
          onClick={onNext}
          className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-2.5 sm:py-3 px-8 sm:px-10 rounded-full shadow-lg transition-all text-base sm:text-lg cursor-pointer flex items-center gap-2"
        >
          <span>
            {isFinalRound ? "Final Results" : "Next Round"}
          </span>
          <kbd className="hidden sm:inline text-xs bg-blue-600/50 px-1.5 py-0.5 rounded">
            Enter
          </kbd>
        </button>
      </div>
    </div>
  );
}
