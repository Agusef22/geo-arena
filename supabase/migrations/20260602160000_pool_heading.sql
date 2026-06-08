-- Add an initial camera heading (degrees) to pool locations, so the game can
-- drop the player facing down the road instead of at a default of 0°.
-- Vali outputs a heading per location; our own seeder derives it from the
-- panorama's first link. Nullable: falls back to 0 when absent.
ALTER TABLE "public"."pool_locations"
  ADD COLUMN IF NOT EXISTS "heading" double precision;
