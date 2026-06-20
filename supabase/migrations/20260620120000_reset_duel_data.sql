-- Full duel reset (requested): wipe all duel games + history and reset every
-- player's duel ranking/record back to defaults. Clean slate.
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
