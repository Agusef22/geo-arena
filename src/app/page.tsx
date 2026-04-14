import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import Leaderboard from "@/components/Leaderboard";
import PlayerStatsCard from "@/components/PlayerStats";

function Globe() {
  return (
    <svg
      viewBox="0 0 600 600"
      fill="none"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Sphere outline */}
      <circle cx="300" cy="300" r="260" stroke="#2a2a2a" strokeWidth="1" />

      {/* Parallels — horizontal ellipses, decreasing ry */}
      <ellipse cx="300" cy="300" rx="260" ry="225" stroke="#1c1c1c" />
      <ellipse cx="300" cy="300" rx="260" ry="160" stroke="#1c1c1c" />
      <ellipse cx="300" cy="300" rx="260" ry="85" stroke="#1c1c1c" />
      <line x1="40" y1="300" x2="560" y2="300" stroke="#2a2a2a" />

      {/* Meridians — vertical ellipses, decreasing rx */}
      <ellipse cx="300" cy="300" rx="225" ry="260" stroke="#1c1c1c" />
      <ellipse cx="300" cy="300" rx="160" ry="260" stroke="#1c1c1c" />
      <ellipse cx="300" cy="300" rx="85" ry="260" stroke="#1c1c1c" />
      <line x1="300" y1="40" x2="300" y2="560" stroke="#2a2a2a" />

      {/* Sonar pings — three live locations, multi-color, staggered */}
      <g>
        <circle cx="220" cy="230" r="4" fill="#10b981" />
        <circle
          cx="220"
          cy="230"
          r="4"
          fill="none"
          stroke="#10b981"
          strokeWidth="1.5"
        >
          <animate
            attributeName="r"
            from="4"
            to="36"
            dur="3.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.8"
            to="0"
            dur="3.5s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      <g>
        <circle cx="395" cy="210" r="4" fill="#22d3ee" />
        <circle
          cx="395"
          cy="210"
          r="4"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
        >
          <animate
            attributeName="r"
            from="4"
            to="36"
            dur="3.5s"
            begin="1.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.8"
            to="0"
            dur="3.5s"
            begin="1.2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      <g>
        <circle cx="340" cy="380" r="4" fill="#fbbf24" />
        <circle
          cx="340"
          cy="380"
          r="4"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
        >
          <animate
            attributeName="r"
            from="4"
            to="36"
            dur="3.5s"
            begin="2.4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.8"
            to="0"
            dur="3.5s"
            begin="2.4s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Static dots — quieter locations across the sphere */}
      <circle cx="180" cy="370" r="2.5" fill="#10b981" opacity="0.55" />
      <circle cx="450" cy="340" r="2.5" fill="#22d3ee" opacity="0.55" />
      <circle cx="290" cy="160" r="2.5" fill="#fbbf24" opacity="0.55" />
      <circle cx="430" cy="430" r="2.5" fill="#10b981" opacity="0.55" />
      <circle cx="160" cy="280" r="2.5" fill="#22d3ee" opacity="0.55" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-neutral-600"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ModeCard({
  name,
  desc,
  meta,
}: {
  name: string;
  desc: string;
  meta: string;
}) {
  return (
    <div className="group relative border border-neutral-900 rounded-2xl p-6 bg-[#0c0c0c] hover:border-neutral-800 hover:bg-[#101010] transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-2xl font-extrabold text-neutral-300 tracking-tight">
          {name}
        </h3>
        <LockIcon />
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6 min-h-[3em]">
        {desc}
      </p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
          {meta}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 px-2.5 py-1 border border-neutral-800 rounded-full">
          Soon
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-[#0a0a0a] text-[#fafaf9] relative overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 sm:px-12 pt-6 max-w-[1400px] mx-auto w-full">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          GeoArena
        </span>
        <UserMenu />
      </header>

      {/* Hero — fills viewport */}
      <section className="min-h-[calc(100dvh-80px)] grid lg:grid-cols-[1.1fr_1fr] items-center gap-12 lg:gap-8 px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-8">
        {/* Left: text */}
        <div className="z-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-600 mb-6 flex items-center gap-2">
            <span className="text-emerald-400">↳</span>
            How well do you know Earth?
          </p>

          <h1 className="font-display font-extrabold leading-[0.88] tracking-[-0.045em] text-[clamp(3.5rem,10vw,9.5rem)] whitespace-nowrap">
            Geo
            <span className="font-light text-cyan-400">°</span>
            Arena
          </h1>

          <p className="mt-8 max-w-[36ch] text-base sm:text-lg text-neutral-400 leading-relaxed">
            Drop into a random Street View anywhere on Earth. Read the road
            signs, the trees, the sky. Pin where you think you are.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/play"
              className="group inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#0a0a0a] font-semibold text-base px-7 py-3.5 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(16,185,129,0.55)]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Drop me in</span>
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
              5 rounds · 10,000 pts · survive or die
            </span>
          </div>
        </div>

        {/* Right: wireframe globe with cardinal markers */}
        <div className="hidden lg:block relative aspect-square w-full max-w-[560px] mx-auto">
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
            N
          </span>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
            S
          </span>
          <span className="absolute top-1/2 -left-1 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
            W
          </span>
          <span className="absolute top-1/2 -right-1 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
            E
          </span>
          <Globe />
        </div>
      </section>

      {/* Modes section — coming soon */}
      <section className="px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-20 border-t border-neutral-900">
        <div className="flex items-center justify-between mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500 flex items-center gap-2">
            <span className="text-emerald-400">↳</span>
            More modes incoming
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-700 hidden sm:block">
            03 / in development
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ModeCard
            name="Timed"
            desc="30 seconds per round. Quick decisions, higher pressure."
            meta="30s / round"
          />
          <Link href="/duel" className="group relative border border-neutral-900 rounded-2xl p-6 bg-[#0c0c0c] hover:border-emerald-900/50 hover:bg-emerald-950/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-2xl font-extrabold text-neutral-200 tracking-tight">
                Duel
              </h3>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed mb-6 min-h-[3em]">
              Challenge a friend head-to-head. Same locations, closest guess wins.
            </p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
                1 vs 1
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500 px-2.5 py-1 border border-emerald-900/50 rounded-full">
                Play
              </span>
            </div>
          </Link>
          <ModeCard
            name="Regions"
            desc="Pick a specific area. Europe, Asia, Americas. Test where it counts."
            meta="custom area"
          />
        </div>
      </section>

      {/* Leaderboard + Stats */}
      <section className="px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-16 border-t border-neutral-900">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-8">
          <Leaderboard />
          <PlayerStatsCard />
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 sm:px-12 pb-8 pt-4 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 max-w-[1400px] mx-auto w-full">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
          14,927 streets · 195 countries indexed
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-700">
          Powered by Google Street View
        </p>
      </footer>
    </main>
  );
}
