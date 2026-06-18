"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useFriends } from "@/context/FriendsProvider";
import { DUEL_STARTING_HP, DUEL_ROUNDS } from "@/lib/duel";
import { roundScore, WORLD_DIAGONAL_KM } from "@/lib/game";
import { findGameLocations, type Location } from "@/lib/locations";
import { getRandomPoolLocations } from "@/lib/supabase/pool";
import { inviteToExistingDuel } from "@/lib/supabase/friends";
import { regionLabelFromCountries } from "@/lib/regions";
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
  // Round scores (0–5,000) and the HP damage dealt to the round's loser.
  myPoints: number;
  opponentPoints: number;
  damage: number;
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
  locs: Array<{ lat: number; lng: number; pano?: string; heading?: number }>
): Location[] {
  return locs.map((l, i) => ({
    id: `loc-${i}`,
    lat: l.lat,
    lng: l.lng,
    panoId: l.pano,
    heading: l.heading,
  }));
}

interface DuelGuessRow {
  player_id: string;
  round: number;
  distance_km: number;
  guess_lat: number;
  guess_lng: number;
  penalty: number;
}

// Reconstruct the history of completed rounds from DB guesses.
// A round is considered complete when both players have guessed.
function buildRoundsHistory(
  guesses: DuelGuessRow[],
  userId: string,
  locations: Location[],
  diagonalKm: number
): DuelRoundData[] {
  const byRound = new Map<number, DuelGuessRow[]>();
  for (const g of guesses) {
    if (!byRound.has(g.round)) byRound.set(g.round, []);
    byRound.get(g.round)!.push(g);
  }

  const rounds: DuelRoundData[] = [];
  const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  for (const round of sortedRounds) {
    const roundGuesses = byRound.get(round)!;
    if (roundGuesses.length < 2) continue;

    const myGuess = roundGuesses.find((g) => g.player_id === userId);
    const oppGuess = roundGuesses.find((g) => g.player_id !== userId);
    if (!myGuess || !oppGuess) continue;
    if (!locations[round]) continue;

    const myPoints = roundScore(myGuess.distance_km, diagonalKm);
    const opponentPoints = roundScore(oppGuess.distance_km, diagonalKm);
    const isDraw = myPoints === opponentPoints;
    const iWon = myPoints > opponentPoints;

    rounds.push({
      location: locations[round],
      myGuess: { lat: myGuess.guess_lat, lng: myGuess.guess_lng },
      opponentGuess: { lat: oppGuess.guess_lat, lng: oppGuess.guess_lng },
      myDistance: myGuess.distance_km,
      opponentDistance: oppGuess.distance_km,
      myPoints,
      opponentPoints,
      damage: Math.max(myGuess.penalty, oppGuess.penalty),
      iWon,
      isDraw,
    });
  }

  return rounds;
}

export default function DuelGame({ code }: { code: string }) {
  const { user } = useAuth();
  const { friends } = useFriends();
  // useState's lazy initializer creates one stable client for the component's
  // lifetime (reading a ref during render is disallowed by react-hooks).
  const [supabase] = useState(() => createClient());
  // Friends invited from the waiting room (to show an "invited" state).
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  // Host-chosen game modes (read from the duel row in init).
  const [settings, setSettings] = useState<{
    timed: boolean;
    noMove: boolean;
    countries: string[] | null;
  }>({ timed: false, noMove: false, countries: null });
  // Mirror of settings.timed for closures that shouldn't list it as a dep.
  const timedRef = useRef(false);
  // Round-start anchor (local clock) for the Timed countdown.
  const roundStartRef = useRef<{ round: number; at: number } | null>(null);
  // Whether the current round's panorama has actually rendered (gate the timer).
  const [viewReady, setViewReady] = useState(false);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [duelId, setDuelId] = useState<string | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [rounds, setRounds] = useState<DuelRoundData[]>([]);
  const [myScore, setMyScore] = useState(DUEL_STARTING_HP);
  const [opponentScore, setOpponentScore] = useState(DUEL_STARTING_HP);
  // Region diagonal (km) the server locked in for this duel — scales the round
  // score. Set once from the duel row; read via a ref in stable callbacks.
  const [diagonalKm, setDiagonalKm] = useState(WORLD_DIAGONAL_KM);
  const diagonalRef = useRef(diagonalKm);
  useEffect(() => {
    diagonalRef.current = diagonalKm;
  }, [diagonalKm]);
  const [countdown, setCountdown] = useState(3);
  const [mapOpen, setMapOpen] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const hasSubmittedRef = useRef(false);
  // Prevent resolveRound from running twice
  const roundResolvedRef = useRef(-1);
  // Mirror of currentRound so stable callbacks (advanceToNextRound) read the
  // live round without listing it as a dep.
  const currentRoundRef = useRef(0);
  // Highest round we've advanced INTO — makes advanceToNextRound idempotent so
  // concurrent triggers (ready broadcast + handleNext + auto-advance) can't
  // double-fire and skip a round.
  const advancedToRef = useRef(0);
  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);
  // Mirror of viewReady for the guess-state closure (avoids re-subscribing the
  // guess channel when the panorama finishes loading).
  const viewReadyRef = useRef(false);
  useEffect(() => {
    viewReadyRef.current = viewReady;
  }, [viewReady]);
  // Broadcast channel for "ready for next round" sync
  const readyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // The round the opponent signaled "ready for next" for. Comparing it to
  // currentRound makes a late/stale ready broadcast from a previous round
  // harmless (it can no longer trigger a premature or double advance).
  const [opponentReadyRound, setOpponentReadyRound] = useState<number | null>(
    null
  );
  const [iReady, setIReady] = useState(false);
  const opponentReady = opponentReadyRound === currentRound;
  // Timer: countdown when opponent guessed but I haven't
  const GUESS_TIME_LIMIT = 30;
  const [guessTimer, setGuessTimer] = useState<number | null>(null);
  const timerAutoSubmittedRef = useRef(-1);
  // When THIS client first saw the opponent's guess for a round (local clock).
  // We time the 30s from here instead of from the server's created_at, so a
  // skewed device clock can't make the timer expire instantly (auto-ocean).
  const opponentSeenRef = useRef<{ round: number; at: number } | null>(null);
  // Auto-advance timer for result screen
  const NEXT_ROUND_TIME_LIMIT = 60;
  const [nextTimer, setNextTimer] = useState<number | null>(null);
  // How long we've been waiting for the opponent to guess this round (seconds).
  // Drives progressive "they may have left" feedback + the claim-win countdown.
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [forfeiting, setForfeiting] = useState(false);
  // After SUSPECT we warn the opponent may have left; at FORFEIT we let the
  // player claim the win. SUSPECT sits just past the 30s auto-submit window: a
  // present opponent would have been auto-submitted by then, so still waiting
  // strongly implies they left. FORFEIT stays above the server's 60s window so
  // a reconnecting opponent isn't robbed.
  const SUSPECT_AFTER_SECONDS = 35;
  const FORFEIT_AFTER_SECONDS = 65;
  const canForfeit = waitSeconds >= FORFEIT_AFTER_SECONDS;

  const me = players.find((p) => p.player_id === user?.id);
  const opponent = players.find((p) => p.player_id !== user?.id);
  const isHost = me?.is_host ?? false;

  // Latest scores in refs so checkAndResolveGuesses can read them without
  // listing myScore/opponentScore as deps (which would tear down and
  // re-subscribe the realtime channel on every score change).
  const myScoreRef = useRef(myScore);
  const opponentScoreRef = useRef(opponentScore);
  useEffect(() => {
    myScoreRef.current = myScore;
  }, [myScore]);
  useEffect(() => {
    opponentScoreRef.current = opponentScore;
  }, [opponentScore]);
  useEffect(() => {
    timedRef.current = settings.timed;
  }, [settings.timed]);

  // --- Helper: check and resolve guesses for a round ---
  // The DB trigger (resolve_duel_guess) calculates distance_km, penalty, and
  // updates duel_players.score automatically. We just read the results.
  const checkAndResolveGuesses = useCallback(
    async () => {
      if (!duelId || !user) return;

      // Resolve the LOWEST round that hasn't been resolved yet, independent of
      // `currentRound`. If we keyed off currentRound, a client whose currentRound
      // advanced (DB trigger bumps duels.current_round once both guessed, or a
      // refresh re-reads it) would query the wrong round and hang on the spinner
      // forever while the opponent already sees the result. Resolving
      // roundResolvedRef.current + 1 makes both clients converge deterministically.
      const round = roundResolvedRef.current + 1;
      if (round >= DUEL_ROUNDS) return;

      const { data: guesses } = await supabase
        .from("duel_guesses")
        .select("player_id, distance_km, guess_lat, guess_lng, penalty")
        .eq("duel_id", duelId)
        .eq("round", round);

      if (!guesses || guesses.length < 2) return;

      const myGuessData = guesses.find((g) => g.player_id === user.id);
      const opponentGuessData = guesses.find((g) => g.player_id !== user.id);
      if (!myGuessData || !opponentGuessData) return;
      // Guard: don't resolve before this client has the round's location.
      if (!locations[round]) return;

      // Read scores from DB (trigger already updated them)
      const { data: playersData } = await supabase
        .from("duel_players")
        .select("player_id, score")
        .eq("duel_id", duelId);

      const myPlayerData = playersData?.find((p) => p.player_id === user.id);
      const oppPlayerData = playersData?.find((p) => p.player_id !== user.id);

      const newMyScore = myPlayerData?.score ?? myScoreRef.current;
      const newOpponentScore = oppPlayerData?.score ?? opponentScoreRef.current;

      // Round scores from the server-locked diagonal; the winner is whoever
      // scored higher (the trigger applied the damage to the loser's HP).
      const myPoints = roundScore(myGuessData.distance_km, diagonalRef.current);
      const opponentPoints = roundScore(
        opponentGuessData.distance_km,
        diagonalRef.current
      );
      const isDraw = myPoints === opponentPoints;
      const iWon = myPoints > opponentPoints;

      const roundData: DuelRoundData = {
        location: locations[round],
        myGuess: { lat: myGuessData.guess_lat, lng: myGuessData.guess_lng },
        opponentGuess: {
          lat: opponentGuessData.guess_lat,
          lng: opponentGuessData.guess_lng,
        },
        myDistance: myGuessData.distance_km,
        opponentDistance: opponentGuessData.distance_km,
        myPoints,
        opponentPoints,
        damage: Math.max(myGuessData.penalty, opponentGuessData.penalty),
        iWon,
        isDraw,
      };

      // Mark resolved only now that everything succeeded — never on an early
      // return — so a transient failure can't poison the ref and permanently
      // block this round from ever resolving.
      roundResolvedRef.current = round;

      setMyScore(newMyScore);
      setOpponentScore(newOpponentScore);
      // Keep currentRound aligned with the round we actually resolved, so the
      // result screen labels the right round and the next advance is correct
      // even if currentRound had drifted ahead.
      setCurrentRound(round);
      currentRoundRef.current = round;
      if (advancedToRef.current < round) advancedToRef.current = round;
      // Append round only if not already present (prevents duplicates on refresh)
      setRounds((prev) => (prev.length > round ? prev : [...prev, roundData]));
      // Reset ready state for next round
      setIReady(false);
      setOpponentReadyRound(null);
      setPhase("result");
    },
    [duelId, user, locations, supabase]
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
        .select("locations, status, diagonal_km")
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
        if (typeof duel.diagonal_km === "number" && duel.diagonal_km > 0) {
          setDiagonalKm(duel.diagonal_km);
        }
        return true;
      }
      return false;
    },
    [supabase]
  );

  // ====== Step 1: Connect and fetch initial state ======
  // On mount (including after refresh), reconstruct the complete game state
  // from the DB. The DB is the single source of truth.
  useEffect(() => {
    if (!user) return;

    async function init() {
      const { data: duel } = await supabase
        .from("duels")
        .select("id, status, locations, current_round, timed, no_move, countries, diagonal_km")
        .eq("code", code)
        .single();

      if (!duel) {
        setError("Game not found.");
        setPhase("error");
        return;
      }

      setDuelId(duel.id);
      setSettings({
        timed: !!duel.timed,
        noMove: !!duel.no_move,
        countries: (duel.countries as string[] | null) ?? null,
      });
      const diag =
        typeof duel.diagonal_km === "number" && duel.diagonal_km > 0
          ? duel.diagonal_km
          : WORLD_DIAGONAL_KM;
      setDiagonalKm(diag);

      // Fetch players and all guesses in parallel
      const [playersResult, guessesResult] = await Promise.all([
        supabase
          .from("duel_players")
          .select("id, player_id, score, is_host, profiles(nickname, emoji)")
          .eq("duel_id", duel.id),
        supabase
          .from("duel_guesses")
          .select("player_id, round, distance_km, guess_lat, guess_lng, penalty")
          .eq("duel_id", duel.id)
          .order("round", { ascending: true }),
      ]);

      if (!playersResult.data) return;
      const mapped = mapPlayers(playersResult.data as Record<string, unknown>[]);
      setPlayers(mapped);

      // Sync scores from DB (authoritative)
      const meData = mapped.find((p) => p.player_id === user!.id);
      const oppData = mapped.find((p) => p.player_id !== user!.id);
      if (meData) setMyScore(meData.score);
      if (oppData) setOpponentScore(oppData.score);

      // Waiting for opponent to join
      if (mapped.length < 2) {
        setPhase("waiting");
        return;
      }

      // Locations not ready yet (host still generating)
      if (duel.status !== "playing" || !duel.locations) {
        setPhase("loading");
        return;
      }

      // Game is in progress — reconstruct everything
      const locs = parseLocations(
        duel.locations as Array<{ lat: number; lng: number }>
      );
      setLocations(locs);

      const guesses = (guessesResult.data ?? []) as DuelGuessRow[];

      // Rebuild completed rounds history so refreshing doesn't lose it
      const history = buildRoundsHistory(guesses, user!.id, locs, diag);
      setRounds(history);
      // Mark already-resolved rounds so checkAndResolveGuesses doesn't re-add them
      roundResolvedRef.current = history.length - 1;

      // Use DB's current_round if available (trigger-maintained),
      // otherwise fall back to inferring from history
      const currentR = duel.current_round ?? history.length;
      setCurrentRound(currentR);
      currentRoundRef.current = currentR;
      advancedToRef.current = currentR;

      // Game over
      if (duel.status === "finished" || currentR >= DUEL_ROUNDS) {
        setPhase("summary");
        return;
      }

      // Determine playing state for the current round
      const currentRoundGuesses = guesses.filter((g) => g.round === currentR);
      const myGuess = currentRoundGuesses.find(
        (g) => g.player_id === user!.id
      );

      if (myGuess) {
        // I already guessed in this round — wait for opponent
        hasSubmittedRef.current = true;
        setPhase("waiting-opponent");
      } else {
        setPhase("playing");
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

      // Prefer the curated pool (scoped to the chosen region); fall back to a
      // live search if not seeded yet.
      let locs = await getRandomPoolLocations(DUEL_ROUNDS, settings.countries);
      if (locs.length < DUEL_ROUNDS) {
        locs = await findGameLocations(
          svServiceRef.current,
          DUEL_ROUNDS,
          setLoadProgress
        );
      }

      if (locs.length < DUEL_ROUNDS) {
        setError("Failed to find enough locations. Try again.");
        setPhase("error");
        return;
      }

      const locationsJson = locs.map((l) => ({
        lat: l.lat,
        lng: l.lng,
        pano: l.panoId,
        heading: l.heading,
      }));
      await supabase
        .from("duels")
        .update({ locations: locationsJson, status: "playing" })
        .eq("id", duelId);

      setLocations(locs);
      setPhase("countdown");
    }

    generateLocations();
  }, [phase, isHost, duelId, supabase, settings.countries]);

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

    // Give up if the host never produces locations (e.g. they abandoned
    // mid-generation). Without this the guest waits forever.
    const giveUp = setTimeout(() => {
      setError("The host took too long or left. Try another game.");
      setPhase("error");
    }, 45000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [phase, isHost, duelId, supabase, checkLocations]);

  // ====== Step 4: Countdown ======
  useEffect(() => {
    if (phase !== "countdown") return;

    // Intentional: reset the countdown each time we enter the countdown phase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setPhase("playing");
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

      // Only send coordinates — the DB trigger calculates distance_km and penalty
      const { error: insertError } = await supabase.from("duel_guesses").insert({
        duel_id: duelId,
        player_id: user.id,
        round: currentRound,
        guess_lat: guessLat,
        guess_lng: guessLng,
      });

      if (insertError) {
        // 23505 = unique violation: a guess for this (duel, player, round)
        // already landed (double-tap, or the self-heal racing an in-flight
        // insert). It IS submitted — keep the flag and proceed, don't reopen.
        if (insertError.code === "23505") {
          setPhase("waiting-opponent");
          setMapOpen(false);
          await checkAndResolveGuesses();
          return;
        }
        hasSubmittedRef.current = false;
        return;
      }

      setPhase("waiting-opponent");
      setMapOpen(false);

      // Immediately check if opponent already guessed (trigger resolves the round)
      await checkAndResolveGuesses();
    },
    [duelId, user, currentRound, supabase, checkAndResolveGuesses]
  );

  // ====== Step 6: Listen for guesses + poll fallback ======
  // Also restores "waiting-opponent" if I already guessed (e.g. after tab switch)
  // And starts a timer if opponent guessed but I haven't
  useEffect(() => {
    if (phase !== "playing" && phase !== "waiting-opponent") return;
    if (!duelId || !user) return;

    async function checkGuessState() {
      const { data: guesses } = await supabase
        .from("duel_guesses")
        .select("player_id")
        .eq("duel_id", duelId!)
        .eq("round", currentRound);

      const myGuess = guesses?.find((g) => g.player_id === user!.id);
      const opponentGuess = guesses?.find((g) => g.player_id !== user!.id);

      if (myGuess) {
        // I already guessed — restore state
        hasSubmittedRef.current = true;
        if (phase === "playing") setPhase("waiting-opponent");
        setGuessTimer(null);
        return;
      }

      // Self-heal: I'm on the play screen for this round but the DB has no guess
      // from me, so I cannot be "already submitted". Clear a stale flag left by a
      // desynced advance — otherwise tapping Guess would silently no-op. (Safe:
      // once a guess is actually sent, handleGuess moves us to waiting-opponent,
      // so we're no longer in "playing" here.)
      if (phase === "playing" && hasSubmittedRef.current) {
        hasSubmittedRef.current = false;
      }

      if (
        opponentGuess &&
        !hasSubmittedRef.current &&
        !timedRef.current &&
        viewReadyRef.current
      ) {
        // Opponent guessed but I haven't — count 30s from when WE first saw it
        // AND our panorama has rendered (viewReadyRef), so a fast opponent + a
        // slow-loading pano can't auto-submit an ocean guess before I can look.
        // (local clock only). Anchoring to the server's created_at vs our
        // Date.now() let a fast device clock expire the timer instantly.
        // (In Timed mode the timer is round-start based instead — see below.)
        if (
          !opponentSeenRef.current ||
          opponentSeenRef.current.round !== currentRound
        ) {
          opponentSeenRef.current = { round: currentRound, at: Date.now() };
        }
        const elapsed = Math.floor(
          (Date.now() - opponentSeenRef.current.at) / 1000
        );
        const remaining = Math.max(0, GUESS_TIME_LIMIT - elapsed);
        setGuessTimer(remaining);
      }
    }

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
          checkGuessState();
          checkAndResolveGuesses();
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await checkGuessState();
          await checkAndResolveGuesses();
        }
      });

    // Poll fallback every 2s
    const poll = setInterval(() => {
      checkGuessState();
      checkAndResolveGuesses();
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [phase, duelId, currentRound, user, supabase, checkAndResolveGuesses]);

  // ====== Step 6b: Timer countdown + auto-submit on timeout ======
  useEffect(() => {
    if (guessTimer === null || phase !== "playing") return;

    if (guessTimer <= 0) {
      // Time's up — auto-submit a max-distance guess
      if (
        !hasSubmittedRef.current &&
        timerAutoSubmittedRef.current < currentRound &&
        duelId &&
        user
      ) {
        timerAutoSubmittedRef.current = currentRound;
        hasSubmittedRef.current = true;

        // Submit a dummy guess at 0,0 — trigger calculates the real distance
        supabase
          .from("duel_guesses")
          .insert({
            duel_id: duelId,
            player_id: user.id,
            round: currentRound,
            guess_lat: 0,
            guess_lng: 0,
          })
          .then(({ error: timerInsertError }) => {
            if (timerInsertError) {
              hasSubmittedRef.current = false;
              return;
            }
            setPhase("waiting-opponent");
            setGuessTimer(null);
            checkAndResolveGuesses();
          });
      }
      return;
    }

    const tick = setTimeout(() => {
      setGuessTimer((t) => (t !== null ? t - 1 : null));
    }, 1000);

    return () => clearTimeout(tick);
  }, [
    guessTimer,
    phase,
    currentRound,
    duelId,
    user,
    locations,
    supabase,
    checkAndResolveGuesses,
  ]);

  // Actually advance to next round (called when both are ready).
  // Declared before handleNext because handleNext references it.
  const advanceToNextRound = useCallback(() => {
    const leaving = currentRoundRef.current;
    const next = leaving + 1;
    // Idempotency: if we've already advanced into `next` (a concurrent trigger
    // beat us to it), do nothing — otherwise currentRound could jump by 2 and
    // skip a round.
    if (advancedToRef.current >= next) return;
    advancedToRef.current = next;

    // Re-signal that I've left `leaving`, so an opponent still on its result
    // screen advances too even if my earlier ready broadcast was lost.
    readyChannelRef.current?.send({
      type: "broadcast",
      event: "ready",
      payload: { player_id: user?.id, round: leaving },
    });

    hasSubmittedRef.current = false;
    setIReady(false);
    setOpponentReadyRound(null);
    setGuessTimer(null);
    setViewReady(false);
    setCurrentRound(next);
    setPhase("playing");
    setMapOpen(false);
  }, [user]);

  // ====== Handle next round (player presses button) ======
  const handleNext = useCallback(async () => {
    // Final round or game over → go directly to summary. Read scores from refs
    // (not the state closure) so a KO that landed in checkAndResolveGuesses this
    // tick isn't missed by a stale closure.
    if (
      myScoreRef.current <= 0 ||
      opponentScoreRef.current <= 0 ||
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
  }, [currentRound, duelId, supabase, user, opponentReady, advanceToNextRound]);

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
          setOpponentReadyRound(data.round);
        }
      })
      .subscribe();

    readyChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      readyChannelRef.current = null;
    };
  }, [duelId, user, supabase]);

  // While waiting for the opponent to also press Next: advance the moment their
  // ready arrives, and meanwhile RE-BROADCAST my own readiness every 1.5s so a
  // lost packet recovers in either direction. We never advance on a blind local
  // timer (that raced ahead a whole round when the opponent was merely reading
  // the result); the 60s result auto-advance (nextTimer) + the abandon-claim are
  // the escapes if the opponent is actually gone.
  useEffect(() => {
    if (phase !== "waiting-next" || !iReady) return;

    if (opponentReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      advanceToNextRound();
      return;
    }

    const id = setInterval(() => {
      readyChannelRef.current?.send({
        type: "broadcast",
        event: "ready",
        payload: { player_id: user?.id, round: currentRound },
      });
    }, 1500);
    return () => clearInterval(id);
  }, [phase, opponentReady, iReady, currentRound, user, advanceToNextRound]);

  // ====== Step 8: Auto-advance timer on result screen ======
  // Start the timer when result phase begins
  useEffect(() => {
    // Intentional: arm/disarm the auto-advance timer on phase transitions.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (phase === "result") {
      setNextTimer(NEXT_ROUND_TIME_LIMIT);
    } else if (phase !== "waiting-next") {
      setNextTimer(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [phase]);

  // Tick down and auto-advance when timer hits 0
  useEffect(() => {
    if (nextTimer === null) return;
    if (phase !== "result" && phase !== "waiting-next") return;

    if (nextTimer <= 0) {
      // Auto-press "Next Round" when the timer runs out.
      if (!iReady) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleNext();
      }
      return;
    }

    const tick = setTimeout(() => {
      setNextTimer((t) => (t !== null ? t - 1 : null));
    }, 1000);

    return () => clearTimeout(tick);
  }, [nextTimer, phase, iReady, handleNext]);

  // ====== Track how long we've been waiting for the opponent this round ======
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaitSeconds(0);
    if (phase !== "waiting-opponent") return;
    const id = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase, currentRound]);

  const handleForfeit = useCallback(async () => {
    if (!duelId || forfeiting) return;
    setForfeiting(true);
    const { error: forfeitError } = await supabase.rpc("forfeit_duel", {
      p_duel_id: duelId,
    });
    if (forfeitError) {
      // The opponent likely guessed just in time — let the normal flow resolve
      // the round instead of forcing a forfeit.
      setForfeiting(false);
      return;
    }
    setOpponentScore(0);
    setPhase("summary");
  }, [duelId, forfeiting, supabase]);

  const handleInvite = useCallback(
    async (friendId: string) => {
      if (!duelId) return;
      const ok = await inviteToExistingDuel(friendId, duelId);
      if (ok) setInvitedIds((s) => new Set(s).add(friendId));
    },
    [duelId]
  );

  // ====== Heartbeat + auto-end on abandonment ======
  // While I'm in the duel room, mark myself present every few seconds. This
  // keeps the duel alive (the cleanup job deletes duels where everyone's
  // heartbeat is stale) and lets the server end an in-progress duel in my
  // favor (~60s) if the opponent leaves. claim_abandoned_duel self-guards to
  // 'playing' duels, so heartbeating while waiting/loading is harmless.
  useEffect(() => {
    const IN_ROOM: Phase[] = [
      "waiting",
      "loading",
      "countdown",
      "playing",
      "waiting-opponent",
      "waiting-next",
      "result",
    ];
    if (!duelId || !user || !IN_ROOM.includes(phase)) return;

    let cancelled = false;
    const beat = async () => {
      // Always refresh my own presence so I'm not the one claimed/cleaned.
      await supabase.rpc("duel_heartbeat", { p_duel_id: duelId });
      if (cancelled) return;
      // Claim only kicks in after 60s of the opponent's stale heartbeat, so a
      // present-but-slow opponent (who keeps heartbeating from any in-room
      // phase, incl. the result screen) is never claimed. Running it in every
      // in-room phase means a genuinely-gone opponent ends the duel even if I'm
      // stuck on the result / waiting-next screen.
      const { data: won } = await supabase.rpc("claim_abandoned_duel", {
        p_duel_id: duelId,
      });
      if (!cancelled && won === true) {
        setOpponentScore(0);
        setPhase("summary");
      }
    };

    beat();
    const id = setInterval(beat, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [duelId, user, phase, supabase]);

  // Timed mode: arm a 30s countdown once the round's panorama is visible (never
  // over a blank/broken view). Step 6b counts it down + auto-submits on timeout.
  useEffect(() => {
    if (!settings.timed || phase !== "playing" || !viewReady) return;
    if (roundStartRef.current?.round !== currentRound) {
      roundStartRef.current = { round: currentRound, at: Date.now() };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuessTimer(GUESS_TIME_LIMIT);
    }
  }, [settings.timed, phase, currentRound, viewReady]);

  const currentLocation = locations[currentRound];

  // ===== RENDERS =====

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
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
      <div className="flex items-center justify-center h-dvh pop-bg">
        <p className="text-neutral-500 animate-pulse">Connecting...</p>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-6">
          Waiting for opponent
        </p>

        <div className="surface-pop p-8 mb-6">
          <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">
            Share this code
          </p>
          <p className="font-mono text-5xl font-bold text-white tracking-[0.3em]">
            {code}
          </p>
        </div>

        {/* Mode chips */}
        {(settings.timed || settings.noMove || settings.countries) && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            {regionLabelFromCountries(settings.countries) && (
              <span className="text-xs bg-zinc-800 text-neutral-300 rounded-full px-3 py-1">
                {regionLabelFromCountries(settings.countries)}
              </span>
            )}
            {settings.timed && (
              <span className="text-xs bg-zinc-800 text-neutral-300 rounded-full px-3 py-1">
                ⏱️ Timed
              </span>
            )}
            {settings.noMove && (
              <span className="text-xs bg-zinc-800 text-neutral-300 rounded-full px-3 py-1">
                🚷 No Move
              </span>
            )}
          </div>
        )}

        {/* Invite online friends directly */}
        {friends.some((f) => f.online) && (
          <div className="w-full max-w-xs surface-pop p-4 mb-6">
            <p className="text-neutral-500 text-[11px] uppercase tracking-wider mb-3">
              Invite a friend
            </p>
            <div className="space-y-1.5">
              {friends
                .filter((f) => f.online)
                .map((f) => (
                  <div key={f.friendshipId} className="flex items-center gap-2">
                    <span className="text-lg">{f.emoji}</span>
                    <span className="flex-1 min-w-0 text-sm text-neutral-200 truncate text-left">
                      {f.nickname}
                    </span>
                    <button
                      onClick={() => handleInvite(f.id)}
                      disabled={invitedIds.has(f.id)}
                      className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-400 text-[#0a0a0a] px-3 py-1.5 rounded-full transition-colors cursor-pointer disabled:cursor-default"
                    >
                      {invitedIds.has(f.id) ? "Invited ✓" : "Invite"}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

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
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
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
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
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
    const oppName = opponent?.nickname ?? "your opponent";
    const suspect = waitSeconds >= SUSPECT_AFTER_SECONDS;
    return (
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-lg">Waiting for {oppName}...</p>
        <p className="text-neutral-600 text-sm mt-2">
          You already placed your guess
        </p>

        {/* Progressive feedback so the wait is never silent. */}
        {suspect && !canForfeit && (
          <div className="mt-8 flex flex-col items-center gap-2 max-w-xs">
            <p className="text-amber-400/90 text-sm">
              {oppName} is taking a while — they may have disconnected.
            </p>
            <p className="text-neutral-500 text-xs tabular-nums">
              You can claim the win in {FORFEIT_AFTER_SECONDS - waitSeconds}s
            </p>
          </div>
        )}

        {canForfeit && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-neutral-400 text-sm max-w-xs">
              {oppName} seems to have left the game.
            </p>
            <button
              onClick={handleForfeit}
              disabled={forfeiting}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] font-bold py-3 px-7 rounded-full transition-all cursor-pointer"
            >
              {forfeiting ? "Claiming..." : "Claim win"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === "waiting-next") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh pop-bg px-4 text-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-lg">
          Waiting for {opponent?.nickname ?? "opponent"}...
        </p>
        <p className="text-neutral-600 text-sm mt-2">
          You&apos;re ready for the next round
        </p>
        {nextTimer !== null && (
          <p className="text-zinc-500 text-xs mt-3 tabular-nums">
            Auto-advancing in {nextTimer}s
          </p>
        )}
      </div>
    );
  }

  if (phase === "result") {
    const lastRound = rounds[rounds.length - 1];
    return (
      <div className="h-dvh pop-bg">
        <DuelRoundResult
          round={currentRound + 1}
          totalRounds={DUEL_ROUNDS}
          location={lastRound.location}
          myGuess={lastRound.myGuess}
          opponentGuess={lastRound.opponentGuess}
          myDistance={lastRound.myDistance}
          opponentDistance={lastRound.opponentDistance}
          myPoints={lastRound.myPoints}
          opponentPoints={lastRound.opponentPoints}
          damage={lastRound.damage}
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
          autoAdvanceTimer={nextTimer}
        />
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="h-dvh pop-bg">
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
          key={`duel-${currentRound}`}
          lat={currentLocation.lat}
          lng={currentLocation.lng}
          panoId={currentLocation.panoId}
          heading={currentLocation.heading}
          move={!settings.noMove}
          onReady={() => setViewReady(true)}
        />
      </div>

      {/* HUD */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex items-center justify-between pointer-events-none pt-[env(safe-area-inset-top)]">
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

      {/* Timer banner — only rendered in the "playing" phase; once a guess is
          submitted the phase changes and this block unmounts. */}
      {guessTimer !== null && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-10">
          <div
            className={`backdrop-blur-sm rounded-full px-5 py-2.5 flex items-center gap-2.5 shadow-lg border ${
              guessTimer <= 10
                ? "bg-red-950/80 border-red-800/50"
                : "bg-black/70 border-zinc-700/50"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={guessTimer <= 10 ? "#ef4444" : "#fbbf24"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span
              className={`font-mono font-bold text-lg tabular-nums ${
                guessTimer <= 10 ? "text-red-400 animate-pulse" : "text-yellow-400"
              }`}
            >
              {guessTimer}s
            </span>
            <span className="text-zinc-400 text-xs hidden sm:inline">
              {opponent?.nickname} already guessed
            </span>
          </div>
        </div>
      )}

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
