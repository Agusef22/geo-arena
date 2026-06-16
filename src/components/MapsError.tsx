"use client";

import Link from "next/link";

// Shown when Google Maps can't load (auth/domain/connection/ad-blocker). The
// game must not start without the map, so we surface this instead.
export default function MapsError() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-6"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <line x1="9" y1="7" x2="15" y2="13" />
        <line x1="15" y1="7" x2="9" y2="13" />
      </svg>
      <h2 className="text-xl font-bold text-white mb-2">Maps couldn&apos;t load</h2>
      <p className="text-neutral-500 text-sm mb-6 max-w-sm">
        Google Maps failed to load — usually a connection issue, an ad-blocker,
        or a temporary problem. The game can&apos;t start without it.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-6 rounded-full transition-all"
        >
          Menu
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-3 px-8 rounded-full transition-all cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
