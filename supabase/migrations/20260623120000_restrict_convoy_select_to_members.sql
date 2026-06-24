-- Security fix: "Authenticated users can view active convoys" let any
-- anonymous-auth caller SELECT * from every active convoy (code, leader_id,
-- destination address/coordinates), not just convoys they were given the
-- code for. Replace direct table SELECT with a code-scoped lookup function
-- for the join flow, and restrict table SELECT to actual members/leader
-- (who are already rows in convoy_members at creation/join time).

CREATE OR REPLACE FUNCTION public.lookup_convoy_by_code(_code text)
RETURNS public.convoys
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.convoys WHERE code = _code AND is_active = true LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_convoy_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_convoy_by_code(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view active convoys" ON public.convoys;
CREATE POLICY "Members can view their convoy"
ON public.convoys FOR SELECT TO authenticated
USING (public.is_convoy_member(id, auth.uid()) OR leader_id = auth.uid());
