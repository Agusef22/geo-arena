-- Server-authoritative classic mode.
--
-- Before: the client picked pool locations, played, and inserted into
-- game_results with the round lat/lng it claimed. A trigger recomputed the
-- score, but from client-supplied actual coordinates — so a cheater could forge
-- the locations (or guess == actual) and the leaderboard (getLeaderboard) and
-- player stats were spoofable.
--
-- After: the server assigns and stores the locations for each game. The client
-- plays and submits only its guesses; the server scores against the locations
-- IT stored. Direct inserts into game_results are removed, so every saved
-- classic result now goes through this path.
--
-- Residual (inherent to any client-rendered geo game): the client must display
-- the panorama, so a determined cheater can still read the true coordinate from
-- the page and guess it exactly. That cannot be closed client-side. This closes
-- the forge-arbitrary-score/coords hole, which is what the leaderboard needs.

-- =====================================================================
-- 1. Per-game session: the server's record of which locations a game used.
--    RLS on with NO client write policies — only the SECURITY DEFINER RPCs
--    below (owned by postgres, which owns the table) ever write here.
-- =====================================================================
CREATE TABLE IF NOT EXISTS "public"."classic_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "locations" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'playing'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classic_games_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "classic_games_player_id_fkey" FOREIGN KEY ("player_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "classic_games_status_check"
      CHECK ("status" IN ('playing', 'finished'))
);

ALTER TABLE "public"."classic_games" OWNER TO "postgres";
ALTER TABLE "public"."classic_games" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "classic_games_player_id_idx"
  ON "public"."classic_games" USING "btree" ("player_id");

GRANT ALL ON TABLE "public"."classic_games" TO "service_role";

-- =====================================================================
-- 2. Harden resolve_game_result so it REBUILDS the stored rounds from the
--    canonical formula instead of trusting whatever per-round fields came in.
--    Callers (the RPC below) only need to provide lat/lng + guessLat/guessLng
--    per round; everything else (distance, penalty, ratio, bonus) is computed
--    here, so getPlayerStats (which reads penaltyRatio) stays correct.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."resolve_game_result"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r jsonb;
  idx int := 0;
  glat double precision;
  glng double precision;
  d double precision;
  ratio double precision;
  max_pen int;
  pen int;
  bon int;
  total_pen int := 0;
  total_bon int := 0;
  final_score int;
  rebuilt jsonb := '[]'::jsonb;
  round_max int[] := ARRAY[2500, 3000, 3500, 4000, 5000]; -- ROUND_MAX_PENALTY
  starting int := 10000;                                  -- STARTING_SCORE
BEGIN
  -- Only classic is scored here. Duel resolves in duel_guesses.
  IF NEW.mode IS DISTINCT FROM 'classic' THEN
    RETURN NEW;
  END IF;

  IF NEW.rounds IS NULL OR jsonb_typeof(NEW.rounds) <> 'array' THEN
    RAISE EXCEPTION 'rounds must be a JSON array';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(NEW.rounds)
  LOOP
    glat := (r ->> 'guessLat')::double precision;
    glng := (r ->> 'guessLng')::double precision;

    -- real distance (haversine) between the actual location and the guess
    d := haversine_km(
      (r ->> 'lat')::double precision,
      (r ->> 'lng')::double precision,
      glat,
      glng
    );

    -- distanceToPenaltyRatio
    IF d < 0.15 THEN
      ratio := 0;
    ELSE
      ratio := LEAST(1, 1 - exp(-d / 1500.0));
    END IF;

    -- getRoundMaxPenalty(round) — array is 1-indexed in PG
    max_pen := round_max[LEAST(idx, 4) + 1];
    pen := round(ratio * max_pen)::int;

    -- calculateBonus
    IF d < 0.15 THEN
      bon := 5000;
    ELSIF d < 75 THEN
      bon := 1000;
    ELSE
      bon := 0;
    END IF;

    total_pen := total_pen + pen;
    total_bon := total_bon + bon;

    -- Rebuild this round with canonical values (mirrors RoundData).
    rebuilt := rebuilt || jsonb_build_object(
      'lat', (r ->> 'lat')::double precision,
      'lng', (r ->> 'lng')::double precision,
      'guessLat', glat,
      'guessLng', glng,
      'distance', d,
      'penalty', pen,
      'penaltyRatio', ratio,
      'maxPenalty', max_pen,
      'bonus', bon
    );

    idx := idx + 1;
  END LOOP;

  final_score := starting - total_pen + total_bon;

  NEW.rounds := rebuilt;
  NEW.rounds_played := idx;
  NEW.total_penalty := total_pen;
  NEW.total_bonus := total_bon;
  NEW.game_over := final_score <= 0;
  NEW.score := GREATEST(0, final_score);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."resolve_game_result"() OWNER TO "postgres";

-- =====================================================================
-- 3. Start a classic game: pick N pool locations, store them, return the
--    game id + the locations the client needs to render.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."start_classic_game"("n" integer DEFAULT 5)
  RETURNS TABLE("game_id" "uuid", "locations" "jsonb")
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  picked jsonb;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF n < 1 OR n > 20 THEN
    RAISE EXCEPTION 'invalid round count';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'lat', s.lat, 'lng', s.lng, 'pano', s.pano_id, 'heading', s.heading
         ))
  INTO picked
  FROM (
    SELECT lat, lng, pano_id, heading
    FROM public.pool_locations
    ORDER BY random()
    LIMIT n
  ) s;

  IF picked IS NULL OR jsonb_array_length(picked) < n THEN
    RAISE EXCEPTION 'not enough pool locations';
  END IF;

  INSERT INTO public.classic_games (player_id, locations)
  VALUES (auth.uid(), picked)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id, picked;
END;
$$;

ALTER FUNCTION "public"."start_classic_game"("n" integer) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."start_classic_game"("n" integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."start_classic_game"("n" integer) TO "authenticated";

-- =====================================================================
-- 4. Submit a classic game: score the player's guesses against the locations
--    the server stored. `guesses` is a JSON array of {lat, lng} in round order;
--    its length may be < the stored locations (game over before the last
--    round). Scoring is delegated to resolve_game_result via the insert.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."submit_classic_game"(
    "p_game_id" "uuid",
    "p_guesses" "jsonb"
  )
  RETURNS integer
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  g RECORD;
  n_guesses int;
  built jsonb := '[]'::jsonb;
  i int;
  loc jsonb;
  guess jsonb;
  result_score int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Lock the game row; must exist, belong to the caller, and still be playing
  -- (so a game can't be scored twice).
  SELECT * INTO g
  FROM public.classic_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;
  IF g.player_id <> auth.uid() THEN
    RAISE EXCEPTION 'not your game';
  END IF;
  IF g.status <> 'playing' THEN
    RAISE EXCEPTION 'game already submitted';
  END IF;

  IF p_guesses IS NULL OR jsonb_typeof(p_guesses) <> 'array' THEN
    RAISE EXCEPTION 'guesses must be a JSON array';
  END IF;

  n_guesses := jsonb_array_length(p_guesses);
  IF n_guesses < 1 OR n_guesses > jsonb_array_length(g.locations) THEN
    RAISE EXCEPTION 'invalid number of guesses';
  END IF;

  -- Pair each guess with the location the SERVER stored (not client-supplied).
  FOR i IN 0 .. n_guesses - 1 LOOP
    loc := g.locations -> i;
    guess := p_guesses -> i;
    built := built || jsonb_build_object(
      'lat', (loc ->> 'lat')::double precision,
      'lng', (loc ->> 'lng')::double precision,
      'guessLat', (guess ->> 'lat')::double precision,
      'guessLng', (guess ->> 'lng')::double precision
    );
  END LOOP;

  -- Insert; resolve_game_result (BEFORE INSERT) computes the canonical score
  -- and rebuilds the rounds. score/rounds_played/etc. are placeholders it
  -- overwrites, but the columns are NOT NULL so we must supply something.
  INSERT INTO public.game_results
    (player_id, mode, score, game_over, rounds_played, total_penalty, total_bonus, rounds)
  VALUES
    (auth.uid(), 'classic', 0, false, 0, 0, 0, built)
  RETURNING score INTO result_score;

  UPDATE public.classic_games SET status = 'finished' WHERE id = p_game_id;

  RETURN result_score;
END;
$$;

ALTER FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") TO "authenticated";

-- =====================================================================
-- 5. Lock down direct writes to game_results. Clients can no longer INSERT
--    their own rows; the only way to record a classic result is through
--    submit_classic_game (SECURITY DEFINER, owned by the table owner, so it
--    bypasses RLS). SELECT stays public for the leaderboard.
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can insert own results" ON "public"."game_results";
