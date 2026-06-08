-- Schedule the stale-duel cleanup (delete_stale_duels, defined in
-- 20260602120000). Abandoned 'waiting'/'playing' duels older than 2h pile up
-- and count against the 5-per-hour creation rate limit, so we sweep them on a
-- cron. Idempotent: safe to re-run.
--
-- pg_cron lives in the `postgres` database on Supabase and is pre-loaded; this
-- just enables the extension and (re)registers the job.

CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Drop a previous registration so re-applying this migration doesn't error or
-- create a duplicate schedule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cron"."job" WHERE "jobname" = 'cleanup-stale-duels') THEN
    PERFORM "cron"."unschedule"('cleanup-stale-duels');
  END IF;
END;
$$;

SELECT "cron"."schedule"(
  'cleanup-stale-duels',
  '*/30 * * * *',
  $$SELECT public.delete_stale_duels()$$
);
