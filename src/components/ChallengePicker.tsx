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
    <div className="relative rounded-3xl p-6 bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] hover:-translate-y-1 transition-transform duration-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="anim-wiggle inline-block">🔥</span> Challenge
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
        <p className="text-sm text-indigo-50/90 leading-relaxed mb-6 min-h-[3em]">
          Crank the difficulty. Beat the clock, or guess from a single frozen
          view.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-100/80">
            harder
          </span>
          <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
            {open ? "Pick one" : "Play →"}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-white/20 space-y-2 anim-pop-in">
          {CHALLENGES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 bg-white/15 hover:bg-white/25 active:scale-[0.98] text-sm font-medium transition-all"
            >
              <span>{c.label}</span>
              <span className="text-[11px] text-indigo-100/80">{c.desc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
