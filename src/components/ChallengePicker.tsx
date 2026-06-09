"use client";

import { useState } from "react";
import Link from "next/link";

// Home-page card that expands into the difficulty modifiers. Each one starts a
// classic game with the corresponding flags via /play.
const CHALLENGES: { label: string; desc: string; href: string }[] = [
  { label: "⏱️ Timed", desc: "30s per round", href: "/play?timed=1" },
  { label: "🚷 No Move", desc: "Look, don't walk", href: "/play?nomove=1" },
  {
    label: "🔥 Timed + No Move",
    desc: "Both at once",
    href: "/play?timed=1&nomove=1",
  },
];

export default function ChallengePicker() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative border border-neutral-900 rounded-2xl p-6 bg-[#0c0c0c] hover:border-emerald-900/50 hover:bg-emerald-950/10 transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl font-extrabold text-neutral-200 tracking-tight">
            Challenge
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
          Crank the difficulty. Beat the clock, or guess from a single frozen
          view.
        </p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
            harder
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500 px-2.5 py-1 border border-emerald-900/50 rounded-full">
            {open ? "Pick one" : "Play"}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-neutral-900 space-y-2">
          {CHALLENGES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-neutral-900/50 hover:bg-emerald-950/40 text-sm text-neutral-300 hover:text-emerald-300 transition-colors"
            >
              <span className="font-medium">{c.label}</span>
              <span className="text-[11px] text-neutral-500">{c.desc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
