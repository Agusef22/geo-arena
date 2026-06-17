"use client";

import { useState } from "react";
import Link from "next/link";
import { REGIONS } from "@/lib/regions";

// Home-page card that expands into the continent presets. Each one starts a
// classic game scoped to that region via /play?region=<key>.
export default function RegionPicker() {
  const [open, setOpen] = useState(false);
  const regions = REGIONS.filter((r) => r.key !== "world");

  return (
    <div className="relative rounded-3xl p-6 bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_10px_30px_-10px_rgba(14,165,233,0.6)] hover:-translate-y-1 transition-transform duration-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="anim-wiggle inline-block">🗺️</span> Regions
          </h3>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-white/90 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <p className="text-sm text-sky-50/90 leading-relaxed mb-6 min-h-[3em]">
          Pick a specific area. Europe, Asia, Americas. Test where it counts.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-100/80">
            custom area
          </span>
          <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
            {open ? "Pick one" : "Play →"}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-2 anim-pop-in">
          {regions.map((r) => (
            <Link
              key={r.key}
              href={`/play?region=${r.key}`}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-white/15 hover:bg-white/25 active:scale-[0.98] text-sm font-medium transition-all"
            >
              <span>{r.emoji}</span>
              <span className="truncate">{r.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
