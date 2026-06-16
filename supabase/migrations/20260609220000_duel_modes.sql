-- Duel game modes: the host picks Timed / No Move / a region when creating the
-- duel; both players read these and apply them. Settings are fixed at creation
-- and frozen afterwards (a participant can't flip No Move mid-game to cheat).

ALTER TABLE "public"."duels"
  ADD COLUMN IF NOT EXISTS "timed" boolean NOT NULL DEFAULT false;
ALTER TABLE "public"."duels"
  ADD COLUMN IF NOT EXISTS "no_move" boolean NOT NULL DEFAULT false;
ALTER TABLE "public"."duels"
  ADD COLUMN IF NOT EXISTS "countries" "text"[];

-- Freeze the settings (and harden: pin search_path + qualify duel_players).
CREATE OR REPLACE FUNCTION "public"."protect_duel_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_host boolean;
BEGIN
  IF NEW.locations IS DISTINCT FROM OLD.locations THEN
    IF OLD.locations IS NOT NULL THEN
      RAISE EXCEPTION 'locations cannot be changed once set';
    END IF;

    SELECT dp.is_host INTO caller_is_host
    FROM public.duel_players dp
    WHERE dp.duel_id = NEW.id AND dp.player_id = caller;

    IF NOT COALESCE(caller_is_host, false) THEN
      RAISE EXCEPTION 'only the host can set duel locations';
    END IF;
  END IF;

  -- Game settings are fixed at creation; never editable afterwards.
  IF NEW.timed IS DISTINCT FROM OLD.timed
     OR NEW.no_move IS DISTINCT FROM OLD.no_move
     OR NEW.countries IS DISTINCT FROM OLD.countries THEN
    RAISE EXCEPTION 'duel settings cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;
