"use client";

import { use, useEffect, useState } from "react";
import Script from "next/script";
import DuelGame from "@/components/DuelGame";

export default function DuelGamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  useEffect(() => {
    if (window.google?.maps) {
      setMapsLoaded(true);
    }
  }, []);

  if (!mapsLoaded) {
    return (
      <>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry`}
          strategy="afterInteractive"
          onLoad={() => setMapsLoaded(true)}
        />
        <div className="flex items-center justify-center h-screen bg-zinc-950">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg">Loading maps...</p>
          </div>
        </div>
      </>
    );
  }

  return <DuelGame code={code} />;
}
