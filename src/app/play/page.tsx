"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import Game from "@/components/Game";
import MapsError from "@/components/MapsError";
import { resolveRegion } from "@/lib/regions";
import { useMapsAuthError } from "@/lib/useMapsAuthError";

function PlayInner() {
  const params = useSearchParams();
  const region = resolveRegion(params.get("region"));
  const timed = params.get("timed") === "1";
  const noMove = params.get("nomove") === "1";
  const mapsAuthFailed = useMapsAuthError();

  // Lazy init: if the Maps script is already on the page (e.g. client-side
  // navigation from another map route), skip the loading state entirely.
  const [mapsLoaded, setMapsLoaded] = useState(
    () => typeof window !== "undefined" && !!window.google?.maps
  );

  if (mapsAuthFailed) return <MapsError />;

  if (!mapsLoaded) {
    return (
      <>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
          strategy="afterInteractive"
          onLoad={() => setMapsLoaded(true)}
        />
        <div className="flex items-center justify-center h-screen bg-zinc-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg">Loading maps...</p>
          </div>
        </div>
      </>
    );
  }

  return <Game region={region} timed={timed} noMove={noMove} />;
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-zinc-900">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        </div>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
