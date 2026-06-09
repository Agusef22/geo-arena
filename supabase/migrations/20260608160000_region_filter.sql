-- Region filter: let a game be scoped to a set of countries (e.g. a continent),
-- using the pool's `country` column. Adds an optional `countries text[]` to the
-- location-picking functions; NULL/empty means the whole world (unchanged
-- behavior). The filter only narrows which pool rows are eligible — the server
-- still picks, stores and scores them, so classic stays server-authoritative.
--
-- Both functions are dropped and recreated to add the parameter (CREATE OR
-- REPLACE can't change the signature). search_path is pinned for both.

-- ---------------------------------------------------------------------
-- get_random_locations: used by anonymous classic and by duels.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."get_random_locations"("n" integer);

CREATE OR REPLACE FUNCTION "public"."get_random_locations"(
    "n" integer,
    "countries" "text"[] DEFAULT NULL
  )
  RETURNS SETOF "public"."pool_locations"
  LANGUAGE "sql" STABLE
  SET "search_path" = ''
  AS $$
    SELECT *
    FROM public.pool_locations
    WHERE countries IS NULL OR country = ANY(countries)
    ORDER BY random()
    LIMIT n;
  $$;

ALTER FUNCTION "public"."get_random_locations"("n" integer, "countries" "text"[])
  OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer, "countries" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer, "countries" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer, "countries" "text"[]) TO "service_role";

-- ---------------------------------------------------------------------
-- start_classic_game: server-authoritative session for logged-in players.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."start_classic_game"("n" integer);

CREATE OR REPLACE FUNCTION "public"."start_classic_game"(
    "n" integer DEFAULT 5,
    "countries" "text"[] DEFAULT NULL
  )
  RETURNS TABLE("game_id" "uuid", "locations" "jsonb")
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" = ''
  AS $$
DECLARE
  picked jsonb;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF n < 1 OR n > 20 THEN
    RAISE EXCEPTION 'invalid round count';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'lat', s.lat, 'lng', s.lng, 'pano', s.pano_id, 'heading', s.heading
         ))
  INTO picked
  FROM (
    SELECT lat, lng, pano_id, heading
    FROM public.pool_locations
    WHERE countries IS NULL OR country = ANY(countries)
    ORDER BY random()
    LIMIT n
  ) s;

  IF picked IS NULL OR jsonb_array_length(picked) < n THEN
    RAISE EXCEPTION 'not enough pool locations';
  END IF;

  INSERT INTO public.classic_games (player_id, locations)
  VALUES (auth.uid(), picked)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id, picked;
END;
$$;

ALTER FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[])
  OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."start_classic_game"("n" integer, "countries" "text"[]) TO "authenticated";
