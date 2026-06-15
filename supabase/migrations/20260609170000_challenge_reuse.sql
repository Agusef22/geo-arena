-- Fix duel tangles: challenging a friend used to ALWAYS create a new duel +
-- invite, so repeated challenges (or challenging while a previous duel between
-- the two was still active) piled up duplicate duels and invitations, and the
-- "resume" picker got ambiguous.
--
-- Now challenge_friend reuses an existing active duel between the two players
-- (or a still-pending challenge to them) instead of creating a new one, and
-- cleans up the caller's own never-started empty waiting rooms. get_active_duel
-- now prefers an in-progress game over a waiting room.

CREATE OR REPLACE FUNCTION "public"."challenge_friend"("p_friend_id" "uuid")
  RETURNS TABLE("duel_code" "text", "invite_id" "uuid")
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_duel uuid;
  v_invite uuid;
  v_attempt int := 0;
  i int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_friend_id = caller THEN
    RAISE EXCEPTION 'cannot challenge yourself';
  END IF;
  IF NOT public.are_friends(caller, p_friend_id) THEN
    RAISE EXCEPTION 'not friends';
  END IF;

  -- 1. Already in an active duel together? Reuse it (no new duel, no new invite).
  SELECT d.code INTO v_code
  FROM public.duels d
  JOIN public.duel_players dp1 ON dp1.duel_id = d.id AND dp1.player_id = caller
  JOIN public.duel_players dp2 ON dp2.duel_id = d.id AND dp2.player_id = p_friend_id
  WHERE d.status IN ('waiting', 'playing')
  ORDER BY d.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_code, NULL::uuid;
    RETURN;
  END IF;

  -- 2. A waiting room I host with a still-pending invite to this friend? Reuse.
  SELECT d.code, di.id INTO v_code, v_invite
  FROM public.duels d
  JOIN public.duel_players dp ON dp.duel_id = d.id AND dp.player_id = caller AND dp.is_host
  JOIN public.duel_invitations di ON di.duel_id = d.id
    AND di.invitee = p_friend_id AND di.status = 'pending'
  WHERE d.status = 'waiting'
  ORDER BY d.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_code, v_invite;
    RETURN;
  END IF;

  -- 3. Clean up my own never-started, empty waiting rooms so they don't pile up
  --    (cascades to their duel_players / duel_invitations).
  DELETE FROM public.duels d
  WHERE d.status = 'waiting'
    AND EXISTS (
      SELECT 1 FROM public.duel_players dp
      WHERE dp.duel_id = d.id AND dp.player_id = caller AND dp.is_host
    )
    AND (SELECT count(*) FROM public.duel_players dp WHERE dp.duel_id = d.id) = 1;

  -- 4. Rate limit (RLS policy is bypassed for the table owner; re-enforce here).
  IF (
    SELECT count(*) FROM public.duels d
    JOIN public.duel_players dp ON dp.duel_id = d.id
    WHERE dp.player_id = caller
      AND d.status IN ('waiting', 'playing')
      AND d.created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'too many active duels, try again later';
  END IF;

  -- 5. Create a fresh duel + invite.
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not allocate a duel code';
    END IF;
    v_code := '';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.duels (code, status) VALUES (v_code, 'waiting')
      RETURNING id INTO v_duel;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- retry
    END;
  END LOOP;

  INSERT INTO public.duel_players (duel_id, player_id, score, is_host)
  VALUES (v_duel, caller, 5000, true);

  INSERT INTO public.duel_invitations (duel_id, inviter, invitee, status)
  VALUES (v_duel, caller, p_friend_id, 'pending')
  RETURNING id INTO v_invite;

  RETURN QUERY SELECT v_code, v_invite;
END;
$$;

-- Prefer an in-progress game over a waiting room when resuming.
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
    ORDER BY (d.status = 'playing') DESC, d.created_at DESC
    LIMIT 1;
  $$;
