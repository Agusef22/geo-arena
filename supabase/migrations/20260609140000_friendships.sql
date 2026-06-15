-- Friendships: mutual friend relationships with a request/accept flow.
--
-- Canonical single-row-per-pair model: endpoints are stored sorted
-- (user_low < user_high) so A->B and B->A collide on the unique constraint —
-- no "two rows out of sync" class of bug. `requester` records who initiated, so
-- only the OTHER party may accept. Decline / unfriend are both row deletion.
--
-- RLS is deny-by-default: you may SELECT/DELETE only rows you belong to. There
-- is NO client INSERT/UPDATE policy — creating and accepting go through the
-- SECURITY DEFINER RPCs below, which enforce nickname lookup, canonical
-- ordering, the requester invariant, and the "can't accept your own" rule.

CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_low" "uuid" NOT NULL,
    "user_high" "uuid" NOT NULL,
    "requester" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "friendships_user_low_fkey" FOREIGN KEY ("user_low")
      REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "friendships_user_high_fkey" FOREIGN KEY ("user_high")
      REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "friendships_requester_fkey" FOREIGN KEY ("requester")
      REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted')),
    CONSTRAINT "friendships_ordered" CHECK ("user_low" < "user_high"),
    CONSTRAINT "friendships_requester_member"
      CHECK ("requester" IN ("user_low", "user_high")),
    CONSTRAINT "friendships_unique_pair" UNIQUE ("user_low", "user_high")
);

ALTER TABLE "public"."friendships" OWNER TO "postgres";
ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;

-- "find my friends" can match on either endpoint; the unique index covers
-- user_low-leading lookups, this covers user_high.
CREATE INDEX IF NOT EXISTS "friendships_user_high_idx"
  ON "public"."friendships" USING "btree" ("user_high");

-- You can read and delete only relationships you're part of. No INSERT/UPDATE
-- policy → those operations are denied to clients and must use the RPCs.
CREATE POLICY "Read own friendships" ON "public"."friendships"
  FOR SELECT TO "authenticated"
  USING ("user_low" = "auth"."uid"() OR "user_high" = "auth"."uid"());

CREATE POLICY "Delete own friendships" ON "public"."friendships"
  FOR DELETE TO "authenticated"
  USING ("user_low" = "auth"."uid"() OR "user_high" = "auth"."uid"());

GRANT SELECT, DELETE ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";

-- =====================================================================
-- send_friend_request(nickname): look up a user by their unique nickname and
-- create (or auto-accept) a pending request.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_nickname" "text")
  RETURNS "uuid"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  target uuid;
  lo uuid;
  hi uuid;
  existing public.friendships;
  new_id uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT id INTO target FROM public.profiles WHERE nickname = p_nickname;
  IF target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  IF target = caller THEN
    RAISE EXCEPTION 'cannot add yourself';
  END IF;

  lo := LEAST(caller, target);
  hi := GREATEST(caller, target);

  SELECT * INTO existing
  FROM public.friendships
  WHERE user_low = lo AND user_high = hi
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status = 'accepted' THEN
      RAISE EXCEPTION 'already friends';
    END IF;
    -- A pending request exists.
    IF existing.requester = caller THEN
      RAISE EXCEPTION 'request already sent';
    ELSE
      -- The other person already requested me → accept it.
      UPDATE public.friendships
      SET status = 'accepted', updated_at = now()
      WHERE id = existing.id;
      RETURN existing.id;
    END IF;
  END IF;

  INSERT INTO public.friendships (user_low, user_high, requester, status)
  VALUES (lo, hi, caller, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

ALTER FUNCTION "public"."send_friend_request"("p_nickname" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."send_friend_request"("p_nickname" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."send_friend_request"("p_nickname" "text") TO "authenticated";

-- =====================================================================
-- respond_friend_request(id, accept): the addressee (not the requester) accepts
-- or declines a pending request.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public"."respond_friend_request"(
    "p_id" "uuid",
    "p_accept" boolean
  )
  RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  caller uuid := auth.uid();
  fr public.friendships;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO fr FROM public.friendships WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;
  IF fr.status <> 'pending' THEN
    RAISE EXCEPTION 'request not pending';
  END IF;
  IF caller <> fr.user_low AND caller <> fr.user_high THEN
    RAISE EXCEPTION 'not your request';
  END IF;
  IF caller = fr.requester THEN
    RAISE EXCEPTION 'cannot accept your own request';
  END IF;

  IF p_accept THEN
    UPDATE public.friendships
    SET status = 'accepted', updated_at = now()
    WHERE id = p_id;
  ELSE
    DELETE FROM public.friendships WHERE id = p_id;
  END IF;
END;
$$;

ALTER FUNCTION "public"."respond_friend_request"("p_id" "uuid", "p_accept" boolean) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."respond_friend_request"("p_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."respond_friend_request"("p_id" "uuid", "p_accept" boolean) TO "authenticated";
