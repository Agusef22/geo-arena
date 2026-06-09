-- Two duel reconnection improvements:
--  1. Widen the forfeit window from 40s to 60s, so an opponent who briefly
--     drops has a full minute to come back before the win can be claimed.
--  2. get_active_duel(): returns the caller's in-progress duel code (if any),
--     so the lobby can offer a one-click "resume game in progress" instead of
--     forcing the player to remember the URL/code.

-- 1. Wider forfeit window (rest of the function is unchanged from
--    20260609120000; only the interval changes 40s -> 60s).
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

  PERFORM 1 FROM public.duels
  WHERE id = p_duel_id AND status = 'playing'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duel not in progress';
  END IF;

  SELECT max(round) INTO caller_round
  FROM public.duel_guesses
  WHERE duel_id = p_duel_id AND player_id = caller;

  IF caller_round IS NULL THEN
    RAISE EXCEPTION 'you have not guessed yet';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.duel_guesses
    WHERE duel_id = p_duel_id AND round = caller_round AND player_id = opponent
  ) THEN
    RAISE EXCEPTION 'opponent already guessed';
  END IF;

  SELECT created_at INTO caller_guess_at
  FROM public.duel_guesses
  WHERE duel_id = p_duel_id AND player_id = caller AND round = caller_round;

  IF now() - caller_guess_at < interval '60 seconds' THEN
    RAISE EXCEPTION 'too soon to claim a forfeit';
  END IF;

  UPDATE public.duel_players SET score = 0
  WHERE duel_id = p_duel_id AND player_id = opponent;

  UPDATE public.duels SET status = 'finished'
  WHERE id = p_duel_id;
END;
$$;

-- 2. The caller's resumable duel (waiting or playing), most recent first.
--    SECURITY DEFINER but only ever returns the caller's own duel code.
CREATE OR REPLACE FUNCTION "public"."get_active_duel"()
  RETURNS "text"
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" = ''
  AS $$
    SELECT d.code
    FROM public.duels d
    JOIN public.duel_players dp ON dp.duel_id = d.id
    WHERE dp.player_id = auth.uid()
      AND d.status IN ('waiting', 'playing')
    ORDER BY d.created_at DESC
    LIMIT 1;
  $$;

ALTER FUNCTION "public"."get_active_duel"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_active_duel"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_active_duel"() TO "authenticated";
