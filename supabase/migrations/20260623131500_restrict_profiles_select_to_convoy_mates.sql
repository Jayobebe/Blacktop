-- Security hardening: "Authenticated users can view profiles" exposed every
-- user's display_name/avatar_url to anyone (auth here is a free anonymous
-- sign-in). The only client read of another user's profile is the
-- convoy-member-list join (profiles!convoy_members_user_id_fkey in
-- useConvoyState.ts), which only ever needs convoy-mates' names. Scope
-- SELECT to "own profile, or someone you currently share a convoy with."

CREATE OR REPLACE FUNCTION public.shares_convoy_with(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.convoy_members cm1
    JOIN public.convoy_members cm2 ON cm1.convoy_id = cm2.convoy_id
    WHERE cm1.user_id = auth.uid() AND cm2.user_id = _other_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.shares_convoy_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_convoy_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view own and convoy-mate profiles"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.shares_convoy_with(id));
