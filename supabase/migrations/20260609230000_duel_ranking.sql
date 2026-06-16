-- Duel ranking: per-player win/loss/draw record + an ELO rating, updated
-- server-side whenever a duel transitions to 'finished'. Plus RPCs for a
-- player's duel history and a friends ranking.
--
-- The rating/record live on profiles (public-read, like the leaderboard). The
-- update runs in a SECURITY DEFINER AFTER UPDATE trigger keyed on the
-- 'finished' transition, so it applies exactly once no matter which path ends
-- the duel (normal finish, forfeit, abandonment, server auto-finish).

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "duel_rating" integer NOT NULL DEFAULT 1000;
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "duel_wins" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "duel_losses" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "duel_draws" integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION "public"."on_duel_finished"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  p1_id uuid; p1_score int;
  p2_id uuid; p2_score int;
  ra int; rb int;
  ea double precision; sa double precision;
  k constant int := 32;
BEGIN
  -- Only on the transition into 'finished'.
  IF OLD.status = 'finished' OR NEW.status <> 'finished' THEN
    RETURN NEW;
  END IF;

  -- Need exactly two players (deterministic order).
  SELECT player_id, score INTO p1_id, p1_score
  FROM public.duel_players WHERE duel_id = NEW.id ORDER BY player_id LIMIT 1;
  SELECT player_id, score INTO p2_id, p2_score
  FROM public.duel_players WHERE duel_id = NEW.id ORDER BY player_id OFFSET 1 LIMIT 1;
  IF p1_id IS NULL OR p2_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT duel_rating INTO ra FROM public.profiles WHERE id = p1_id;
  SELECT duel_rating INTO rb FROM public.profiles WHERE id = p2_id;

  -- Result from p1's perspective: 1 win, 0.5 draw, 0 loss.
  IF p1_score = p2_score THEN sa := 0.5;
  ELSIF p1_score > p2_score THEN sa := 1;
  ELSE sa := 0;
  END IF;

  ea := 1.0 / (1.0 + power(10, (rb - ra) / 400.0));

  UPDATE public.profiles SET duel_rating = ra + round(k * (sa - ea))::int WHERE id = p1_id;
  UPDATE public.profiles SET duel_rating = rb + round(k * ((1 - sa) - (1 - ea)))::int WHERE id = p2_id;

  IF sa = 1 THEN
    UPDATE public.profiles SET duel_wins = duel_wins + 1 WHERE id = p1_id;
    UPDATE public.profiles SET duel_losses = duel_losses + 1 WHERE id = p2_id;
  ELSIF sa = 0 THEN
    UPDATE public.profiles SET duel_losses = duel_losses + 1 WHERE id = p1_id;
    UPDATE public.profiles SET duel_wins = duel_wins + 1 WHERE id = p2_id;
  ELSE
    UPDATE public.profiles SET duel_draws = duel_draws + 1 WHERE id = p1_id;
    UPDATE public.profiles SET duel_draws = duel_draws + 1 WHERE id = p2_id;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."on_duel_finished"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_on_duel_finished" ON "public"."duels";
CREATE TRIGGER "trg_on_duel_finished"
  AFTER UPDATE ON "public"."duels"
  FOR EACH ROW EXECUTE FUNCTION "public"."on_duel_finished"();

-- A player's recent finished duels (with the opponent + outcome).
CREATE OR REPLACE FUNCTION "public"."get_duel_history"("p_limit" integer DEFAULT 20)
  RETURNS TABLE(
    "opponent_nickname" "text",
    "opponent_emoji" "text",
    "my_score" integer,
    "opponent_score" integer,
    "result" "text",
    "created_at" timestamp with time zone
  )
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" = ''
  AS $$
    SELECT
      op.nickname, op.emoji, me.score, opp.score,
      CASE
        WHEN me.score > opp.score THEN 'win'
        WHEN me.score < opp.score THEN 'loss'
        ELSE 'draw'
      END,
      d.created_at
    FROM public.duels d
    JOIN public.duel_players me ON me.duel_id = d.id AND me.player_id = auth.uid()
    JOIN public.duel_players opp ON opp.duel_id = d.id AND opp.player_id <> auth.uid()
    JOIN public.profiles op ON op.id = opp.player_id
    WHERE d.status = 'finished'
    ORDER BY d.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
  $$;
ALTER FUNCTION "public"."get_duel_history"("p_limit" integer) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_duel_history"("p_limit" integer) TO "authenticated";

-- Me + my friends, ranked by duel rating.
CREATE OR REPLACE FUNCTION "public"."get_friends_duel_ranking"()
  RETURNS TABLE(
    "id" "uuid",
    "nickname" "text",
    "emoji" "text",
    "rating" integer,
    "wins" integer,
    "losses" integer,
    "draws" integer,
    "is_me" boolean
  )
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" = ''
  AS $$
    WITH circle AS (
      SELECT auth.uid() AS uid
      UNION
      SELECT CASE WHEN f.user_low = auth.uid() THEN f.user_high ELSE f.user_low END
      FROM public.friendships f
      WHERE (f.user_low = auth.uid() OR f.user_high = auth.uid())
        AND f.status = 'accepted'
    )
    SELECT p.id, p.nickname, p.emoji, p.duel_rating, p.duel_wins,
           p.duel_losses, p.duel_draws, (p.id = auth.uid())
    FROM circle c
    JOIN public.profiles p ON p.id = c.uid
    ORDER BY p.duel_rating DESC, p.duel_wins DESC;
  $$;
ALTER FUNCTION "public"."get_friends_duel_ranking"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_friends_duel_ranking"() TO "authenticated";
