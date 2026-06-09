-- Forfeit handling for abandoned duels.
--
-- If the opponent truly leaves (closes the tab) after you've guessed, the round
-- can never resolve (it needs both guesses) and the client-side 30s auto-submit
-- can't fire for a tab that's gone — so the present player would hang. This RPC
-- lets the present player claim the win, with server-side validation so it
-- can't be abused to steal a win from a player who is actually still there:
--
--   - caller is a participant of the duel,
--   - the duel is still 'playing',
--   - the caller HAS guessed in their latest round but the opponent HAS NOT,
--   - and at least 40s (server clock) have passed since the caller's guess —
--     longer than the opponent's own 30s auto-submit window, so a present
--     player who was about to be auto-submitted isn't robbed.
--
-- On success the absent opponent's score is set to 0 (they forfeit) and the
-- duel is finished. Scores live in duel_players, which clients cannot UPDATE
-- directly ("No direct score updates" policy) — only this SECURITY DEFINER
-- function (owned by the table owner) can, so the outcome isn't forgeable.

CREATE OR REPLACE FUNCTION "public"."forfeit_duel"("p_duel_id" "uuid")
  RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  opponent uuid;
  caller_round int;
  caller_guess_at timestamptz;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Caller must be in this duel; find the opponent.
  IF NOT EXISTS (
    SELECT 1 FROM public.duel_players
    WHERE duel_id = p_duel_id AND player_id = caller
  ) THEN
    RAISE EXCEPTION 'not your duel';
  END IF;

  SELECT player_id INTO opponent
  FROM public.duel_players
  WHERE duel_id = p_duel_id AND player_id <> caller
  LIMIT 1;

  IF opponent IS NULL THEN
    RAISE EXCEPTION 'no opponent to forfeit';
  END IF;

  -- Lock the duel; it must still be in progress.
  PERFORM 1 FROM public.duels
  WHERE id = p_duel_id AND status = 'playing'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duel not in progress';
  END IF;

  -- The caller's latest guessed round.
  SELECT max(round) INTO caller_round
  FROM public.duel_guesses
  WHERE duel_id = p_duel_id AND player_id = caller;

  IF caller_round IS NULL THEN
    RAISE EXCEPTION 'you have not guessed yet';
  END IF;

  -- The opponent must NOT have guessed in that round (they are the missing one).
  IF EXISTS (
    SELECT 1 FROM public.duel_guesses
    WHERE duel_id = p_duel_id AND round = caller_round AND player_id = opponent
  ) THEN
    RAISE EXCEPTION 'opponent already guessed';
  END IF;

  -- Enough server-side time must have passed since the caller's guess.
  SELECT created_at INTO caller_guess_at
  FROM public.duel_guesses
  WHERE duel_id = p_duel_id AND player_id = caller AND round = caller_round;

  IF now() - caller_guess_at < interval '40 seconds' THEN
    RAISE EXCEPTION 'too soon to claim a forfeit';
  END IF;

  -- Forfeit: the absent opponent loses, the duel ends.
  UPDATE public.duel_players SET score = 0
  WHERE duel_id = p_duel_id AND player_id = opponent;

  UPDATE public.duels SET status = 'finished'
  WHERE id = p_duel_id;
END;
$$;

ALTER FUNCTION "public"."forfeit_duel"("p_duel_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."forfeit_duel"("p_duel_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."forfeit_duel"("p_duel_id" "uuid") TO "authenticated";
