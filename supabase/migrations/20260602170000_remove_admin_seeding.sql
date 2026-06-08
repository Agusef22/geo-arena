-- Remove the in-app seeding machinery. The pool is now built with Vali (run
-- locally) and imported via the service role key (scripts/import-vali.mjs),
-- which bypasses RLS — so no client ever writes to pool_locations, and the
-- admin-identification table/function/policy are no longer needed.
--
-- pool_locations keeps RLS enabled with only its public SELECT policy: readable
-- by the game, writable solely by service_role.

DROP POLICY IF EXISTS "Admin can insert pool locations" ON "public"."pool_locations";
DROP FUNCTION IF EXISTS "public"."is_admin"();
DROP TABLE IF EXISTS "public"."admins";
