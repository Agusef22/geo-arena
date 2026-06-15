-- Duel invitations: let a player challenge an online friend to a duel. The
-- inviter creates a duel + invitation in one step ("challenge"), or invites a
-- friend into a duel they already host. The invitee gets a realtime in-app
-- notification and accepts (joins + navigates) or declines.
--
-- Security: only friends can be invited, only the host can invite, and only the
-- invitee can accept — all enforced in SECURITY DEFINER RPCs. RLS is
-- deny-by-default: clients may only SELECT invites they're part of; there is no
-- client INSERT/UPDATE policy, so the table is written exclusively by the RPCs.

CREATE TABLE IF NOT EXISTS "public"."duel_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "duel_id" "uuid" NOT NULL,
    "inviter" "uuid" NOT NULL,
    "invitee" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duel_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "duel_invitations_duel_id_fkey" FOREIGN KEY ("duel_id")
      REFERENCES "public"."duels"("id") ON DELETE CASCADE,
    CONSTRAINT "duel_invitations_inviter_fkey" FOREIGN KEY ("inviter")
      REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "duel_invitations_invitee_fkey" FOREIGN KEY ("invitee")
      REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "duel_invitations_status_check"
      CHECK ("status" IN ('pending', 'accepted', 'declined', 'cancelled')),
    CONSTRAINT "duel_invitations_no_self" CHECK ("inviter" <> "invitee"),
    CONSTRAINT "duel_invitations_unique_open" UNIQUE ("duel_id", "invitee")
);

ALTER TABLE "public"."duel_invitations" OWNER TO "postgres";
ALTER TABLE "public"."duel_invitations" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "duel_invitations_invitee_pending_idx"
  ON "public"."duel_invitations" USING "btree" ("invitee")
  WHERE ("status" = 'pending');

CREATE POLICY "Read own invitations" ON "public"."duel_invitations"
  FOR SELECT TO "authenticated"
  USING ("inviter" = "auth"."uid"() OR "invitee" = "auth"."uid"());

GRANT SELECT ON TABLE "public"."duel_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."duel_invitations" TO "service_role";

-- Live delivery of incoming invites (RLS-respecting: only your own rows).
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."duel_invitations";

-- Shared helper: is (a,b) an accepted friendship? (canonical ordered pair)
CREATE OR REPLACE FUNCTION "public"."are_friends"("a" "uuid", "b" "uuid")
  RETURNS boolean
  LANGUAGE "sql" STABLE
  SET "search_path" = ''
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.friendships
      WHERE user_low = LEAST(a, b) AND user_high = GREATEST(a, b)
        AND status = 'accepted'
    );
  $$;
ALTER FUNCTION "public"."are_friends"("a" "uuid", "b" "uuid") OWNER TO "postgres";

-- =====================================================================
-- challenge_friend(friend): create a fresh waiting duel hosted by the caller
-- and a pending invite to the friend. The "1-click challenge".
-- =====================================================================
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

  -- Re-enforce the duel creation rate limit (the RLS policy is bypassed here
  -- because this runs as the table owner).
  IF (
    SELECT count(*) FROM public.duels d
    JOIN public.duel_players dp ON dp.duel_id = d.id
    WHERE dp.player_id = caller
      AND d.status IN ('waiting', 'playing')
      AND d.created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'too many active duels, try again later';
  END IF;

  -- Generate a unique 4-letter code (retry on collision).
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
      -- code already taken, loop again
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
ALTER FUNCTION "public"."challenge_friend"("p_friend_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."challenge_friend"("p_friend_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."challenge_friend"("p_friend_id" "uuid") TO "authenticated";

-- =====================================================================
-- invite_to_existing_duel(friend, duel): invite a friend into a duel the
-- caller already hosts (waiting room "Invite friends" panel).
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."invite_to_existing_duel"(
    "p_friend_id" "uuid",
    "p_duel_id" "uuid"
  )
  RETURNS "uuid"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  v_invite uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_friend_id = caller THEN
    RAISE EXCEPTION 'cannot invite yourself';
  END IF;
  IF NOT public.are_friends(caller, p_friend_id) THEN
    RAISE EXCEPTION 'not friends';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.duel_players
    WHERE duel_id = p_duel_id AND player_id = caller AND is_host
  ) THEN
    RAISE EXCEPTION 'only the host can invite';
  END IF;

  PERFORM 1 FROM public.duels WHERE id = p_duel_id AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duel not joinable';
  END IF;
  IF (SELECT count(*) FROM public.duel_players WHERE duel_id = p_duel_id) >= 2 THEN
    RAISE EXCEPTION 'duel is full';
  END IF;

  INSERT INTO public.duel_invitations (duel_id, inviter, invitee, status)
  VALUES (p_duel_id, caller, p_friend_id, 'pending')
  ON CONFLICT (duel_id, invitee)
  DO UPDATE SET status = 'pending', inviter = caller, created_at = now()
  RETURNING id INTO v_invite;

  RETURN v_invite;
END;
$$;
ALTER FUNCTION "public"."invite_to_existing_duel"("p_friend_id" "uuid", "p_duel_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."invite_to_existing_duel"("p_friend_id" "uuid", "p_duel_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."invite_to_existing_duel"("p_friend_id" "uuid", "p_duel_id" "uuid") TO "authenticated";

-- =====================================================================
-- respond_duel_invite(invite, accept): the invitee accepts (joins the duel,
-- returns its code to navigate) or declines.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."respond_duel_invite"(
    "p_invite_id" "uuid",
    "p_accept" boolean
  )
  RETURNS "text"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  inv public.duel_invitations;
  v_code text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO inv FROM public.duel_invitations WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF inv.invitee <> caller THEN
    RAISE EXCEPTION 'not your invite';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite no longer pending';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.duel_invitations SET status = 'declined' WHERE id = p_invite_id;
    RETURN NULL;
  END IF;

  -- Accept: re-check the duel is still joinable under a lock.
  PERFORM 1 FROM public.duels WHERE id = inv.duel_id AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.duel_invitations SET status = 'cancelled' WHERE id = p_invite_id;
    RAISE EXCEPTION 'duel no longer available';
  END IF;
  IF (SELECT count(*) FROM public.duel_players WHERE duel_id = inv.duel_id) >= 2 THEN
    UPDATE public.duel_invitations SET status = 'cancelled' WHERE id = p_invite_id;
    RAISE EXCEPTION 'duel is full';
  END IF;

  INSERT INTO public.duel_players (duel_id, player_id, score, is_host)
  VALUES (inv.duel_id, caller, 5000, false)
  ON CONFLICT (duel_id, player_id) DO NOTHING;

  UPDATE public.duel_invitations SET status = 'accepted' WHERE id = p_invite_id;

  SELECT code INTO v_code FROM public.duels WHERE id = inv.duel_id;
  RETURN v_code;
END;
$$;
ALTER FUNCTION "public"."respond_duel_invite"("p_invite_id" "uuid", "p_accept" boolean) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."respond_duel_invite"("p_invite_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."respond_duel_invite"("p_invite_id" "uuid", "p_accept" boolean) TO "authenticated";
