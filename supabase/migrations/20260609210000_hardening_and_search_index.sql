-- Polish: harden the last SECURITY DEFINER trigger and speed up nickname search.
--
-- 1. resolve_duel_guess was the only SECURITY DEFINER function left without a
--    pinned search_path. It isn't currently exploitable (its INSERT comes from
--    the client with the default path, and `authenticated` can't create objects
--    in public), but for consistency with every other definer function we pin
--    search_path='' and schema-qualify all references (tables + haversine_km).
-- 2. A trigram index makes the friends search (ILIKE '%q%' on nickname) use an
--    index instead of a sequential scan as the user base grows.

CREATE OR REPLACE FUNCTION "public"."resolve_duel_guess"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  loc jsonb;
  locs jsonb;
  actual_lat double precision;
  actual_lng double precision;
  real_distance double precision;
  other_guess RECORD;
  my_dist double precision;
  opp_dist double precision;
  diff double precision;
  calc_penalty int;
  loser_id uuid;
BEGIN
  -- FOR UPDATE serializes concurrent inserts on the same duel.
  SELECT locations INTO locs FROM public.duels WHERE id = NEW.duel_id FOR UPDATE;

  IF locs IS NULL OR jsonb_array_length(locs) <= NEW.round THEN
    RAISE EXCEPTION 'Invalid round or no locations';
  END IF;

  loc := locs -> NEW.round;
  actual_lat := (loc ->> 'lat')::double precision;
  actual_lng := (loc ->> 'lng')::double precision;

  real_distance := public.haversine_km(actual_lat, actual_lng, NEW.guess_lat, NEW.guess_lng);
  NEW.distance_km := real_distance;
  NEW.penalty := 0;

  SELECT * INTO other_guess
  FROM public.duel_guesses
  WHERE duel_id = NEW.duel_id
    AND round = NEW.round
    AND player_id != NEW.player_id;

  IF FOUND THEN
    my_dist := real_distance;
    opp_dist := other_guess.distance_km;
    diff := abs(my_dist - opp_dist);

    IF diff < 5 THEN
      calc_penalty := 0;
    ELSE
      calc_penalty := LEAST(2500, round((1 - exp(-diff / 800.0)) * 2500)::int);

      IF my_dist > opp_dist THEN
        NEW.penalty := calc_penalty;
        loser_id := NEW.player_id;
      ELSE
        UPDATE public.duel_guesses
        SET penalty = calc_penalty
        WHERE duel_id = NEW.duel_id
          AND round = NEW.round
          AND player_id = other_guess.player_id;
        loser_id := other_guess.player_id;
      END IF;

      UPDATE public.duel_players
      SET score = GREATEST(0, score - calc_penalty)
      WHERE duel_id = NEW.duel_id
        AND player_id = loser_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Faster nickname search.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX IF NOT EXISTS "profiles_nickname_trgm_idx"
  ON "public"."profiles" USING "gin" ("nickname" "gin_trgm_ops");
