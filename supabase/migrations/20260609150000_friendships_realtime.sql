-- Deliver friendships changes over Realtime so both users see requests /
-- accepts live (incoming list + badge update without a reload). Realtime
-- postgres_changes respects RLS, so each user only receives events for rows
-- they're a member of (the "Read own friendships" SELECT policy).
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";
