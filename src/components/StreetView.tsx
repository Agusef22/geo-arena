"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface StreetViewProps {
  lat: number;
  lng: number;
  // Initial camera heading (degrees) facing down the road. Comes from the
  // curated pool; defaults to 0 for live-searched locations.
  heading?: number;
}

export default function StreetView({ lat, lng, heading = 0 }: StreetViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const startPositionRef = useRef<google.maps.LatLng | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !window.google) return;

    // Guards against setState / DOM work after the round unmounts, and lets us
    // clear pending timers so a stale fallback can't reveal the next round.
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reveal = () => {
      if (!cancelled) setStatus("ok");
    };

    const sv = new google.maps.StreetViewService();
    sv.getPanorama(
      {
        location: { lat, lng },
        // The location was already validated and snapped to a real OUTDOOR
        // panorama by findGameLocations, so a tight radius keeps the panorama
        // we display aligned with the coordinate the round is scored against.
        radius: 50,
        preference: google.maps.StreetViewPreference.NEAREST,
        source: google.maps.StreetViewSource.OUTDOOR,
      },
      (data, svStatus) => {
        if (cancelled) return;

        if (
          svStatus === google.maps.StreetViewStatus.OK &&
          data?.location?.latLng
        ) {
          startPositionRef.current = data.location.latLng;

          panoramaRef.current = new google.maps.StreetViewPanorama(
            containerRef.current!,
            {
              position: data.location.latLng,
              pov: { heading, pitch: 0 },
              zoom: 1,
              addressControl: false,
              showRoadLabels: false,
              linksControl: true,
              panControl: false,
              zoomControl: false,
              enableCloseButton: false,
              fullscreenControl: false,
            }
          );

          // Detect when user moves from start
          panoramaRef.current.addListener("position_changed", () => {
            if (!panoramaRef.current || !startPositionRef.current) return;
            const pos = panoramaRef.current.getPosition();
            if (!pos) return;
            const dist =
              google.maps.geometry?.spherical?.computeDistanceBetween?.(
                pos,
                startPositionRef.current
              );
            // If geometry lib not loaded, just check lat/lng diff
            if (dist !== undefined) {
              setMoved(dist > 10);
            } else {
              const dLat = Math.abs(pos.lat() - startPositionRef.current.lat());
              const dLng = Math.abs(pos.lng() - startPositionRef.current.lng());
              setMoved(dLat > 0.0001 || dLng > 0.0001);
            }
          });

          timers.push(
            setTimeout(() => {
              if (!cancelled && panoramaRef.current) {
                google.maps.event.trigger(panoramaRef.current, "resize");
              }
            }, 100)
          );

          // Keep the spinner up until the tiles have actually rendered, so the
          // player never sees a half-loaded black panorama.
          google.maps.event.addListenerOnce(
            panoramaRef.current,
            "tilesloaded",
            reveal
          );
          // Last-resort safety net: if tilesloaded never fires (rare), reveal
          // anyway after a generous wait rather than spin forever. The dark
          // container background keeps any brief gap from flashing pure black.
          timers.push(setTimeout(reveal, 10000));
        } else {
          if (!cancelled) setStatus("error");
        }
      }
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (panoramaRef.current) {
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null;
      }
    };
  }, [lat, lng, heading]);

  const handleReturnToStart = useCallback(() => {
    if (panoramaRef.current && startPositionRef.current) {
      panoramaRef.current.setPosition(startPositionRef.current);
      panoramaRef.current.setPov({ heading, pitch: 0 });
      setMoved(false);
    }
  }, [heading]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-zinc-900" />

      {/* Return to start button */}
      {moved && status === "ok" && (
        <button
          onClick={handleReturnToStart}
          className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-sm hover:bg-black/90 text-white rounded-xl px-4 py-2.5 transition-all flex items-center gap-2 text-sm font-medium cursor-pointer active:scale-95 md:bottom-4 md:left-4 bottom-20 left-2"
          title="Return to starting position"
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
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span className="hidden sm:inline">Return to start</span>
        </button>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <p className="text-zinc-400">No Street View available here</p>
        </div>
      )}
    </div>
  );
}
