-- Resume an in-progress classic game across refresh / navigation.
--
-- Before: a classic game's state lived only in React. Guesses were submitted
-- once at the very end, and mounting /play always called start_classic_game —
-- so a refresh orphaned the prior classic_games row (status='playing') and lost
-- all progress. Now each guess is persisted server-side as it's made, and the
-- client resumes the most recent in-progress game on mount.
--
-- Storing the real guesses here is NOT a scoring/cheat vector: scoring only
-- happens in submit_classic_game against the server's stored locations; these
-- rows are purely resume state.

ALTER TABLE "public"."classic_games"
  ADD COLUMN IF NOT EXISTS "guesses" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Append the guess for round p_round of an in-progress game. Idempotent and
-- ordered: only appends when p_round is exactly the next expected index, so a
-- double-fire / retry / out-of-order call is a harmless no-op.
CREATE OR REPLACE FUNCTION "public"."record_classic_guess"(
    "p_game_id" "uuid",
    "p_round" integer,
    "p_lat" double precision,
    "p_lng" double precision
  )
  RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  g RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO g FROM public.classic_games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;
  IF g.player_id <> auth.uid() THEN
    RAISE EXCEPTION 'not your game';
  END IF;
  IF g.status <> 'playing' THEN
    RETURN;
  END IF;

  -- Only the next expected guess, and never beyond the location count.
  IF p_round <> jsonb_array_length(g.guesses) THEN
    RETURN;
  END IF;
  IF p_round >= jsonb_array_length(g.locations) THEN
    RETURN;
  END IF;

  UPDATE public.classic_games
  SET guesses = guesses || jsonb_build_object('lat', p_lat, 'lng', p_lng)
  WHERE id = p_game_id;
END;
$$;
ALTER FUNCTION "public"."record_classic_guess"("p_game_id" "uuid", "p_round" integer, "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_classic_guess"("p_game_id" "uuid", "p_round" integer, "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."record_classic_guess"("p_game_id" "uuid", "p_round" integer, "p_lat" double precision, "p_lng" double precision) TO "authenticated";

-- Return the caller's most recent in-progress game (started within 12h) so the
-- client can resume it. NULL/empty when there's nothing to resume.
CREATE OR REPLACE FUNCTION "public"."resume_classic_game"()
  RETURNS TABLE("game_id" "uuid", "locations" "jsonb", "diagonal_km" double precision, "guesses" "jsonb")
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" = ''
  AS $$
    SELECT id, locations, diagonal_km, guesses
    FROM public.classic_games
    WHERE player_id = auth.uid()
      AND status = 'playing'
      AND created_at > now() - interval '12 hours'
    ORDER BY created_at DESC
    LIMIT 1;
  $$;
ALTER FUNCTION "public"."resume_classic_game"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."resume_classic_game"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resume_classic_game"() TO "authenticated";

-- Index to make the resume lookup cheap.
CREATE INDEX IF NOT EXISTS "classic_games_player_status_idx"
  ON "public"."classic_games" USING "btree" ("player_id", "status", "created_at" DESC);
