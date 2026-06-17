-- Backfill the duel record + ELO rating from duels that finished BEFORE the
-- on_duel_finished trigger (20260609230000) was deployed.
--
-- That trigger only fires on the live UPDATE into 'finished', so every duel
-- already in 'finished' at deploy time never updated the counters/rating —
-- yet get_duel_history lists them all (it just reads status='finished').
-- Result: a player with many wins/losses shows 0W/1L. This replays the full
-- history once, in chronological order, with the SAME math the trigger uses,
-- so past and future stay consistent. Idempotent: it resets first, and only
-- counts finished 2-player duels, so re-running yields the same result.
DO $$
DECLARE
  d RECORD;
  p1_id uuid; p1_score int;
  p2_id uuid; p2_score int;
  ra int; rb int;
  ea double precision; sa double precision;
  k constant int := 32;
BEGIN
  -- Start from the defaults, then replay.
  UPDATE public.profiles
    SET duel_rating = 1000, duel_wins = 0, duel_losses = 0, duel_draws = 0;

  FOR d IN
    SELECT id FROM public.duels WHERE status = 'finished' ORDER BY created_at ASC
  LOOP
    -- Same deterministic pairing as the trigger.
    SELECT player_id, score INTO p1_id, p1_score
      FROM public.duel_players WHERE duel_id = d.id ORDER BY player_id LIMIT 1;
    SELECT player_id, score INTO p2_id, p2_score
      FROM public.duel_players WHERE duel_id = d.id ORDER BY player_id OFFSET 1 LIMIT 1;
    IF p1_id IS NULL OR p2_id IS NULL THEN
      CONTINUE;  -- solo/never-joined duel: skip, like the trigger does
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
  END LOOP;
END $$;
