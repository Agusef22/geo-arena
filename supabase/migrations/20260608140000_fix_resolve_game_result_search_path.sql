-- Fix: resolve_game_result must pin its own search_path and schema-qualify
-- haversine_km.
--
-- The trigger fires on INSERT into game_results. That insert now happens INSIDE
-- submit_classic_game, which runs with `SET search_path = ''`. A trigger
-- function without its own search_path inherits the caller's — so the trigger
-- ran with an empty path and its UNQUALIFIED `haversine_km()` call failed to
-- resolve (haversine_km lives in public, not pg_catalog), breaking every
-- logged-in classic submit. (Before the server-session refactor the insert came
-- straight from the client with the default search_path, so it resolved.)
--
-- Setting `search_path = ''` and qualifying public.haversine_km makes it
-- deterministic and matches the hardening of the other SECURITY DEFINER
-- functions. jsonb_*/exp/round are in pg_catalog (always in scope), so only
-- haversine_km needed qualifying.

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
    d := public.haversine_km(
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
