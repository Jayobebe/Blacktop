
CREATE OR REPLACE FUNCTION public.is_convoy_member(_convoy_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.convoy_members
    WHERE convoy_id = _convoy_id AND user_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_convoy_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_convoy_member(uuid, uuid) TO authenticated;

-- Rewrite recursive policy on convoy_members
DROP POLICY IF EXISTS "Members can view convoy members" ON public.convoy_members;
CREATE POLICY "Members can view convoy members"
ON public.convoy_members
FOR SELECT
TO authenticated
USING (public.is_convoy_member(convoy_id, auth.uid()));

-- Rewrite convoy_waypoints SELECT
DROP POLICY IF EXISTS "Members can view convoy waypoints" ON public.convoy_waypoints;
CREATE POLICY "Members can view convoy waypoints"
ON public.convoy_waypoints
FOR SELECT
TO authenticated
USING (public.is_convoy_member(convoy_id, auth.uid()));

-- Rewrite convoy_messages policies
DROP POLICY IF EXISTS "Users can view convoy messages" ON public.convoy_messages;
CREATE POLICY "Users can view convoy messages"
ON public.convoy_messages
FOR SELECT
TO authenticated
USING (public.is_convoy_member(convoy_id, auth.uid()));

DROP POLICY IF EXISTS "Users can send convoy messages" ON public.convoy_messages;
CREATE POLICY "Users can send convoy messages"
ON public.convoy_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_convoy_member(convoy_id, auth.uid()));
