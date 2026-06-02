-- Security & integrity fixes
-- See analysis: race condition in duel resolution, client-trusted classic
-- scoring, mutable duel locations, and stale-duel cleanup.

-- =====================================================================
-- Fix #1: Serialize duel guess resolution.
-- resolve_duel_guess() runs BEFORE INSERT and decides the round by reading
-- the opponent's guess. Two near-simultaneous inserts (READ COMMITTED) could
-- each fail to see the other -> round never scored. Locking the duel row with
-- FOR UPDATE forces concurrent inserts on the same duel to serialize, so the
-- second insert always sees the first's committed guess.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."resolve_duel_guess"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
  -- 1. Obtener las locations del duel.
  --    FOR UPDATE bloquea la fila del duel: dos inserts concurrentes en el
  --    mismo duel se serializan y el segundo ve el guess del primero.
  SELECT locations INTO locs FROM duels WHERE id = NEW.duel_id FOR UPDATE;

  IF locs IS NULL OR jsonb_array_length(locs) <= NEW.round THEN
    RAISE EXCEPTION 'Invalid round or no locations';
  END IF;

  -- 2. Obtener la ubicación real de esta ronda
  loc := locs -> NEW.round;
  actual_lat := (loc ->> 'lat')::double precision;
  actual_lng := (loc ->> 'lng')::double precision;

  -- 3. Recalcular la distancia real
  real_distance := haversine_km(actual_lat, actual_lng, NEW.guess_lat, NEW.guess_lng);
  NEW.distance_km := real_distance;
  NEW.penalty := 0;

  -- 4. Verificar si el oponente ya hizo guess en esta ronda
  SELECT * INTO other_guess
  FROM duel_guesses
  WHERE duel_id = NEW.duel_id
    AND round = NEW.round
    AND player_id != NEW.player_id;

  -- 5. Si ambos guesses existen, resolver la ronda
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
        UPDATE duel_guesses
        SET penalty = calc_penalty
        WHERE duel_id = NEW.duel_id
          AND round = NEW.round
          AND player_id = other_guess.player_id;
        loser_id := other_guess.player_id;
      END IF;

      -- Actualizar score del perdedor
      UPDATE duel_players
      SET score = GREATEST(0, score - calc_penalty)
      WHERE duel_id = NEW.duel_id
        AND player_id = loser_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- =====================================================================
-- Fix #3: Server-authoritative classic scoring.
-- Classic mode computed score on the client and inserted it directly, so the
-- leaderboard was trivially spoofable. This trigger recomputes score,
-- total_penalty, total_bonus, rounds_played and game_over from the submitted
-- `rounds` array using the canonical formulas (mirrors src/lib/game.ts), so
-- those columns can no longer be forged independently of the rounds.
--
-- Residual (documented): the round lat/lng + guess are still client-provided,
-- so a determined cheater could fabricate rounds with guess == actual. Fully
-- closing that requires server-stored locations (same model as duel) — future
-- work. This closes the trivial "POST score: 999999" hole and enforces that
-- the score is consistent with the rounds.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."resolve_game_result"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r jsonb;
  idx int := 0;
  d double precision;
  ratio double precision;
  max_pen int;
  pen int;
  bon int;
  total_pen int := 0;
  total_bon int := 0;
  final_score int;
  round_max int[] := ARRAY[2500, 3000, 3500, 4000, 5000]; -- ROUND_MAX_PENALTY
  starting int := 10000;                                  -- STARTING_SCORE
BEGIN
  -- Solo el modo classic se recalcula acá. Duel se resuelve en duel_guesses.
  IF NEW.mode IS DISTINCT FROM 'classic' THEN
    RETURN NEW;
  END IF;

  IF NEW.rounds IS NULL OR jsonb_typeof(NEW.rounds) <> 'array' THEN
    RAISE EXCEPTION 'rounds must be a JSON array';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(NEW.rounds)
  LOOP
    -- distancia real (haversine) entre ubicación y guess
    d := haversine_km(
      (r ->> 'lat')::double precision,
      (r ->> 'lng')::double precision,
      (r ->> 'guessLat')::double precision,
      (r ->> 'guessLng')::double precision
    );

    -- distanceToPenaltyRatio
    IF d < 0.15 THEN
      ratio := 0;
    ELSE
      ratio := LEAST(1, 1 - exp(-d / 1500.0));
    END IF;

    -- getRoundMaxPenalty(round) — array es 1-indexed en PG
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
    idx := idx + 1;
  END LOOP;

  final_score := starting - total_pen + total_bon;

  NEW.rounds_played := idx;
  NEW.total_penalty := total_pen;
  NEW.total_bonus := total_bon;
  NEW.game_over := final_score <= 0;
  NEW.score := GREATEST(0, final_score);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."resolve_game_result"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_resolve_game_result" ON "public"."game_results";
CREATE TRIGGER "trg_resolve_game_result"
  BEFORE INSERT ON "public"."game_results"
  FOR EACH ROW EXECUTE FUNCTION "public"."resolve_game_result"();


-- =====================================================================
-- Fix #4: Duel locations are immutable and host-only.
-- The "Participants can update duels" policy let either player overwrite
-- `locations` mid-game (cheating the shared map). This trigger enforces:
--   - locations may only be set by the host, and
--   - locations are immutable once set.
-- `status` stays updatable by participants (needed to mark a duel finished).
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."protect_duel_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_host boolean;
BEGIN
  IF NEW.locations IS DISTINCT FROM OLD.locations THEN
    -- inmutable una vez seteado
    IF OLD.locations IS NOT NULL THEN
      RAISE EXCEPTION 'locations cannot be changed once set';
    END IF;

    -- solo el host puede setear locations
    SELECT dp.is_host INTO caller_is_host
    FROM duel_players dp
    WHERE dp.duel_id = NEW.id AND dp.player_id = caller;

    IF NOT COALESCE(caller_is_host, false) THEN
      RAISE EXCEPTION 'only the host can set duel locations';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."protect_duel_columns"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_protect_duel_columns" ON "public"."duels";
CREATE TRIGGER "trg_protect_duel_columns"
  BEFORE UPDATE ON "public"."duels"
  FOR EACH ROW EXECUTE FUNCTION "public"."protect_duel_columns"();


-- =====================================================================
-- Fix #7: Stale duel cleanup.
-- Abandoned 'waiting'/'playing' duels accumulate and count against the
-- 5-per-hour creation rate limit. This function deletes them (cascades to
-- duel_players / duel_guesses). Restricted to service_role; schedule it with
-- pg_cron once enabled, e.g.:
--   select cron.schedule('cleanup-stale-duels','*/30 * * * *',
--     $$select public.delete_stale_duels()$$);
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."delete_stale_duels"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted int;
BEGIN
  WITH gone AS (
    DELETE FROM duels
    WHERE status IN ('waiting', 'playing')
      AND created_at < now() - interval '2 hours'
    RETURNING 1
  )
  SELECT count(*) INTO deleted FROM gone;
  RETURN deleted;
END;
$$;

ALTER FUNCTION "public"."delete_stale_duels"() OWNER TO "postgres";

-- Destructiva: que NO la puedan llamar usuarios normales, solo service_role.
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."delete_stale_duels"() TO "service_role";
