-- Fix: the abandoned-duel auto-claim was firing after only 15s of stale
-- heartbeat, run every 5s by the client in EVERY in-room phase. A brief network
-- blip or a mobile tab-backgrounding longer than 15s handed the present player
-- the win and zeroed the absent player's HP — duels were ending on transient
-- drops. Raise the staleness window to 60s, matching forfeit_duel and the
-- client's 65s manual claim button. (The client also now only attempts the
-- claim during the active guessing phases — see DuelGame.tsx.)
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

  -- Opponent still present (heartbeat fresh within 60s) → not abandoned.
  IF opp.last_seen > now() - interval '60 seconds' THEN
    RETURN false;
  END IF;

  UPDATE public.duel_players SET score = 0
  WHERE duel_id = p_duel_id AND player_id = opp.player_id;
  UPDATE public.duels SET status = 'finished' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
