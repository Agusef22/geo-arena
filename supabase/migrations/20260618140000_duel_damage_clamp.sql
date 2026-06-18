-- Fix: the killing blow recorded MORE damage than the HP actually removed.
-- HP was floored at GREATEST(0, score - damage), but the loser's guess row
-- stored the full uncapped `damage`, so the result screen showed e.g. "-800 dmg"
-- when the opponent only had 200 HP left. Clamp the recorded damage to the HP
-- actually removed so the displayed number matches the HP bar.
CREATE OR REPLACE FUNCTION "public"."resolve_duel_guess"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  loc jsonb;
  locs jsonb;
  diag double precision;
  actual_lat double precision;
  actual_lng double precision;
  real_distance double precision;
  other_guess RECORD;
  my_pts int;
  opp_pts int;
  winner_id uuid;
  loser_id uuid;
  winner_mult double precision;
  loser_hp int;
  damage int;
BEGIN
  -- FOR UPDATE serializes concurrent inserts on the same duel.
  SELECT locations, diagonal_km INTO locs, diag
  FROM public.duels WHERE id = NEW.duel_id FOR UPDATE;

  IF locs IS NULL OR jsonb_array_length(locs) <= NEW.round THEN
    RAISE EXCEPTION 'Invalid round or no locations';
  END IF;

  loc := locs -> NEW.round;
  actual_lat := (loc ->> 'lat')::double precision;
  actual_lng := (loc ->> 'lng')::double precision;

  real_distance := public.haversine_km(actual_lat, actual_lng, NEW.guess_lat, NEW.guess_lng);
  NEW.distance_km := real_distance;
  NEW.penalty := 0;

  SELECT * INTO other_guess
  FROM public.duel_guesses
  WHERE duel_id = NEW.duel_id
    AND round = NEW.round
    AND player_id != NEW.player_id;

  IF FOUND THEN
    diag := COALESCE(diag, 20015.0);
    my_pts := public.round_score(real_distance, diag);
    opp_pts := public.round_score(other_guess.distance_km, diag);

    -- Equal round scores → no damage, no multiplier change.
    IF my_pts <> opp_pts THEN
      IF my_pts > opp_pts THEN
        winner_id := NEW.player_id;
        loser_id := other_guess.player_id;
      ELSE
        winner_id := other_guess.player_id;
        loser_id := NEW.player_id;
      END IF;

      SELECT multiplier INTO winner_mult
      FROM public.duel_players
      WHERE duel_id = NEW.duel_id AND player_id = winner_id;
      winner_mult := COALESCE(winner_mult, 1);

      damage := round(abs(my_pts - opp_pts) * winner_mult)::int;

      -- Clamp the damage to the HP the loser actually has, so the recorded
      -- value (shown as "-X dmg") never exceeds the HP bar's drop on a KO.
      SELECT score INTO loser_hp
      FROM public.duel_players
      WHERE duel_id = NEW.duel_id AND player_id = loser_id;
      damage := LEAST(damage, GREATEST(0, COALESCE(loser_hp, 0)));

      -- Damage off the loser's HP.
      UPDATE public.duel_players
      SET score = GREATEST(0, score - damage)
      WHERE duel_id = NEW.duel_id AND player_id = loser_id;

      -- Winning the round escalates your multiplier for the rounds to come.
      UPDATE public.duel_players
      SET multiplier = multiplier + 0.5
      WHERE duel_id = NEW.duel_id AND player_id = winner_id;

      -- Record the damage on the loser's guess (winner stays 0).
      IF loser_id = NEW.player_id THEN
        NEW.penalty := damage;
      ELSE
        UPDATE public.duel_guesses
        SET penalty = damage
        WHERE duel_id = NEW.duel_id
          AND round = NEW.round
          AND player_id = other_guess.player_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
