


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."advance_current_round"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  guess_count int;
BEGIN
  SELECT COUNT(*) INTO guess_count
  FROM duel_guesses
  WHERE duel_id = NEW.duel_id AND round = NEW.round;

  IF guess_count >= 2 THEN
    UPDATE duels 
    SET current_round = NEW.round + 1
    WHERE id = NEW.duel_id 
      AND current_round <= NEW.round;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."advance_current_round"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) RETURNS double precision
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  r double precision := 6371;
  dlat double precision;
  dlng double precision;
  a double precision;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)^2;
  RETURN r * 2 * asin(sqrt(a));
END;
$$;


ALTER FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_duel_guess"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  loc jsonb;
  locs jsonb;
  actual_lat double precision;
  actual_lng double precision;
  real_distance double precision;
  other_guess RECORD;
  my_dist double precision;
  opp_dist double precision;
  diff double precision;
  calc_penalty int;
  loser_id uuid;
BEGIN
  -- 1. Obtener las locations del duel
  SELECT locations INTO locs FROM duels WHERE id = NEW.duel_id;
  
  IF locs IS NULL OR jsonb_array_length(locs) <= NEW.round THEN
    RAISE EXCEPTION 'Invalid round or no locations';
  END IF;
  
  -- 2. Obtener la ubicación real de esta ronda
  loc := locs -> NEW.round;
  actual_lat := (loc ->> 'lat')::double precision;
  actual_lng := (loc ->> 'lng')::double precision;
  
  -- 3. Recalcular la distancia real
  real_distance := haversine_km(actual_lat, actual_lng, NEW.guess_lat, NEW.guess_lng);
  NEW.distance_km := real_distance;
  NEW.penalty := 0;
  
  -- 4. Verificar si el oponente ya hizo guess en esta ronda
  SELECT * INTO other_guess 
  FROM duel_guesses 
  WHERE duel_id = NEW.duel_id 
    AND round = NEW.round 
    AND player_id != NEW.player_id;
  
  -- 5. Si ambos guesses existen, resolver la ronda
  IF FOUND THEN
    my_dist := real_distance;
    opp_dist := other_guess.distance_km;
    diff := abs(my_dist - opp_dist);
    
    IF diff < 5 THEN
      calc_penalty := 0;
    ELSE
      calc_penalty := LEAST(2500, round((1 - exp(-diff / 800.0)) * 2500)::int);
      
      IF my_dist > opp_dist THEN
        NEW.penalty := calc_penalty;
        loser_id := NEW.player_id;
      ELSE
        UPDATE duel_guesses 
        SET penalty = calc_penalty
        WHERE duel_id = NEW.duel_id 
          AND round = NEW.round 
          AND player_id = other_guess.player_id;
        loser_id := other_guess.player_id;
      END IF;
      
      -- Actualizar score del perdedor
      UPDATE duel_players 
      SET score = GREATEST(0, score - calc_penalty)
      WHERE duel_id = NEW.duel_id 
        AND player_id = loser_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."resolve_duel_guess"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."duel_guesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "duel_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "guess_lat" double precision NOT NULL,
    "guess_lng" double precision NOT NULL,
    "distance_km" double precision DEFAULT 0 NOT NULL,
    "penalty" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_lat" CHECK ((("guess_lat" >= ('-90'::integer)::double precision) AND ("guess_lat" <= (90)::double precision))),
    CONSTRAINT "valid_lng" CHECK ((("guess_lng" >= ('-180'::integer)::double precision) AND ("guess_lng" <= (180)::double precision)))
);


ALTER TABLE "public"."duel_guesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duel_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "duel_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "score" integer DEFAULT 5000 NOT NULL,
    "is_host" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."duel_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "locations" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_round" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."duels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'classic'::"text" NOT NULL,
    "score" integer NOT NULL,
    "game_over" boolean DEFAULT false NOT NULL,
    "rounds_played" integer DEFAULT 5 NOT NULL,
    "total_penalty" integer DEFAULT 0 NOT NULL,
    "total_bonus" integer DEFAULT 0 NOT NULL,
    "rounds" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "emoji" "text" DEFAULT '🌍'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."duel_guesses"
    ADD CONSTRAINT "duel_guesses_duel_id_player_id_round_key" UNIQUE ("duel_id", "player_id", "round");



ALTER TABLE ONLY "public"."duel_guesses"
    ADD CONSTRAINT "duel_guesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duel_players"
    ADD CONSTRAINT "duel_players_duel_id_player_id_key" UNIQUE ("duel_id", "player_id");



ALTER TABLE ONLY "public"."duel_players"
    ADD CONSTRAINT "duel_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duels"
    ADD CONSTRAINT "duels_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."duels"
    ADD CONSTRAINT "duels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_nickname_unique" UNIQUE ("nickname");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duel_guesses"
    ADD CONSTRAINT "unique_guess_per_round" UNIQUE ("duel_id", "player_id", "round");



ALTER TABLE ONLY "public"."duel_players"
    ADD CONSTRAINT "unique_player_per_duel" UNIQUE ("duel_id", "player_id");



CREATE INDEX "duel_guesses_duel_id_round_idx" ON "public"."duel_guesses" USING "btree" ("duel_id", "round");



CREATE INDEX "duel_players_duel_id_idx" ON "public"."duel_players" USING "btree" ("duel_id");



CREATE INDEX "duel_players_player_id_idx" ON "public"."duel_players" USING "btree" ("player_id");



CREATE INDEX "duels_code_idx" ON "public"."duels" USING "btree" ("code");



CREATE INDEX "duels_status_idx" ON "public"."duels" USING "btree" ("status");



CREATE INDEX "game_results_mode_score_idx" ON "public"."game_results" USING "btree" ("mode", "score" DESC);



CREATE INDEX "game_results_player_id_idx" ON "public"."game_results" USING "btree" ("player_id");



CREATE INDEX "game_results_score_idx" ON "public"."game_results" USING "btree" ("score" DESC);



CREATE OR REPLACE TRIGGER "on_profile_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_advance_current_round" AFTER INSERT ON "public"."duel_guesses" FOR EACH ROW EXECUTE FUNCTION "public"."advance_current_round"();



CREATE OR REPLACE TRIGGER "trg_resolve_duel_guess" BEFORE INSERT ON "public"."duel_guesses" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_duel_guess"();



ALTER TABLE ONLY "public"."duel_guesses"
    ADD CONSTRAINT "duel_guesses_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "public"."duels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duel_guesses"
    ADD CONSTRAINT "duel_guesses_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duel_players"
    ADD CONSTRAINT "duel_players_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "public"."duels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duel_players"
    ADD CONSTRAINT "duel_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read duels" ON "public"."duels" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can read game results" ON "public"."game_results" FOR SELECT USING (true);



CREATE POLICY "Anyone can read profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Authenticated can create duels" ON "public"."duels" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert own results" ON "public"."game_results" FOR INSERT WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Can join as yourself" ON "public"."duel_players" FOR INSERT TO "authenticated" WITH CHECK (("player_id" = "auth"."uid"()));



CREATE POLICY "Can only insert own guesses in own duels" ON "public"."duel_guesses" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."duel_players"
  WHERE (("duel_players"."duel_id" = "duel_guesses"."duel_id") AND ("duel_players"."player_id" = "auth"."uid"()))))));



CREATE POLICY "Can read duel players" ON "public"."duel_players" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."duels"
  WHERE ("duels"."id" = "duel_players"."duel_id"))));



CREATE POLICY "No direct guess updates" ON "public"."duel_guesses" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "No direct score updates" ON "public"."duel_players" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Participants can read guesses" ON "public"."duel_guesses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."duel_players"
  WHERE (("duel_players"."duel_id" = "duel_guesses"."duel_id") AND ("duel_players"."player_id" = "auth"."uid"())))));



CREATE POLICY "Participants can update duels" ON "public"."duels" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."duel_players"
  WHERE (("duel_players"."duel_id" = "duels"."id") AND ("duel_players"."player_id" = "auth"."uid"())))));



CREATE POLICY "Rate limit duel creation" ON "public"."duels" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "count"(*) AS "count"
   FROM ("public"."duels" "d"
     JOIN "public"."duel_players" "dp" ON (("dp"."duel_id" = "d"."id")))
  WHERE (("dp"."player_id" = "auth"."uid"()) AND ("d"."status" = ANY (ARRAY['waiting'::"text", 'playing'::"text"])) AND ("d"."created_at" > ("now"() - '01:00:00'::interval)))) < 5));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."duel_guesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duel_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."duel_guesses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."duel_players";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."duels";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."advance_current_round"() TO "anon";
GRANT ALL ON FUNCTION "public"."advance_current_round"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_current_round"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_duel_guess"() TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_duel_guess"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_duel_guess"() TO "service_role";


















GRANT ALL ON TABLE "public"."duel_guesses" TO "anon";
GRANT ALL ON TABLE "public"."duel_guesses" TO "authenticated";
GRANT ALL ON TABLE "public"."duel_guesses" TO "service_role";



GRANT ALL ON TABLE "public"."duel_players" TO "anon";
GRANT ALL ON TABLE "public"."duel_players" TO "authenticated";
GRANT ALL ON TABLE "public"."duel_players" TO "service_role";



GRANT ALL ON TABLE "public"."duels" TO "anon";
GRANT ALL ON TABLE "public"."duels" TO "authenticated";
GRANT ALL ON TABLE "public"."duels" TO "service_role";



GRANT UPDATE("status") ON TABLE "public"."duels" TO "authenticated";



GRANT UPDATE("locations") ON TABLE "public"."duels" TO "authenticated";



GRANT ALL ON TABLE "public"."game_results" TO "anon";
GRANT ALL ON TABLE "public"."game_results" TO "authenticated";
GRANT ALL ON TABLE "public"."game_results" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


