-- Clean up abandoned duels quickly. Before, delete_stale_duels only removed
-- duels older than 2h, and the cron ran every 30 min — so a duel both players
-- left lingered for a long time and kept showing up as resumable.
--
-- Now we use the per-player last_seen heartbeat: a waiting/playing duel where
-- NOBODY has been present for ~90s is deleted (cascades to its players /
-- guesses / invitations). The 2h absolute cap stays as a backstop. The cron is
-- moved to every minute so cleanup happens within a couple of minutes.

CREATE OR REPLACE FUNCTION "public"."delete_stale_duels"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  deleted int;
BEGIN
  WITH gone AS (
    DELETE FROM public.duels d
    WHERE d.status IN ('waiting', 'playing')
      AND (
        -- absolute backstop
        d.created_at < now() - interval '2 hours'
        -- or nobody has heartbeated recently (with a short grace from creation
        -- so a just-created duel isn't removed before its first heartbeat)
        OR (
          d.created_at < now() - interval '30 seconds'
          AND COALESCE(
            (SELECT max(dp.last_seen) FROM public.duel_players dp WHERE dp.duel_id = d.id),
            d.created_at
          ) < now() - interval '90 seconds'
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO deleted FROM gone;
  RETURN deleted;
END;
$$;

ALTER FUNCTION "public"."delete_stale_duels"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_stale_duels"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."delete_stale_duels"() TO "service_role";

-- Run the cleanup every minute (was every 30 min).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cron"."job" WHERE "jobname" = 'cleanup-stale-duels') THEN
    PERFORM "cron"."unschedule"('cleanup-stale-duels');
  END IF;
END;
$$;

SELECT "cron"."schedule"(
  'cleanup-stale-duels',
  '* * * * *',
  $$SELECT public.delete_stale_duels()$$
);
