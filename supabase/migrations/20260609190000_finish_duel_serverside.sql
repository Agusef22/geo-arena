-- Finish a duel server-side. The duel's status -> 'finished' was only ever set
-- by the client (when a player clicked through to the summary). If both players
-- left on the last result screen, the duel stayed 'playing' with current_round
-- = 5, so get_active_duel kept offering it as "resume a game in progress" even
-- though it was over.
--
-- Now advance_current_round (which already runs after both guesses of a round)
-- also marks the duel finished once the last round is in or a player hit 0.
-- Also schema-qualified + search_path-pinned for consistency with the other
-- SECURITY DEFINER triggers.

CREATE OR REPLACE FUNCTION "public"."advance_current_round"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  guess_count int;
  min_score int;
BEGIN
  SELECT count(*) INTO guess_count
  FROM public.duel_guesses
  WHERE duel_id = NEW.duel_id AND round = NEW.round;

  IF guess_count >= 2 THEN
    UPDATE public.duels
    SET current_round = NEW.round + 1
    WHERE id = NEW.duel_id AND current_round <= NEW.round;

    -- End the game once the last round (DUEL_ROUNDS = 5) is done or a player
    -- has been knocked to 0, so a finished duel never lingers as 'playing'.
    SELECT min(score) INTO min_score
    FROM public.duel_players WHERE duel_id = NEW.duel_id;

    IF NEW.round + 1 >= 5 OR COALESCE(min_score, 1) <= 0 THEN
      UPDATE public.duels SET status = 'finished'
      WHERE id = NEW.duel_id AND status <> 'finished';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- One-time cleanup of duels that already finished their rounds (or had a
-- knocked-out player) but were left as 'playing'.
UPDATE "public"."duels" d
SET "status" = 'finished'
WHERE d."status" = 'playing'
  AND (
    d."current_round" >= 5
    OR EXISTS (
      SELECT 1 FROM "public"."duel_players" dp
      WHERE dp."duel_id" = d."id" AND dp."score" <= 0
    )
  );

-- Defensive guard: never offer a fully-played duel as resumable, even if its
-- status somehow lingers.
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
      AND d.current_round < 5
    ORDER BY (d.status = 'playing') DESC, d.created_at DESC
    LIMIT 1;
  $$;
