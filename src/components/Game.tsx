"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StreetView from "./StreetView";
import GuessMap from "./GuessMap";
import RoundResult from "./RoundResult";
import GameSummary from "./GameSummary";
import { findGameLocations, type Location } from "@/lib/locations";
import { getRandomPoolLocations } from "@/lib/supabase/pool";
import { REGIONS, type Region } from "@/lib/regions";
import type { RoundData } from "@/lib/types";
import { haversineDistance, roundScore, ROUNDS_PER_GAME } from "@/lib/game";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import {
  startClassicGame,
  submitClassicGame,
  resumeClassicGame,
  recordClassicGuess,
} from "@/lib/supabase/game-results";

type GamePhase = "loading" | "playing" | "result" | "summary" | "error";

// Seconds per round in Timed difficulty.
const TIMED_ROUND_SECONDS = 30;

export default function Game({
  region = REGIONS[0],
  timed = false,
  noMove = false,
}: {
  region?: Region;
  timed?: boolean;
  noMove?: boolean;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<GamePhase>("loading");
  // Confirmation before abandoning an in-progress game.
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [displayedScore, setDisplayedScore] = useState(0);
  // Diagonal (km) of the played region — scales the round score. Logged-in
  // games get the exact value from the server; anonymous games fall back to the
  // region preset's rough estimate.
  const [diagonalKm, setDiagonalKm] = useState(region.diagonalKm);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const savedRef = useRef(false);
  // Id of the server-side game session (logged-in players only). Null for
  // anonymous/fallback games, which aren't saved.
  const gameIdRef = useRef<string | null>(null);
  // Timed difficulty: seconds left in the current round (null = no timer).
  const [roundTimer, setRoundTimer] = useState<number | null>(null);
  const timedOutRef = useRef(-1);
  // Whether the Street View panorama for the current round has actually
  // rendered. The round timer must not run over a blank/broken view.
  const [viewReady, setViewReady] = useState(false);
  const { playGood, playBad, playNext } = useSoundEffects();
  const animatedHud = useAnimatedNumber(displayedScore, 800, 0);

  useEffect(() => {
    if (window.google) {
      svServiceRef.current = new google.maps.StreetViewService();
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setPhase("loading");
    setLoadProgress(0);

    if (!svServiceRef.current) {
      svServiceRef.current = new google.maps.StreetViewService();
    }

    let gameId: string | null = null;
    let locs: Location[] = [];
    // Default to the region's rough diagonal; the server overrides it with the
    // exact value for logged-in sessions.
    let diagonal = region.diagonalKm;

    // Logged-in: open a server-authoritative session — the server stores the
    // locations and scores them on submit, so the result can't be forged.
    const session = await startClassicGame(ROUNDS_PER_GAME, region.countries);
    if (session) {
      gameId = session.gameId;
      locs = session.locations;
      if (session.diagonalKm > 0) diagonal = session.diagonalKm;
    }

    // Anonymous (or session failed): play an unsaved game. Prefer the curated
    // pool; fall back to a live search if it isn't seeded yet.
    if (locs.length < ROUNDS_PER_GAME) {
      gameId = null;
      locs = await getRandomPoolLocations(ROUNDS_PER_GAME, region.countries);
      if (locs.length < ROUNDS_PER_GAME) {
        locs = await findGameLocations(
          svServiceRef.current,
          ROUNDS_PER_GAME,
          setLoadProgress
        );
      }
    }

    if (locs.length < ROUNDS_PER_GAME) {
      setPhase("error");
      return;
    }

    gameIdRef.current = gameId;
    setDiagonalKm(diagonal);
    setViewReady(false);
    setLocations(locs);
    setCurrentRound(0);
    setRounds([]);
    setDisplayedScore(0);
    setPhase("playing");
    setMapOpen(false);
    savedRef.current = false;
  }, [region]);

  // On mount, try to resume an in-progress server game (so a refresh doesn't
  // lose progress); only start a fresh game when there's nothing to resume.
  const resumeOrStart = useCallback(async () => {
    setPhase("loading");
    const resumed = await resumeClassicGame();
    if (resumed && resumed.locations.length >= ROUNDS_PER_GAME) {
      const diagonal =
        resumed.diagonalKm > 0 ? resumed.diagonalKm : region.diagonalKm;
      // Rebuild the played rounds from the persisted guesses (display only —
      // the server re-scores on submit against its stored locations).
      const rebuilt: RoundData[] = resumed.guesses
        .slice(0, resumed.locations.length)
        .map((g, i) => {
          const loc = resumed.locations[i];
          const distance = haversineDistance(loc.lat, loc.lng, g.lat, g.lng);
          return {
            location: loc,
            guessLat: g.lat,
            guessLng: g.lng,
            distance,
            points: roundScore(distance, diagonal),
          };
        });

      gameIdRef.current = resumed.gameId;
      savedRef.current = false;
      setDiagonalKm(diagonal);
      setLocations(resumed.locations);
      setRounds(rebuilt);
      setDisplayedScore(rebuilt.reduce((sum, r) => sum + r.points, 0));
      setViewReady(false);
      setMapOpen(false);

      if (rebuilt.length >= ROUNDS_PER_GAME) {
        // All rounds were guessed but the game was never submitted — finalize.
        setCurrentRound(ROUNDS_PER_GAME - 1);
        setPhase("summary");
        if (!savedRef.current) {
          savedRef.current = true;
          submitClassicGame(
            resumed.gameId,
            rebuilt.map((r) => ({ lat: r.guessLat, lng: r.guessLng }))
          );
        }
      } else {
        setCurrentRound(rebuilt.length);
        setPhase("playing");
      }
      return;
    }
    await loadLocations();
  }, [region, loadLocations]);

  useEffect(() => {
    // Intentional: kick off the async resume/load on mount. It sets "loading"
    // state synchronously, which the rule flags, but firing once on mount is
    // exactly what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resumeOrStart();
  }, [resumeOrStart]);

  const currentLocation = locations[currentRound];

  // Current score = sum of the points earned each round (additive, 0–25,000).
  const currentScore = useMemo(
    () => rounds.reduce((sum, r) => sum + r.points, 0),
    [rounds]
  );

  const handleGuess = useCallback(
    (guessLat: number, guessLng: number) => {
      if (!currentLocation) return;
      const distance = haversineDistance(
        currentLocation.lat,
        currentLocation.lng,
        guessLat,
        guessLng
      );
      const points = roundScore(distance, diagonalKm);

      // Sound based on how well they did (share of the 5,000 max).
      if (points >= 4000) {
        playGood();
      } else {
        playBad();
      }

      setRounds((prev) => [
        ...prev,
        {
          location: currentLocation,
          guessLat,
          guessLng,
          distance,
          points,
        },
      ]);
      // Persist the guess so a refresh can resume this game (logged-in only).
      if (gameIdRef.current) {
        recordClassicGuess(gameIdRef.current, currentRound, guessLat, guessLng);
      }
      setPhase("result");
      setMapOpen(false);
    },
    [currentLocation, currentRound, diagonalKm, playGood, playBad]
  );

  const handleNext = useCallback(() => {
    playNext();

    // Running total after this round.
    const scoreAfter = rounds.reduce((sum, r) => sum + r.points, 0);

    // Save by submitting guesses to the server, which scores them against the
    // locations it stored. Fire-and-forget; only saved for logged-in sessions.
    const submit = () => {
      if (!gameIdRef.current) return;
      const guesses = rounds.map((r) => ({ lat: r.guessLat, lng: r.guessLng }));
      submitClassicGame(gameIdRef.current, guesses);
    };

    if (currentRound + 1 >= ROUNDS_PER_GAME) {
      setPhase("summary");
      if (!savedRef.current) {
        savedRef.current = true;
        submit();
      }
    } else {
      setViewReady(false);
      setCurrentRound((r) => r + 1);
      setPhase("playing");
      setMapOpen(false);
      setDisplayedScore(scoreAfter);
    }
  }, [currentRound, rounds, playNext]);

  // Abandoning a logged-in game forfeits it: we submit max-distance guesses
  // (the antipode of every stored location) so the server scores it near zero.
  // Submitting the *real* partial guesses instead would let a player bank a
  // high score off a single good round, so we never do that on leave.
  const confirmLeave = useCallback(() => {
    if (gameIdRef.current && !savedRef.current && locations.length > 0) {
      savedRef.current = true;
      const forfeitGuesses = locations.map((l) => ({
        lat: -l.lat,
        lng: ((l.lng + 540) % 360) - 180,
      }));
      // Fire-and-forget: client-side nav keeps the JS context alive to finish.
      submitClassicGame(gameIdRef.current, forfeitGuesses);
    }
    router.push("/");
  }, [locations, router]);

  // Warn on tab close / refresh / browser back while a round is in progress.
  // The native dialog can't be customized, and an async forfeit can't reliably
  // complete on unload — but nothing is banked either way, so this is just a
  // best-effort nudge; the in-app Back button is the path that records the loss.
  useEffect(() => {
    if (phase !== "playing" && phase !== "result") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === "result" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleNext]);

  // Timed difficulty: arm a 30s countdown once the round's panorama is actually
  // visible — never over a blank/broken view (e.g. Maps failed to load).
  useEffect(() => {
    // Intentional: derive the round timer from the phase/view transition.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!timed || phase !== "playing" || !viewReady) {
      setRoundTimer(null);
      return;
    }
    setRoundTimer(TIMED_ROUND_SECONDS);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [timed, phase, currentRound, viewReady]);

  // Tick the timer; when it hits 0 auto-submit a far guess (0 points) so the
  // round still resolves, mirroring how the duel handles a timeout.
  useEffect(() => {
    if (roundTimer === null || phase !== "playing") return;
    if (roundTimer <= 0) {
      if (timedOutRef.current !== currentRound && currentLocation) {
        timedOutRef.current = currentRound;
        // Intentional: a timeout resolves the round by submitting a far guess.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleGuess(0, 0);
      }
      return;
    }
    const tick = setTimeout(
      () => setRoundTimer((s) => (s !== null ? s - 1 : null)),
      1000
    );
    return () => clearTimeout(tick);
  }, [roundTimer, phase, currentRound, currentLocation, handleGuess]);

  // Loading screen
  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 bg-grid px-4">
        <div className="text-center">
          <div className="relative mx-auto mb-6 w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-zinc-700 animate-pulse" />
            <div
              className="absolute inset-2 rounded-full border border-zinc-600 animate-spin"
              style={{ animationDuration: "3s" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
          </div>

          <p className="text-zinc-300 text-lg font-medium mb-1">
            Finding locations...
          </p>
          <p className="text-zinc-500 text-sm mb-4">
            {region.key === "world"
              ? "Searching for Street View coverage worldwide"
              : `Region: ${region.emoji} ${region.label}`}
          </p>

          <div className="w-56 h-2 bg-zinc-800 rounded-full mx-auto overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(loadProgress / ROUNDS_PER_GAME) * 100}%`,
              }}
            />
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            {loadProgress} of {ROUNDS_PER_GAME} locations found
          </p>
        </div>
      </div>
    );
  }

  // Error screen
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 bg-grid px-4">
        <div className="text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-6 mx-auto">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
            <line x1="8" y1="8" x2="16" y2="16" stroke="#ef4444" strokeWidth="2" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">
            Couldn&apos;t find enough locations
          </h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-sm">
            Street View coverage wasn&apos;t available in enough areas. This can
            happen with slow connections. Try again!
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 px-6 rounded-full transition-all cursor-pointer"
            >
              Menu
            </Link>
            <button
              onClick={loadLocations}
              className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-3 px-8 rounded-full transition-all cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="h-screen bg-zinc-950">
        <GameSummary
          finalScore={currentScore}
          rounds={rounds}
          onPlayAgain={loadLocations}
        />
      </div>
    );
  }

  if (phase === "result") {
    const lastRound = rounds[rounds.length - 1];
    const prevRounds = rounds.slice(0, -1);
    const scoreBeforeThisRound = prevRounds.reduce((sum, r) => sum + r.points, 0);
    return (
      <div className="h-screen bg-zinc-900">
        <RoundResult
          actualLat={lastRound.location.lat}
          actualLng={lastRound.location.lng}
          guessLat={lastRound.guessLat}
          guessLng={lastRound.guessLng}
          distanceKm={lastRound.distance}
          points={lastRound.points}
          currentScore={currentScore}
          previousScore={scoreBeforeThisRound}
          round={currentRound + 1}
          totalRounds={ROUNDS_PER_GAME}
          onNext={handleNext}
          isFinalRound={currentRound + 1 >= ROUNDS_PER_GAME}
        />
      </div>
    );
  }

  if (!currentLocation) return null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      {/* Street View */}
      <div className="absolute inset-0">
        <StreetView
          key={`${currentLocation.id}-${currentRound}`}
          lat={currentLocation.lat}
          lng={currentLocation.lng}
          panoId={currentLocation.panoId}
          heading={currentLocation.heading}
          move={!noMove}
          onReady={() => setViewReady(true)}
        />
      </div>

      {/* HUD top bar */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          {/* Back to menu — confirms first, since leaving forfeits the game */}
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="bg-black/70 backdrop-blur-sm rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3 text-white hover:bg-black/90 transition-colors cursor-pointer"
            title="Back to menu"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>

          {/* Round info */}
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-white flex items-center gap-2 sm:gap-4">
            {/* Round dots */}
            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: ROUNDS_PER_GAME }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    i < currentRound
                      ? "bg-green-500"
                      : i === currentRound
                      ? "bg-blue-500 ring-2 ring-blue-300"
                      : "bg-zinc-600"
                  }`}
                />
              ))}
              <div className="w-px h-6 bg-zinc-600 ml-1" />
            </div>
            <span className="font-bold text-xs sm:text-sm">
              {currentRound + 1}/{ROUNDS_PER_GAME}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-5 sm:py-3 pointer-events-auto">
          <span className="text-yellow-400 font-bold text-sm sm:text-lg tabular-nums">
            {animatedHud.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Timed difficulty: round countdown */}
      {timed && roundTimer !== null && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div
            className={`backdrop-blur-sm rounded-full px-5 py-2.5 flex items-center gap-2.5 shadow-lg border ${
              roundTimer <= 10
                ? "bg-red-950/80 border-red-800/50"
                : "bg-black/70 border-zinc-700/50"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={roundTimer <= 10 ? "#ef4444" : "#fbbf24"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span
              className={`font-mono font-bold text-lg tabular-nums ${
                roundTimer <= 10 ? "text-red-400 animate-pulse" : "text-yellow-400"
              }`}
            >
              {roundTimer}s
            </span>
          </div>
        </div>
      )}

      {/* Mobile: toggle map button */}
      <button
        onClick={() => setMapOpen((o) => !o)}
        className={`sm:hidden absolute z-20 bottom-4 right-4 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-full w-14 h-14 items-center justify-center shadow-xl cursor-pointer transition-all ${mapOpen ? "hidden" : "flex"}`}
      >
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
      </button>

      {/* Mobile: backdrop when map is open */}
      {mapOpen && (
        <div className="sm:hidden fixed inset-0 z-20 bg-black/70" />
      )}

      {/* GuessMap */}
      <div
        className={
          mapOpen
            ? "fixed inset-2 top-14 bottom-4 z-30 sm:absolute sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[70vw] sm:h-[70vh] sm:scale-[0.3] sm:hover:scale-100 sm:origin-bottom-right sm:transition-transform sm:duration-300 sm:ease-out sm:z-10"
            : "hidden sm:block absolute z-10 bottom-4 right-4 w-[70vw] h-[70vh] scale-[0.3] hover:scale-100 origin-bottom-right transition-transform duration-300 ease-out"
        }
      >
        <div className="w-full h-full rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl">
          <GuessMap onGuess={handleGuess} />
        </div>
      </div>

      {/* Mobile: close map button */}
      {mapOpen && (
        <button
          onClick={() => setMapOpen(false)}
          className="sm:hidden fixed top-3 right-3 bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer z-40"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Leave confirmation — abandoning forfeits the game as a loss */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Leave the game?</h2>
            <p className="text-zinc-400 text-sm mb-6">
              If you leave now, this game counts as a loss and your progress is
              gone. Are you sure?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-bold py-3 px-4 rounded-full transition-all cursor-pointer"
              >
                Keep playing
              </button>
              <button
                onClick={confirmLeave}
                className="flex-1 bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold py-3 px-4 rounded-full transition-all cursor-pointer"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
