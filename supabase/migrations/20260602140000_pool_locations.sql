-- Curated location pool.
-- Instead of searching Street View live every game (slow, can fail, can serve
-- low-quality community coverage), we pre-validate official Google panoramas
-- once into this table and let the game pick from it. See src/app/admin/seed.
--
-- Each row is one official, navigable outdoor panorama:
--   - copyright contained "Google" (official, not community/UGC), and
--   - had >= 2 links (real road coverage you can walk along).
-- The validation that produced these rows is documented in the seeding page.

CREATE TABLE IF NOT EXISTS "public"."pool_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "pano_id" "text" NOT NULL,
    "country" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pool_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pool_locations_pano_id_key" UNIQUE ("pano_id"),
    CONSTRAINT "pool_valid_lat" CHECK (("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision)),
    CONSTRAINT "pool_valid_lng" CHECK (("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision))
);

ALTER TABLE "public"."pool_locations" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "pool_locations_country_idx" ON "public"."pool_locations" USING "btree" ("country");

ALTER TABLE "public"."pool_locations" ENABLE ROW LEVEL SECURITY;

-- Anyone can read the pool: the game needs it to pick rounds.
CREATE POLICY "Anyone can read pool locations"
  ON "public"."pool_locations" FOR SELECT USING (true);

-- The INSERT (admin) policy lives in 20260602150000_admin_hardening.sql, which
-- gates seeding via a private `admins` table + is_admin() — no PII in the repo.

-- Pick `n` distinct random locations for a game. For a pool of ~10k rows,
-- ORDER BY random() is plenty fast and guarantees no repeats within a game.
CREATE OR REPLACE FUNCTION "public"."get_random_locations"("n" integer)
  RETURNS SETOF "public"."pool_locations"
  LANGUAGE "sql" STABLE
  AS $$
    SELECT * FROM public.pool_locations ORDER BY random() LIMIT n;
  $$;

ALTER FUNCTION "public"."get_random_locations"("n" integer) OWNER TO "postgres";

GRANT ALL ON TABLE "public"."pool_locations" TO "anon";
GRANT ALL ON TABLE "public"."pool_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."pool_locations" TO "service_role";

GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_random_locations"("n" integer) TO "service_role";
