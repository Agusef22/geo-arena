-- Duel scoring → GeoGuessr Duels model: HP + damage + escalating multiplier,
-- region-aware.
--
-- Before: both start at 5,000 and the round loser loses points based on the raw
-- DISTANCE difference (fixed 800 km scale) — not region-aware, no multiplier,
-- and "both bad but close" dealt ~nothing.
--
-- After: both start at 6,000 HP. Each round both get a round score
-- (5000·e^(−10d/D), the same region-aware primitive as classic), and the lower
-- scorer takes damage = (winner_score − loser_score) × the WINNER's multiplier.
-- A player's multiplier starts at 1 and grows +0.5 every round they win, so
-- momentum compounds. A player knocked to 0 HP ends the duel (advance_current_
-- round already finishes on min(score) <= 0).

-- =====================================================================
-- 1. Shared round-score primitive (same formula as resolve_game_result).
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."round_score"(
    "p_distance" double precision,
    "p_diagonal" double precision
  )
  RETURNS integer
  LANGUAGE "sql" IMMUTABLE
  SET "search_path" = ''
  AS $$
    SELECT CASE
      WHEN p_distance <= GREATEST(0.025, COALESCE(p_diagonal, 20015.0) / 100000.0)
        THEN 5000
      ELSE GREATEST(0, round(5000 * exp(-10 * p_distance / COALESCE(p_diagonal, 20015.0)))::int)
    END;
  $$;
ALTER FUNCTION "public"."round_score"(double precision, double precision) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."round_score"(double precision, double precision) TO "authenticated";

-- =====================================================================
-- 2. New columns: the duel's region diagonal + each player's damage multiplier.
--    Bump the default HP to 6,000 (matches GeoGuessr; clients also send it).
-- =====================================================================
ALTER TABLE "public"."duels"
  ADD COLUMN IF NOT EXISTS "diagonal_km" double precision;
ALTER TABLE "public"."duel_players"
  ADD COLUMN IF NOT EXISTS "multiplier" double precision NOT NULL DEFAULT 1;
ALTER TABLE "public"."duel_players"
  ALTER COLUMN "score" SET DEFAULT 6000;

-- =====================================================================
-- 3. Compute the region diagonal SERVER-SIDE when the host first sets the
--    locations (clients can only update the locations column, so they can't
--    forge the scale). Extends the existing settings-freeze trigger.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."protect_duel_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_host boolean;
BEGIN
  IF NEW.locations IS DISTINCT FROM OLD.locations THEN
    IF OLD.locations IS NOT NULL THEN
      RAISE EXCEPTION 'locations cannot be changed once set';
    END IF;

    SELECT dp.is_host INTO caller_is_host
    FROM public.duel_players dp
    WHERE dp.duel_id = NEW.id AND dp.player_id = caller;

    IF NOT COALESCE(caller_is_host, false) THEN
      RAISE EXCEPTION 'only the host can set duel locations';
    END IF;

    -- Lock in the scoring scale for this duel from its (frozen) region.
    NEW.diagonal_km := public.region_diagonal_km(NEW.countries);
  END IF;

  -- Game settings are fixed at creation; never editable afterwards.
  IF NEW.timed IS DISTINCT FROM OLD.timed
     OR NEW.no_move IS DISTINCT FROM OLD.no_move
     OR NEW.countries IS DISTINCT FROM OLD.countries THEN
    RAISE EXCEPTION 'duel settings cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."protect_duel_columns"() OWNER TO "postgres";

-- =====================================================================
-- 4. The HP/damage/multiplier scorer. Runs BEFORE INSERT on each guess; the
--    second guess of a round resolves it.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."resolve_duel_guess"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  loc jsonb;
  locs jsonb;
  diag double precision;
  actual_lat double precision;
  actual_lng double precision;
  real_distance double precision;
  other_guess RECORD;
  my_pts int;
  opp_pts int;
  winner_id uuid;
  loser_id uuid;
  winner_mult double precision;
  damage int;
BEGIN
  -- FOR UPDATE serializes concurrent inserts on the same duel.
  SELECT locations, diagonal_km INTO locs, diag
  FROM public.duels WHERE id = NEW.duel_id FOR UPDATE;

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
    diag := COALESCE(diag, 20015.0);
    my_pts := public.round_score(real_distance, diag);
    opp_pts := public.round_score(other_guess.distance_km, diag);

    -- Equal round scores → no damage, no multiplier change.
    IF my_pts <> opp_pts THEN
      IF my_pts > opp_pts THEN
        winner_id := NEW.player_id;
        loser_id := other_guess.player_id;
      ELSE
        winner_id := other_guess.player_id;
        loser_id := NEW.player_id;
      END IF;

      SELECT multiplier INTO winner_mult
      FROM public.duel_players
      WHERE duel_id = NEW.duel_id AND player_id = winner_id;
      winner_mult := COALESCE(winner_mult, 1);

      damage := round(abs(my_pts - opp_pts) * winner_mult)::int;

      -- Damage off the loser's HP.
      UPDATE public.duel_players
      SET score = GREATEST(0, score - damage)
      WHERE duel_id = NEW.duel_id AND player_id = loser_id;

      -- Winning the round escalates your multiplier for the rounds to come.
      UPDATE public.duel_players
      SET multiplier = multiplier + 0.5
      WHERE duel_id = NEW.duel_id AND player_id = winner_id;

      -- Record the damage on the loser's guess (winner stays 0).
      IF loser_id = NEW.player_id THEN
        NEW.penalty := damage;
      ELSE
        UPDATE public.duel_guesses
        SET penalty = damage
        WHERE duel_id = NEW.duel_id
          AND round = NEW.round
          AND player_id = other_guess.player_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."resolve_duel_guess"() OWNER TO "postgres";
