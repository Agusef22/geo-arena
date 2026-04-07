import Link from "next/link";

function GlobeIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-400"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-lg flex items-center justify-center text-sm font-bold">
            G
          </div>
          <span className="text-xl font-bold">GeoArena</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">v0.1</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <GlobeIcon />
            </div>
            <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
              GeoArena
            </h1>
            <p className="text-lg text-zinc-400 max-w-md mx-auto">
              Explore the world through Street View and guess your location.
              How well do you know our planet?
            </p>
          </div>

          {/* Game Modes */}
          <div className="mb-8">
            <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-4 px-1">
              Game Modes
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Classic Mode - Active */}
              <Link
                href="/play"
                className="group relative bg-zinc-900 border border-zinc-800 hover:border-green-500/50 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-green-500/5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400">
                    <MapPinIcon />
                  </div>
                  <span className="text-xs bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full font-medium">
                    Play
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-1 group-hover:text-green-400 transition-colors">
                  Classic
                </h3>
                <p className="text-sm text-zinc-400 mb-4">
                  5 random locations worldwide. Explore freely and place your
                  guess on the map. No time limit.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <MapPinIcon />5 rounds
                  </span>
                  <span>25,000 max pts</span>
                </div>
              </Link>

              {/* Timed Mode - Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-60 cursor-not-allowed">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                    <ClockIcon />
                  </div>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-1 text-zinc-500">
                  Timed
                </h3>
                <p className="text-sm text-zinc-600 mb-4">
                  Race against the clock. 30 seconds per round. Quick
                  decisions, higher pressure.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>5 rounds</span>
                  <span>30s per round</span>
                </div>
              </div>

              {/* Duel Mode - Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-60 cursor-not-allowed">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                    <TrophyIcon />
                  </div>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-1 text-zinc-500">Duel</h3>
                <p className="text-sm text-zinc-600 mb-4">
                  Challenge a friend. Same locations, head-to-head. Best score
                  wins.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>1v1</span>
                  <span>5 rounds</span>
                </div>
              </div>

              {/* Regions Mode - Coming Soon */}
              <div className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 opacity-60 cursor-not-allowed">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                    <GlobeIcon />
                  </div>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <LockIcon />
                    Soon
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-1 text-zinc-500">
                  Regions
                </h3>
                <p className="text-sm text-zinc-600 mb-4">
                  Pick a specific region — Europe, Asia, Americas. Test your
                  knowledge where it counts.
                </p>

                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>5 rounds</span>
                  <span>Custom region</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-center gap-6 text-sm text-zinc-600">
            <span>Random locations every game</span>
            <span className="text-zinc-700">·</span>
            <span>Powered by Google Street View</span>
          </div>
        </div>
      </div>
    </div>
  );
}
