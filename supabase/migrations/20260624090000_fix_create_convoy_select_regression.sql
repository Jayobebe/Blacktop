-- Fixes a regression from the RLS hardening migration
-- (20260623120000_restrict_convoy_select_to_members.sql): tightening the
-- convoys SELECT policy to USING (is_convoy_member(id, auth.uid())) broke
-- createConvoy() in useConvoyState.ts, which does
-- .insert({...leader_id: user.id}).select().single() and only adds the
-- leader to convoy_members in a separate statement afterward. Postgres
-- filters INSERT ... RETURNING rows through the SELECT policy, so at the
-- moment of insert is_convoy_member() is still false, the RETURNING row is
-- filtered out, .single() sees zero rows, and the client reports "Failed to
-- create convoy" even though the row was actually inserted (now orphaned,
-- with no members).
--
-- Mirror the INSERT policy's trust of leader_id = auth.uid() in the SELECT
-- policy so the leader can always see their own convoy, independent of
-- convoy_members membership timing.

DROP POLICY IF EXISTS "Members can view their convoy" ON public.convoys;
CREATE POLICY "Members can view their convoy"
ON public.convoys FOR SELECT TO authenticated
USING (public.is_convoy_member(id, auth.uid()) OR leader_id = auth.uid());
