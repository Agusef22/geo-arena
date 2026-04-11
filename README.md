# GeoArena

A geography guessing game built with Next.js and Google Street View. Explore random locations worldwide, guess where you are, and try to survive 5 rounds without losing your 10,000 points.

## How it works

You start with **10,000 points**. Each round drops you in a random Street View location somewhere in the world. Look around, find clues, and place your guess on the map.

- **Close guess** = small penalty (50km off costs ~3%)
- **Far off** = big penalty (2,000km+ costs ~74%)
- **Each round gets harder** = max penalty escalates from 2,500 to 5,000
- **Hit zero = Game Over** = you can die as early as round 3

Survive all 5 rounds with points remaining to win.

## Tech stack

- **Next.js 16** with App Router and Turbopack
- **TypeScript**
- **Tailwind CSS v4**
- **Google Maps JavaScript API** (Street View + Maps + Geocoding)

## Getting started

### Prerequisites

- Node.js 18+
- A [Google Maps API key](https://console.cloud.google.com/apis/credentials) with **Maps JavaScript API** and **Geocoding API** enabled

### Setup

```bash
git clone https://github.com/Agusef22/geo-arena.git
cd geo-arena
npm install
```

Create a `.env.local` file in the root:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm start
```

## Project structure

```
src/
  app/
    page.tsx          # Home page
    play/page.tsx     # Game page (loads Google Maps)
    layout.tsx        # Root layout with fonts
  components/
    Game.tsx           # Main game loop + state machine
    StreetView.tsx     # Street View panorama
    GuessMap.tsx       # Interactive guess map
    RoundResult.tsx    # Round result with animated score
    GameSummary.tsx    # Final score + round breakdown
  lib/
    game.ts            # Scoring system + distance math
    types.ts           # TypeScript interfaces
    locations.ts       # Random location finder
    map-utils.ts       # Map pin icons
  hooks/
    useAnimatedNumber.ts  # Smooth number transitions
    useReverseGeocode.ts  # Location name lookup
    useSoundEffects.ts    # Web Audio sound effects
```

## Scoring system

| Distance | Penalty (% of round max) |
|----------|-------------------------|
| < 150m | 0% (Perfect!) |
| 5 km | ~0.3% |
| 50 km | ~3% |
| 150 km | ~10% |
| 500 km | ~28% |
| 1,000 km | ~49% |
| 2,000 km | ~74% |
| 5,000 km+ | ~96% |

Max penalty per round: 2,500 / 3,000 / 3,500 / 4,000 / 5,000.

## License

MIT
