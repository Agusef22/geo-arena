-- Classic scoring → additive, GeoGuessr-style, region-aware.
--
-- Before: start at 10,000 and SUBTRACT a round-dependent penalty + big bonus
-- cliffs (149 m = +5,000, 151 m = +1,000). Non-standard, with discontinuities
-- and a score that depended on round order — bad for a comparable leaderboard.
--
-- After: each round earns points = 5000·e^(−10·d/D), summed to 0–25,000. D is
-- the diagonal of the played region (its pool bounding box), so a small country
-- demands precision while the world stays forgiving — exactly how GeoGuessr
-- scales by map size. All rounds are equal; no cliffs; no "game over".
--
-- D is computed and stored SERVER-SIDE at game start (clients can't forge it),
-- carried onto game_results, and read by resolve_game_result when scoring.

-- =====================================================================
-- 1. Region diagonal: capped planar diagonal of the pool's bounding box for a
--    set of countries (NULL = world). Floored/capped so tiny regions don't get
--    an absurd scale and the world can't exceed half the Earth's circumference.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."region_diagonal_km"("p_countries" "text"[])
  RETURNS double precision
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" = ''
  AS $$
    SELECT LEAST(20015.0, GREATEST(50.0, sqrt(
             power((max(lat) - min(lat)) * 111.32, 2) +
             power((max(lng) - min(lng)) * 111.32
                   * cos(radians((max(lat) + min(lat)) / 2)), 2)
           )))
    FROM public.pool_locations
    WHERE p_countries IS NULL OR country = ANY(p_countries);
  $$;
ALTER FUNCTION "public"."region_diagonal_km"("p_countries" "text"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."region_diagonal_km"("p_countries" "text"[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."region_diagonal_km"("p_countries" "text"[]) TO "authenticated";

-- =====================================================================
-- 2. Carry the diagonal on the session + the result row (nullable; the trigger
--    falls back to the world diagonal if it's ever missing).
-- =====================================================================
ALTER TABLE "public"."classic_games"
  ADD COLUMN IF NOT EXISTS "diagonal_km" double precision;
ALTER TABLE "public"."game_results"
  ADD COLUMN IF NOT EXISTS "diagonal_km" double precision;

-- =====================================================================
-- 3. Additive scorer. Rebuilds each round from the canonical formula so the
--    client can't influence anything but its guess coordinates.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."resolve_game_result"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  r jsonb;
  idx int := 0;
  glat double precision;
  glng double precision;
  d double precision;
  pts int;
  total int := 0;
  rebuilt jsonb := '[]'::jsonb;
  diag double precision;
  threshold double precision;
BEGIN
  -- Only classic is scored here. Duel resolves in duel_guesses.
  IF NEW.mode IS DISTINCT FROM 'classic' THEN
    RETURN NEW;
  END IF;

  IF NEW.rounds IS NULL OR jsonb_typeof(NEW.rounds) <> 'array' THEN
    RAISE EXCEPTION 'rounds must be a JSON array';
  END IF;

  diag := COALESCE(NEW.diagonal_km, 20015.0);
  threshold := GREATEST(0.025, diag / 100000.0);  -- ~25 m floor for a perfect

  FOR r IN SELECT * FROM jsonb_array_elements(NEW.rounds)
  LOOP
    glat := (r ->> 'guessLat')::double precision;
    glng := (r ->> 'guessLng')::double precision;

    d := public.haversine_km(
      (r ->> 'lat')::double precision,
      (r ->> 'lng')::double precision,
      glat,
      glng
    );

    -- roundScore: 5000·e^(−10d/D), snapping to a perfect inside the threshold.
    IF d <= threshold THEN
      pts := 5000;
    ELSE
      pts := GREATEST(0, round(5000 * exp(-10 * d / diag))::int);
    END IF;

    total := total + pts;

    rebuilt := rebuilt || jsonb_build_object(
      'lat', (r ->> 'lat')::double precision,
      'lng', (r ->> 'lng')::double precision,
      'guessLat', glat,
      'guessLng', glng,
      'distance', d,
      'points', pts
    );

    idx := idx + 1;
  END LOOP;

  NEW.rounds := rebuilt;
  NEW.rounds_played := idx;
  NEW.total_penalty := 0;   -- legacy columns, unused by additive scoring
  NEW.total_bonus := 0;
  NEW.game_over := false;    -- additive games can't end early
  NEW.score := total;        -- 0–25,000

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."resolve_game_result"() OWNER TO "postgres";

-- =====================================================================
-- 4. start_classic_game: also compute + store + return the region diagonal.
--    Signature changes (extra return column) so it must be dropped first.
-- =====================================================================
DROP FUNCTION IF EXISTS "public"."start_classic_game"("n" integer, "countries" "text"[]);

CREATE OR REPLACE FUNCTION "public"."start_classic_game"(
    "n" integer DEFAULT 5,
    "countries" "text"[] DEFAULT NULL
  )
  RETURNS TABLE("game_id" "uuid", "locations" "jsonb", "diagonal_km" double precision)
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  picked jsonb;
  new_id uuid;
  diag double precision;
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
    WHERE countries IS NULL OR country = ANY(countries)
    ORDER BY random()
    LIMIT n
  ) s;

  IF picked IS NULL OR jsonb_array_length(picked) < n THEN
    RAISE EXCEPTION 'not enough pool locations';
  END IF;

  diag := public.region_diagonal_km(countries);

  INSERT INTO public.classic_games (player_id, locations, diagonal_km)
  VALUES (auth.uid(), picked, diag)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id, picked, diag;
END;
$$;
ALTER FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[])
  OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[]) TO "authenticated";

-- =====================================================================
-- 5. submit_classic_game: carry the session's diagonal onto the result row so
--    the trigger scores against the same D the game was started with.
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

  INSERT INTO public.game_results
    (player_id, mode, score, game_over, rounds_played, total_penalty, total_bonus, rounds, diagonal_km)
  VALUES
    (auth.uid(), 'classic', 0, false, 0, 0, 0, built, g.diagonal_km)
  RETURNING score INTO result_score;

  UPDATE public.classic_games SET status = 'finished' WHERE id = p_game_id;

  RETURN result_score;
END;
$$;
ALTER FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."submit_classic_game"("p_game_id" "uuid", "p_guesses" "jsonb") TO "authenticated";

-- =====================================================================
-- 6. The old results were on the 10,000+bonus scale; mixing them with the new
--    0–25,000 scores would corrupt the leaderboard and stats. Clear them.
-- =====================================================================
DELETE FROM "public"."game_results" WHERE "mode" = 'classic';
