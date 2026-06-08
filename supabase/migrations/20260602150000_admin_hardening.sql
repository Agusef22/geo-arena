-- Admin hardening: identify admins via a private table instead of a hardcoded
-- email. The previous pool insert policy embedded a personal email in the
-- migration (committed to a PUBLIC repo) and, through NEXT_PUBLIC_ADMIN_EMAIL,
-- shipped it in the browser bundle. This removes both: admin identity lives
-- only in the `admins` table (populated out-of-band, never in the repo), and is
-- checked through a SECURITY DEFINER function.
--
-- Idempotent so it works both on the already-deployed DB (which still has the
-- old email policy) and on a fresh environment.

-- 1. Private table of admin user ids. RLS is enabled with NO policies, so it is
--    opaque to anon/authenticated: nobody can read, enumerate or modify it
--    through the API. Rows are added out-of-band (service_role / dashboard),
--    which bypasses RLS. Cascades if the auth user is deleted.
CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admins_id_fkey" FOREIGN KEY ("id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."admins" OWNER TO "postgres";
ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;

-- 2. Whether the current caller is an admin. SECURITY DEFINER so it can read the
--    (otherwise-opaque) admins table; it only ever reveals the caller's own
--    status, never the list. Hardened search_path against hijacking.
CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" = ''
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.admins WHERE id = auth.uid()
      );
    $$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated";

-- 3. Replace the old email-based insert policy with an admins-based one.
--    DROP IF EXISTS handles the already-deployed DB; fresh envs simply skip it.
DROP POLICY IF EXISTS "Admin can insert pool locations" ON "public"."pool_locations";

CREATE POLICY "Admin can insert pool locations"
  ON "public"."pool_locations" FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_admin"());

-- Note: admins table grants intentionally NOT given to anon/authenticated.
-- Only service_role (dashboard / server) can touch it.
GRANT ALL ON TABLE "public"."admins" TO "service_role";
