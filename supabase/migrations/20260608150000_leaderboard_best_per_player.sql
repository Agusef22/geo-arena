-- Leaderboard: one row per player (their best classic game), instead of one
-- row per game. Before, getLeaderboard selected the top game_results by score,
-- so a single strong player could occupy several leaderboard slots. This RPC
-- collapses to each player's best non-game-over classic score.
--
-- SECURITY INVOKER (default): it only reads game_results and profiles, both of
-- which are already publicly selectable, so it runs with the caller's rights
-- under RLS. search_path is pinned and all objects are schema-qualified.

CREATE OR REPLACE FUNCTION "public"."get_leaderboard"("lim" integer DEFAULT 10)
  RETURNS TABLE(
    "nickname" "text",
    "emoji" "text",
    "score" integer,
    "created_at" timestamp with time zone
  )
  LANGUAGE "sql" STABLE
  SET "search_path" = ''
  AS $$
    SELECT p.nickname, p.emoji, best.score, best.created_at
    FROM (
      -- Best (highest-scoring, earliest on ties) completed classic game per player.
      SELECT DISTINCT ON (gr.player_id)
        gr.player_id, gr.score, gr.created_at
      FROM public.game_results gr
      WHERE gr.mode = 'classic' AND gr.game_over = false
      ORDER BY gr.player_id, gr.score DESC, gr.created_at ASC
    ) best
    JOIN public.profiles p ON p.id = best.player_id
    ORDER BY best.score DESC, best.created_at ASC
    LIMIT GREATEST(1, LEAST(lim, 100));
  $$;

ALTER FUNCTION "public"."get_leaderboard"("lim" integer) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_leaderboard"("lim" integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_leaderboard"("lim" integer) TO "authenticated";
