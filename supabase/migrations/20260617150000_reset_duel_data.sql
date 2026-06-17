-- Wipe duel history + reset the ranking. The duel scoring model changed
-- (differential-by-distance → HP/damage/multiplier, region-aware), so every
-- past duel — and the ELO/record derived from it — is on an incompatible scale.
-- Start clean: delete the games and reset everyone's duel rating/record.
--
-- Children first (in case any FK lacks ON DELETE CASCADE), then the duels.
DELETE FROM "public"."duel_guesses";
DELETE FROM "public"."duel_invitations";
DELETE FROM "public"."duel_players";
DELETE FROM "public"."duels";

UPDATE "public"."profiles"
SET "duel_rating" = 1000,
    "duel_wins" = 0,
    "duel_losses" = 0,
    "duel_draws" = 0;
