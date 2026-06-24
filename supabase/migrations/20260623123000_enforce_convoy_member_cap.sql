-- Security fix: the 8-member convoy cap (MAX_CONVOY_MEMBERS in
-- src/features/convoy/hooks/useConvoyState.ts) was enforced only in the
-- client's join flow. A caller hitting the API directly could add unlimited
-- members to any convoy. Mirror the cap in the INSERT policy itself.
--
-- The app already does its own pre-check and shows a "Convoy full" toast
-- before attempting the insert (useConvoyState.ts joinConvoy), so this only
-- changes behavior for a direct API bypass or a rare concurrent-join race,
-- where the insert now fails instead of silently exceeding the cap.

DROP POLICY IF EXISTS "Users can join convoys" ON public.convoy_members;
CREATE POLICY "Users can join convoys"
ON public.convoy_members FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    SELECT count(*) FROM public.convoy_members cm
    WHERE cm.convoy_id = convoy_members.convoy_id
  ) < 8
);
