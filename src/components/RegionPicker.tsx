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
    <div className="relative border border-neutral-900 rounded-2xl p-6 bg-[#0c0c0c] hover:border-emerald-900/50 hover:bg-emerald-950/10 transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl font-extrabold text-neutral-200 tracking-tight">
            Regions
          </h3>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <p className="text-sm text-neutral-400 leading-relaxed mb-6 min-h-[3em]">
          Pick a specific area. Europe, Asia, Americas. Test where it counts.
        </p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
            custom area
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500 px-2.5 py-1 border border-emerald-900/50 rounded-full">
            {open ? "Pick one" : "Play"}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-neutral-900 grid grid-cols-2 gap-2">
          {regions.map((r) => (
            <Link
              key={r.key}
              href={`/play?region=${r.key}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 bg-neutral-900/50 hover:bg-emerald-950/40 text-sm text-neutral-300 hover:text-emerald-300 transition-colors"
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
