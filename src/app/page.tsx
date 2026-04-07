import Link from "next/link";

function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="14" r="12" stroke="url(#logo-grad)" strokeWidth="2" />
      <ellipse cx="16" cy="14" rx="5" ry="12" stroke="url(#logo-grad)" strokeWidth="1.5" />
      <line x1="4" y1="14" x2="28" y2="14" stroke="url(#logo-grad)" strokeWidth="1.5" />
      <path d="M16 26l-3 5h6l-3-5z" fill="#22c55e" />
      <circle cx="16" cy="14" r="3" fill="#22c55e" opacity="0.3" />
      <defs>
        <linearGradient id="logo-grad" x1="4" y1="2" x2="28" y2="26">
          <stop stopColor="#60a5fa" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col bg-grid bg-glow">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <LogoIcon size={28} />
          <span className="font-display text-xl font-bold">GeoArena</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">v0.1</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-8 pb-12">
        <div className="w-full max-w-4xl mx-auto">
          {/* Header — left-aligned */}
          <div className="mb-10">
            <div className="mb-4">
              <LogoIcon size={48} />
            </div>
            <h1 className="font-display text-4xl sm:text-6xl font-bold mb-3 text-wrap-balance bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
              GeoArena
            </h1>
            <p className="text-lg text-zinc-400 max-w-lg">
              Explore the world through Street View and guess your location.
              How well do you know our planet?
            </p>
          </div>

          {/* Game Modes */}
          <div className="mb-8">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-4 font-medium">
              Game Modes
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Classic Mode — Active */}
              <Link
                href="/play"
                className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 transition-all duration-200 hover:bg-zinc-800/80 hover:border-green-500/40 hover:scale-[1.02] hover:shadow-xl hover:shadow-green-500/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-bold group-hover:text-green-400 transition-colors">
                    Classic
                  </h2>
                  <span className="text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full font-medium">
                    Play
                  </span>
                </div>

                <p className="text-sm text-zinc-400 mb-4">
                  5 random locations worldwide. Explore freely and place your
                  guess on the map. No time limit.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>5 rounds</span>
                  <span className="text-zinc-600">·</span>
                  <span>25,000 max pts</span>
                </div>
              </Link>

              {/* Timed Mode — Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-bold text-zinc-500">
                    Timed
                  </h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <p className="text-sm text-zinc-600 mb-4">
                  Race against the clock. 30 seconds per round. Quick
                  decisions, higher pressure.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>5 rounds</span>
                  <span className="text-zinc-700">·</span>
                  <span>30s per round</span>
                </div>
              </div>

              {/* Duel Mode — Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-bold text-zinc-500">
                    Duel
                  </h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <p className="text-sm text-zinc-600 mb-4">
                  Challenge a friend. Same locations, head-to-head. Best score
                  wins.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>1v1</span>
                  <span className="text-zinc-700">·</span>
                  <span>5 rounds</span>
                </div>
              </div>

              {/* Regions Mode — Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-50 cursor-not-allowed">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-bold text-zinc-500">
                    Regions
                  </h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <p className="text-sm text-zinc-600 mb-4">
                  Pick a specific region. Europe, Asia, Americas. Test your
                  knowledge where it counts.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>5 rounds</span>
                  <span className="text-zinc-700">·</span>
                  <span>Custom region</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <span>Random locations every game</span>
            <span className="text-zinc-700">·</span>
            <span>Powered by Google Street View</span>
          </div>
        </div>
      </div>
    </div>
  );
}
