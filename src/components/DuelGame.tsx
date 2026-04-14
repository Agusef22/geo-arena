"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  DUEL_STARTING_SCORE,
  DUEL_ROUNDS,
  resolveDuelRound,
} from "@/lib/duel";
import { haversineDistance } from "@/lib/game";
import { findStreetViewLocation, type Location } from "@/lib/locations";
import StreetView from "./StreetView";
import GuessMap from "./GuessMap";
import DuelRoundResult from "./DuelRoundResult";
import DuelSummary from "./DuelSummary";

type Phase =
  | "connecting"
  | "waiting"
  | "loading"
  | "countdown"
  | "playing"
  | "waiting-opponent"
  | "result"
  | "waiting-next"
  | "summary"
  | "error";

interface DuelPlayer {
  id: string;
  player_id: string;
  score: number;
  is_host: boolean;
  nickname: string;
  emoji: string;
}

interface DuelRoundData {
  location: Location;
  myGuess: { lat: number; lng: number };
  opponentGuess: { lat: number; lng: number };
  myDistance: number;
  opponentDistance: number;
  penalty: number;
  iWon: boolean;
  isDraw: boolean;
}

function mapPlayers(data: Record<string, unknown>[]): DuelPlayer[] {
  return data.map((p) => {
    const prof = p.profiles as { nickname: string; emoji: string } | null;
    return {
      id: p.id as string,
      player_id: p.player_id as string,
      score: p.score as number,
      is_host: p.is_host as boolean,
      nickname: prof?.nickname ?? "Unknown",
      emoji: prof?.emoji ?? "🌍",
    };
  });
}

function parseLocations(
  locs: Array<{ lat: number; lng: number }>
): Location[] {
  return locs.map((l, i) => ({ id: `loc-${i}`, lat: l.lat, lng: l.lng }));
}

export default function DuelGame({ code }: { code: string }) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [phase, setPhase] = useState<Phase>("connecting");
  const [duelId, setDuelId] = useState<string | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [rounds, setRounds] = useState<DuelRoundData[]>([]);
  const [myScore, setMyScore] = useState(DUEL_STARTING_SCORE);
  const [opponentScore, setOpponentScore] = useState(DUEL_STARTING_SCORE);
  const [countdown, setCountdown] = useState(3);
  const [mapOpen, setMapOpen] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streetViewKeyRef = useRef(0);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const hasSubmittedRef = useRef(false);
  // Prevent resolveRound from running twice
  const roundResolvedRef = useRef(-1);
  // Broadcast channel for "ready for next round" sync
  const readyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [opponentReady, setOpponentReady] = useState(false);
  const [iReady, setIReady] = useState(false);

  const me = players.find((p) => p.player_id === user?.id);
  const opponent = players.find((p) => p.player_id !== user?.id);
  const isHost = me?.is_host ?? false;

  // --- Helper: check and resolve guesses for a round ---
  const checkAndResolveGuesses = useCallback(
    async (round: number) => {
      if (!duelId || !user || roundResolvedRef.current >= round) return;

      const { data: guesses } = await supabase
        .from("duel_guesses")
        .select("player_id, distance_km, guess_lat, guess_lng")
        .eq("duel_id", duelId)
        .eq("round", round);

      if (!guesses || guesses.length < 2) return;

      const myGuessData = guesses.find((g) => g.player_id === user.id);
      const opponentGuessData = guesses.find((g) => g.player_id !== user.id);
      if (!myGuessData || !opponentGuessData) return;

      // Mark as resolved so we don't run twice
      roundResolvedRef.current = round;

      const result = resolveDuelRound(
        myGuessData.distance_km,
        opponentGuessData.distance_km
      );

      let newMyScore = myScore;
      let newOpponentScore = opponentScore;

      if (!result.isDraw) {
        if (result.loserId === 1) {
          // loserId 1 = first arg = me
          newMyScore = Math.max(0, myScore - result.penalty);
        } else {
          newOpponentScore = Math.max(0, opponentScore - result.penalty);
        }
      }

      // Update DB (only one player needs to do this — let host do it)
      if (isHost && !result.isDraw && result.loserId !== null) {
        const loserPlayerId =
          result.loserId === 1 ? user.id : opponent?.player_id;
        if (loserPlayerId) {
          await supabase
            .from("duel_guesses")
            .update({ penalty: result.penalty })
            .eq("duel_id", duelId)
            .eq("round", round)
            .eq("player_id", loserPlayerId);

          await supabase
            .from("duel_players")
            .update({
              score: result.loserId === 1 ? newMyScore : newOpponentScore,
            })
            .eq("duel_id", duelId)
            .eq("player_id", loserPlayerId);
        }
      }

      const roundData: DuelRoundData = {
        location: locations[round],
        myGuess: { lat: myGuessData.guess_lat, lng: myGuessData.guess_lng },
        opponentGuess: {
          lat: opponentGuessData.guess_lat,
          lng: opponentGuessData.guess_lng,
        },
        myDistance: myGuessData.distance_km,
        opponentDistance: opponentGuessData.distance_km,
        penalty: result.penalty,
        iWon: result.winnerId === 1,
        isDraw: result.isDraw,
      };

      setMyScore(newMyScore);
      setOpponentScore(newOpponentScore);
      setRounds((prev) => [...prev, roundData]);
      // Reset ready state for next round
      setIReady(false);
      setOpponentReady(false);
      setPhase("result");
    },
    [duelId, user, opponent, isHost, myScore, opponentScore, locations, supabase]
  );

  // --- Helper: fetch players ---
  const fetchPlayers = useCallback(
    async (dId: string) => {
      const { data } = await supabase
        .from("duel_players")
        .select("id, player_id, score, is_host, profiles(nickname, emoji)")
        .eq("duel_id", dId);

      if (data && data.length >= 2) {
        setPlayers(mapPlayers(data as Record<string, unknown>[]));
        return true;
      }
      if (data) {
        setPlayers(mapPlayers(data as Record<string, unknown>[]));
      }
      return false;
    },
    [supabase]
  );

  // --- Helper: check if locations are ready ---
  const checkLocations = useCallback(
    async (dId: string) => {
      const { data: duel } = await supabase
        .from("duels")
        .select("locations, status")
        .eq("id", dId)
        .single();

      if (
        duel?.locations &&
        duel.status === "playing" &&
        Array.isArray(duel.locations)
      ) {
        const locs = parseLocations(
          duel.locations as Array<{ lat: number; lng: number }>
        );
        setLocations(locs);
        return true;
      }
      return false;
    },
    [supabase]
  );

  // ====== Step 1: Connect and fetch initial state ======
  useEffect(() => {
    if (!user) return;

    async function init() {
      const { data: duel } = await supabase
        .from("duels")
        .select("id, status, locations")
        .eq("code", code)
        .single();

      if (!duel) {
        setError("Game not found.");
        setPhase("error");
        return;
      }

      setDuelId(duel.id);

      const { data: playersData } = await supabase
        .from("duel_players")
        .select("id, player_id, score, is_host, profiles(nickname, emoji)")
        .eq("duel_id", duel.id);

      if (playersData) {
        const mapped = mapPlayers(playersData as Record<string, unknown>[]);
        setPlayers(mapped);

        if (
          mapped.length >= 2 &&
          duel.status === "playing" &&
          duel.locations
        ) {
          const locs = parseLocations(
            duel.locations as Array<{ lat: number; lng: number }>
          );
          setLocations(locs);
          setPhase("playing");
        } else if (mapped.length >= 2) {
          setPhase("loading");
        } else {
          setPhase("waiting");
        }
      }
    }

    init();
  }, [user, code, supabase]);

  // ====== Step 2: Listen for opponent joining + poll fallback ======
  useEffect(() => {
    if (!duelId || phase !== "waiting") return;

    // Realtime listener
    const channel = supabase
      .channel(`duel-players-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "duel_players",
          filter: `duel_id=eq.${duelId}`,
        },
        async () => {
          const ready = await fetchPlayers(duelId);
          if (ready) setPhase("loading");
        }
      )
      .subscribe(async (status) => {
        // Once subscribed, immediately check if opponent already joined
        if (status === "SUBSCRIBED") {
          const ready = await fetchPlayers(duelId);
          if (ready) setPhase("loading");
        }
      });

    // Poll fallback every 3s
    const poll = setInterval(async () => {
      const ready = await fetchPlayers(duelId);
      if (ready) setPhase("loading");
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [duelId, phase, supabase, fetchPlayers]);

  // ====== Step 3: Host generates locations ======
  useEffect(() => {
    if (phase !== "loading" || !isHost || !duelId) return;

    async function generateLocations() {
      if (!svServiceRef.current && window.google) {
        svServiceRef.current = new google.maps.StreetViewService();
      }
      if (!svServiceRef.current) return;

      const locs: Location[] = [];
      let attempts = 0;
      const maxAttempts = DUEL_ROUNDS * 15;

      while (locs.length < DUEL_ROUNDS && attempts < maxAttempts) {
        const promises = Array.from({ length: 5 }, () =>
          findStreetViewLocation(svServiceRef.current!)
        );
        const results = await Promise.all(promises);

        for (const result of results) {
          if (result && locs.length < DUEL_ROUNDS) {
            const tooClose = locs.some((existing) => {
              const dLat = existing.lat - result.lat;
              const dLng = existing.lng - result.lng;
              return Math.sqrt(dLat * dLat + dLng * dLng) < 0.5;
            });
            if (!tooClose) {
              locs.push(result);
              setLoadProgress(locs.length);
            }
          }
        }
        attempts += 5;
      }

      if (locs.length < DUEL_ROUNDS) {
        setError("Failed to find enough locations. Try again.");
        setPhase("error");
        return;
      }

      const locationsJson = locs.map((l) => ({ lat: l.lat, lng: l.lng }));
      await supabase
        .from("duels")
        .update({ locations: locationsJson, status: "playing" })
        .eq("id", duelId);

      setLocations(locs);
      setPhase("countdown");
    }

    generateLocations();
  }, [phase, isHost, duelId, supabase]);

  // ====== Step 3b: Guest listens for locations + poll fallback ======
  useEffect(() => {
    if (phase !== "loading" || isHost || !duelId) return;

    const channel = supabase
      .channel(`duel-locations-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "duels",
          filter: `id=eq.${duelId}`,
        },
        async () => {
          const ready = await checkLocations(duelId);
          if (ready) setPhase("countdown");
        }
      )
      .subscribe(async (status) => {
        // Check immediately after subscribe in case we missed the event
        if (status === "SUBSCRIBED") {
          const ready = await checkLocations(duelId);
          if (ready) setPhase("countdown");
        }
      });

    // Poll fallback every 2s
    const poll = setInterval(async () => {
      const ready = await checkLocations(duelId);
      if (ready) setPhase("countdown");
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [phase, isHost, duelId, supabase, checkLocations]);

  // ====== Step 4: Countdown ======
  useEffect(() => {
    if (phase !== "countdown") return;

    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setPhase("playing");
          streetViewKeyRef.current += 1;
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // ====== Step 5: Handle guess submission ======
  const handleGuess = useCallback(
    async (guessLat: number, guessLng: number) => {
      if (!duelId || !user || hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;

      const location = locations[currentRound];
      const distance = haversineDistance(
        location.lat,
        location.lng,
        guessLat,
        guessLng
      );

      await supabase.from("duel_guesses").insert({
        duel_id: duelId,
        player_id: user.id,
        round: currentRound,
        guess_lat: guessLat,
        guess_lng: guessLng,
        distance_km: distance,
        penalty: 0,
      });

      setPhase("waiting-opponent");
      setMapOpen(false);

      // Immediately check if opponent already guessed
      await checkAndResolveGuesses(currentRound);
    },
    [duelId, user, locations, currentRound, supabase, checkAndResolveGuesses]
  );

  // ====== Step 6: Listen for guesses + poll fallback ======
  useEffect(() => {
    if (phase !== "playing" && phase !== "waiting-opponent") return;
    if (!duelId) return;

    const channel = supabase
      .channel(`duel-guesses-${duelId}-r${currentRound}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "duel_guesses",
          filter: `duel_id=eq.${duelId}`,
        },
        () => {
          checkAndResolveGuesses(currentRound);
        }
      )
      .subscribe(async (status) => {
        // Check immediately in case opponent already guessed
        if (status === "SUBSCRIBED") {
          await checkAndResolveGuesses(currentRound);
        }
      });

    // Poll fallback every 2s
    const poll = setInterval(() => {
      checkAndResolveGuesses(currentRound);
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [phase, duelId, currentRound, supabase, checkAndResolveGuesses]);

  // ====== Handle next round (player presses button) ======
  const handleNext = useCallback(async () => {
    // Final round or game over → go directly to summary
    if (
      myScore <= 0 ||
      opponentScore <= 0 ||
      currentRound + 1 >= DUEL_ROUNDS
    ) {
      if (duelId) {
        await supabase
          .from("duels")
          .update({ status: "finished" })
          .eq("id", duelId);
      }
      setPhase("summary");
      return;
    }

    // Signal that I'm ready via broadcast
    setIReady(true);
    readyChannelRef.current?.send({
      type: "broadcast",
      event: "ready",
      payload: { player_id: user?.id, round: currentRound },
    });

    // If opponent already pressed, advance immediately
    if (opponentReady) {
      advanceToNextRound();
    } else {
      setPhase("waiting-next");
    }
  }, [currentRound, myScore, opponentScore, duelId, supabase, user, opponentReady]);

  // Actually advance to next round (called when both are ready)
  const advanceToNextRound = useCallback(() => {
    hasSubmittedRef.current = false;
    setIReady(false);
    setOpponentReady(false);
    setCurrentRound((r) => r + 1);
    setPhase("playing");
    setMapOpen(false);
    streetViewKeyRef.current += 1;
  }, []);

  // ====== Step 7: Broadcast channel for ready sync ======
  useEffect(() => {
    if (!duelId) return;

    const channel = supabase.channel(`duel-ready-${duelId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "ready" }, (payload) => {
        const data = payload.payload as { player_id: string; round: number };
        if (data.player_id !== user?.id) {
          setOpponentReady(true);
        }
      })
      .subscribe();

    readyChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      readyChannelRef.current = null;
    };
  }, [duelId, user, supabase]);

  // When opponent becomes ready while I'm already waiting
  useEffect(() => {
    if (phase === "waiting-next" && opponentReady && iReady) {
      advanceToNextRound();
    }
  }, [phase, opponentReady, iReady, advanceToNextRound]);

  const currentLocation = locations[currentRound];

  // ===== RENDERS =====

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        <p className="text-red-400 text-lg mb-4">{error}</p>
        <Link
          href="/duel"
          className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-6 rounded-full transition-all"
        >
          Back to lobby
        </Link>
      </div>
    );
  }

  if (phase === "connecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <p className="text-neutral-500 animate-pulse">Connecting...</p>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-6">
          Waiting for opponent
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 mb-6">
          <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">
            Share this code
          </p>
          <p className="font-mono text-5xl font-bold text-white tracking-[0.3em]">
            {code}
          </p>
        </div>

        {me && (
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-2">
            <span className="text-xl">{me.emoji}</span>
            <span>{me.nickname}</span>
            <span className="text-neutral-600">vs</span>
            <span className="text-neutral-600">???</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <p className="text-neutral-600 text-sm">Waiting for player 2...</p>
        </div>

        <Link
          href="/duel"
          className="mt-8 text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
        >
          Cancel
        </Link>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        {opponent && me && (
          <div className="flex items-center gap-3 text-neutral-300 mb-8">
            <span className="text-2xl">{me.emoji}</span>
            <span className="font-medium">{me.nickname}</span>
            <span className="text-neutral-600 text-sm">vs</span>
            <span className="font-medium">{opponent.nickname}</span>
            <span className="text-2xl">{opponent.emoji}</span>
          </div>
        )}

        <p className="text-zinc-300 text-lg font-medium mb-1">
          {isHost ? "Finding locations..." : "Host is finding locations..."}
        </p>
        <p className="text-zinc-500 text-sm mb-4">
          Searching for Street View coverage worldwide
        </p>

        {isHost && (
          <>
            <div className="w-56 h-2 bg-zinc-800 rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${(loadProgress / DUEL_ROUNDS) * 100}%`,
                }}
              />
            </div>
            <p className="text-zinc-600 text-xs mt-2">
              {loadProgress} of {DUEL_ROUNDS} locations found
            </p>
          </>
        )}

        {!isHost && (
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
        )}
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        {opponent && me && (
          <div className="flex items-center gap-3 text-neutral-300 mb-12">
            <span className="text-2xl">{me.emoji}</span>
            <span className="font-medium">{me.nickname}</span>
            <span className="text-neutral-600 text-sm">vs</span>
            <span className="font-medium">{opponent.nickname}</span>
            <span className="text-2xl">{opponent.emoji}</span>
          </div>
        )}
        <p className="font-display text-8xl font-extrabold text-white animate-pulse">
          {countdown}
        </p>
      </div>
    );
  }

  if (phase === "waiting-opponent") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-lg">Waiting for {opponent?.nickname ?? "opponent"}...</p>
        <p className="text-neutral-600 text-sm mt-2">
          You already placed your guess
        </p>
      </div>
    );
  }

  if (phase === "waiting-next") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4 text-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-lg">
          Waiting for {opponent?.nickname ?? "opponent"}...
        </p>
        <p className="text-neutral-600 text-sm mt-2">
          You&apos;re ready for the next round
        </p>
      </div>
    );
  }

  if (phase === "result") {
    const lastRound = rounds[rounds.length - 1];
    return (
      <div className="h-screen bg-zinc-900">
        <DuelRoundResult
          round={currentRound + 1}
          totalRounds={DUEL_ROUNDS}
          location={lastRound.location}
          myGuess={lastRound.myGuess}
          opponentGuess={lastRound.opponentGuess}
          myDistance={lastRound.myDistance}
          opponentDistance={lastRound.opponentDistance}
          penalty={lastRound.penalty}
          iWon={lastRound.iWon}
          isDraw={lastRound.isDraw}
          myScore={myScore}
          opponentScore={opponentScore}
          myName={me?.nickname ?? "You"}
          myEmoji={me?.emoji ?? "🌍"}
          opponentName={opponent?.nickname ?? "Opponent"}
          opponentEmoji={opponent?.emoji ?? "🌍"}
          onNext={handleNext}
          isFinalRound={
            currentRound + 1 >= DUEL_ROUNDS ||
            myScore <= 0 ||
            opponentScore <= 0
          }
        />
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="h-screen bg-zinc-950">
        <DuelSummary
          rounds={rounds}
          myScore={myScore}
          opponentScore={opponentScore}
          myName={me?.nickname ?? "You"}
          myEmoji={me?.emoji ?? "🌍"}
          opponentName={opponent?.nickname ?? "Opponent"}
          opponentEmoji={opponent?.emoji ?? "🌍"}
        />
      </div>
    );
  }

  // Playing phase
  if (!currentLocation) return null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      <div className="absolute inset-0">
        <StreetView
          key={`duel-${currentRound}-${streetViewKeyRef.current}`}
          lat={currentLocation.lat}
          lng={currentLocation.lng}
        />
      </div>

      {/* HUD */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          <Link
            href="/duel"
            className="bg-black/70 backdrop-blur-sm rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3 text-white hover:bg-black/90 transition-colors"
            title="Leave duel"
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
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>

          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-white">
            <span className="font-bold text-xs sm:text-sm">
              Round {currentRound + 1}/{DUEL_ROUNDS}
            </span>
          </div>
        </div>

        {/* Scores */}
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-4 sm:py-3 pointer-events-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{me?.emoji}</span>
            <span className="text-[10px] sm:text-xs text-zinc-400 hidden sm:inline">
              {me?.nickname}
            </span>
            <span className="text-cyan-400 font-bold text-sm tabular-nums">
              {myScore.toLocaleString()}
            </span>
          </div>
          <span className="text-zinc-600 text-xs">vs</span>
          <div className="flex items-center gap-1.5">
            <span className="text-red-400 font-bold text-sm tabular-nums">
              {opponentScore.toLocaleString()}
            </span>
            <span className="text-[10px] sm:text-xs text-zinc-400 hidden sm:inline">
              {opponent?.nickname}
            </span>
            <span className="text-sm">{opponent?.emoji}</span>
          </div>
        </div>
      </div>

      {/* Mobile: toggle map */}
      <button
        onClick={() => setMapOpen((o) => !o)}
        className={`sm:hidden absolute z-20 bottom-4 right-4 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-full w-14 h-14 items-center justify-center shadow-xl cursor-pointer transition-all ${
          mapOpen ? "hidden" : "flex"
        }`}
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

      {mapOpen && (
        <div className="sm:hidden fixed inset-0 z-20 bg-black/70" />
      )}

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
    </div>
  );
}
