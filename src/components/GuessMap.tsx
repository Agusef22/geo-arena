"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { createPinIcon } from "@/lib/map-utils";

interface GuessMapProps {
  onGuess: (lat: number, lng: number) => void;
  disabled?: boolean;
}

export default function GuessMap({ onGuess, disabled }: GuessMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasGuess, setHasGuess] = useState(false);
  const guessRef = useRef<{ lat: number; lng: number } | null>(null);
  const { playPin, playConfirm } = useSoundEffects();

  const placeMarker = useCallback(
    (latLng: google.maps.LatLng, map: google.maps.Map) => {
      if (disabled) return;

      const lat = latLng.lat();
      const lng = latLng.lng();
      guessRef.current = { lat, lng };
      setHasGuess(true);
      playPin();

      if (markerRef.current) {
        markerRef.current.setPosition(latLng);
      } else {
        const marker = new google.maps.Marker({
          position: latLng,
          map,
          draggable: true,
          icon: createPinIcon("#3b82f6", "#1d4ed8"),
          cursor: "grab",
        });

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) {
            guessRef.current = { lat: pos.lat(), lng: pos.lng() };
            playPin();
          }
        });

        markerRef.current = marker;
      }
    },
    [disabled, playPin]
  );

  useEffect(() => {
    if (!containerRef.current || !window.google || mapRef.current) return;

    const map = new google.maps.Map(containerRef.current, {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: false,
      gestureHandling: "greedy",
      minZoom: 2,
      clickableIcons: false,
    });

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) placeMarker(e.latLng, map);
    });

    mapRef.current = map;
  }, [placeMarker]);

  const handleConfirm = useCallback(() => {
    if (guessRef.current) {
      playConfirm();
      onGuess(guessRef.current.lat, guessRef.current.lng);
    }
  }, [playConfirm, onGuess]);

  // Keyboard: Enter to confirm guess
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && hasGuess && !disabled) {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasGuess, disabled, handleConfirm]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-lg" />

      {hasGuess && !disabled && (
        <button
          onClick={handleConfirm}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold py-2 px-5 sm:py-2.5 sm:px-6 rounded-full shadow-lg transition-all text-sm sm:text-base cursor-pointer flex items-center gap-2"
        >
          <span>Guess</span>
          <kbd className="hidden sm:inline text-xs bg-green-600 px-1.5 py-0.5 rounded">
            Enter
          </kbd>
        </button>
      )}
    </div>
  );
}
