import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import Leaderboard from "@/components/Leaderboard";
import PlayerStatsCard from "@/components/PlayerStats";
import RegionPicker from "@/components/RegionPicker";
import ChallengePicker from "@/components/ChallengePicker";

function Globe() {
  return (
    <svg
      viewBox="0 0 600 600"
      fill="none"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Sphere outline */}
      <circle cx="300" cy="300" r="260" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

      {/* Parallels — horizontal ellipses, decreasing ry */}
      <ellipse cx="300" cy="300" rx="260" ry="225" stroke="rgba(255,255,255,0.08)" />
      <ellipse cx="300" cy="300" rx="260" ry="160" stroke="rgba(255,255,255,0.08)" />
      <ellipse cx="300" cy="300" rx="260" ry="85" stroke="rgba(255,255,255,0.08)" />
      <line x1="40" y1="300" x2="560" y2="300" stroke="rgba(255,255,255,0.18)" />

      {/* Meridians — vertical ellipses, decreasing rx */}
      <ellipse cx="300" cy="300" rx="225" ry="260" stroke="rgba(255,255,255,0.08)" />
      <ellipse cx="300" cy="300" rx="160" ry="260" stroke="rgba(255,255,255,0.08)" />
      <ellipse cx="300" cy="300" rx="85" ry="260" stroke="rgba(255,255,255,0.08)" />
      <line x1="300" y1="40" x2="300" y2="560" stroke="rgba(255,255,255,0.18)" />

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

export default function Home() {
  return (
    <main className="pop-bg text-[#fafaf9] relative overflow-x-clip">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-12 pt-6 max-w-[1400px] mx-auto w-full">
        <span className="font-display text-xl font-extrabold tracking-tight">
          <span className="text-pop-gradient">Geo</span>
          <span className="text-white">Arena</span>
        </span>
        <UserMenu />
      </header>

      {/* Hero — fills viewport */}
      <section className="min-h-[calc(100dvh-80px)] grid lg:grid-cols-[1.1fr_1fr] items-center gap-12 lg:gap-8 px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-8">
        {/* Left: text */}
        <div className="relative z-10">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300">
            <span className="text-base">🌍</span>
            How well do you know Earth?
          </p>

          <h1 className="font-display font-extrabold leading-[0.88] tracking-[-0.045em] text-[clamp(3.5rem,10vw,9.5rem)] whitespace-nowrap">
            <span className="text-pop-gradient">Geo</span>
            <span className="font-light text-amber-300">°</span>
            <span className="text-white">Arena</span>
          </h1>

          <p className="mt-8 max-w-[36ch] text-base sm:text-lg text-neutral-400 leading-relaxed">
            Drop into a random Street View anywhere on Earth. Read the road
            signs, the trees, the sky. Pin where you think you are.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-5">
            <Link
              href="/play"
              style={{ ["--pop-shadow" as string]: "#047857" }}
              className="pop-press group inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-[#06281c] font-extrabold text-lg px-8 py-4 rounded-2xl"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="anim-wiggle"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Drop me in</span>
            </Link>
            <span className="text-sm font-medium text-neutral-400">
              5 rounds · up to{" "}
              <span className="font-bold text-amber-300">25,000</span> pts · the
              closer the better
            </span>
          </div>
        </div>

        {/* Right: wireframe globe with cardinal markers */}
        <div className="anim-float hidden lg:block relative z-10 aspect-square w-full max-w-[560px] mx-auto">
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

      {/* Modes section */}
      <section className="relative z-10 px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-20 border-t border-white/5">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span>🎮</span> Pick your game
          </h2>
          <p className="text-xs font-semibold text-neutral-500 hidden sm:block">
            3 modes · ready to play
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ChallengePicker />
          <Link
            href="/duel"
            style={{ ["--pop-shadow" as string]: "#9f1239" }}
            className="pop-press group relative rounded-3xl p-6 bg-gradient-to-br from-rose-500 to-pink-600 text-white overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2">
                <span className="anim-wiggle inline-block">⚔️</span> Duel
              </h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/90">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <p className="text-sm text-rose-50/90 leading-relaxed mb-6 min-h-[3em]">
              Challenge a friend head-to-head. Win rounds to drain their HP —
              last one standing wins.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-100/80">
                1 vs 1
              </span>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
                Play →
              </span>
            </div>
          </Link>
          <RegionPicker />
        </div>
      </section>

      {/* Leaderboard + Stats */}
      <section className="relative z-10 px-6 sm:px-12 max-w-[1400px] mx-auto w-full py-16 border-t border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-8">
          <Leaderboard />
          <PlayerStatsCard />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 sm:px-12 pb-8 pt-4 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 max-w-[1400px] mx-auto w-full">
        <p className="text-xs font-medium text-neutral-500">
          🛰️ 100k+ streets · 195 countries indexed
        </p>
        <p className="text-xs font-medium text-neutral-600">
          Powered by Google Street View
        </p>
      </footer>
    </main>
  );
}
