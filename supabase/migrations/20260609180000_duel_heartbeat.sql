-- Auto-end an abandoned duel: if a player leaves the duel page (navigates home,
-- closes the tab) their heartbeat stops, and after ~15s the still-present player
-- wins and the duel ends — no manual "claim" needed.
--
-- Abuse-resistant: each player can only refresh THEIR OWN last_seen (via the
-- heartbeat RPC, which writes auth.uid()'s row). claim_abandoned_duel checks the
-- OPPONENT's last_seen against the server clock, so a present player can't fake
-- the opponent being gone. last_seen is not client-writable directly
-- (duel_players UPDATE is denied by the "No direct score updates" policy); only
-- these SECURITY DEFINER functions touch it.

ALTER TABLE "public"."duel_players"
  ADD COLUMN IF NOT EXISTS "last_seen" timestamp with time zone NOT NULL DEFAULT "now"();

-- Refresh my own presence in a duel. Called every few seconds by the client.
CREATE OR REPLACE FUNCTION "public"."duel_heartbeat"("p_duel_id" "uuid")
  RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  UPDATE public.duel_players
  SET last_seen = now()
  WHERE duel_id = p_duel_id AND player_id = auth.uid();
END;
$$;
ALTER FUNCTION "public"."duel_heartbeat"("p_duel_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."duel_heartbeat"("p_duel_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."duel_heartbeat"("p_duel_id" "uuid") TO "authenticated";

-- End the duel in the caller's favor if the opponent's heartbeat is stale
-- (gone for more than 15s). Returns true if the duel was claimed.
CREATE OR REPLACE FUNCTION "public"."claim_abandoned_duel"("p_duel_id" "uuid")
  RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  opp public.duel_players;
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

  -- Only an in-progress duel can be abandoned.
  PERFORM 1 FROM public.duels WHERE id = p_duel_id AND status = 'playing' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO opp
  FROM public.duel_players
  WHERE duel_id = p_duel_id AND player_id <> caller
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Opponent still present (heartbeat fresh) → not abandoned.
  IF opp.last_seen > now() - interval '15 seconds' THEN
    RETURN false;
  END IF;

  UPDATE public.duel_players SET score = 0
  WHERE duel_id = p_duel_id AND player_id = opp.player_id;
  UPDATE public.duels SET status = 'finished' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
ALTER FUNCTION "public"."claim_abandoned_duel"("p_duel_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."claim_abandoned_duel"("p_duel_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."claim_abandoned_duel"("p_duel_id" "uuid") TO "authenticated";
