
-- ============================================
-- Security hardening migration
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. RLS: scope all policies to `authenticated` role and require real membership
-- ============================================

-- profiles: keep visible to authenticated only (already authenticated, but normalize)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- convoys: viewing active convoys (needed for join-by-code) restricted to authenticated
DROP POLICY IF EXISTS "Anyone can view active convoys" ON public.convoys;
CREATE POLICY "Authenticated users can view active convoys"
ON public.convoys FOR SELECT TO authenticated
USING (is_active = true);

-- convoys: tighten leader update WITH CHECK
DROP POLICY IF EXISTS "Leaders can update their convoy" ON public.convoys;
CREATE POLICY "Leaders can update their convoy"
ON public.convoys FOR UPDATE TO authenticated
USING (auth.uid() = leader_id)
WITH CHECK (auth.uid() = leader_id);

-- convoy_members: require actual membership to view (not just is_active) + authenticated only
DROP POLICY IF EXISTS "Members can view convoy members" ON public.convoy_members;
CREATE POLICY "Members can view convoy members"
ON public.convoy_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convoy_members cm
    WHERE cm.convoy_id = convoy_members.convoy_id
      AND cm.user_id = auth.uid()
  )
);

-- convoy_members: scope existing UPDATE policy to authenticated
DROP POLICY IF EXISTS "Users can update their own membership" ON public.convoy_members;
CREATE POLICY "Users can update their own membership"
ON public.convoy_members FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- convoy_waypoints: require membership to view + authenticated only
DROP POLICY IF EXISTS "Members can view convoy waypoints" ON public.convoy_waypoints;
CREATE POLICY "Members can view convoy waypoints"
ON public.convoy_waypoints FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convoy_members cm
    WHERE cm.convoy_id = convoy_waypoints.convoy_id
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Leaders can insert waypoints" ON public.convoy_waypoints;
CREATE POLICY "Leaders can insert waypoints"
ON public.convoy_waypoints FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id AND c.leader_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Leaders can update waypoints" ON public.convoy_waypoints;
CREATE POLICY "Leaders can update waypoints"
ON public.convoy_waypoints FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id AND c.leader_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id AND c.leader_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Leaders can delete waypoints" ON public.convoy_waypoints;
CREATE POLICY "Leaders can delete waypoints"
ON public.convoy_waypoints FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id AND c.leader_id = auth.uid()
  )
);

-- convoy_messages: scope to authenticated
DROP POLICY IF EXISTS "Users can view convoy messages" ON public.convoy_messages;
CREATE POLICY "Users can view convoy messages"
ON public.convoy_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convoy_members
    WHERE convoy_members.convoy_id = convoy_messages.convoy_id
      AND convoy_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can send convoy messages" ON public.convoy_messages;
CREATE POLICY "Users can send convoy messages"
ON public.convoy_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.convoy_members
    WHERE convoy_members.convoy_id = convoy_messages.convoy_id
      AND convoy_members.user_id = auth.uid()
  )
);

-- discord_integrations: scope to authenticated
DROP POLICY IF EXISTS "Users manage their own discord integration" ON public.discord_integrations;
CREATE POLICY "Users manage their own discord integration"
ON public.discord_integrations FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. Input validation: length + coordinate range CHECK constraints
-- ============================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_length,
  ADD CONSTRAINT profiles_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 50);

ALTER TABLE public.convoys
  DROP CONSTRAINT IF EXISTS convoys_name_length,
  ADD CONSTRAINT convoys_name_length CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.convoys
  DROP CONSTRAINT IF EXISTS convoys_destination_name_length,
  ADD CONSTRAINT convoys_destination_name_length
    CHECK (destination_name IS NULL OR char_length(destination_name) BETWEEN 1 AND 200);

ALTER TABLE public.convoys
  DROP CONSTRAINT IF EXISTS convoys_destination_address_length,
  ADD CONSTRAINT convoys_destination_address_length
    CHECK (destination_address IS NULL OR char_length(destination_address) <= 500);

ALTER TABLE public.convoys
  DROP CONSTRAINT IF EXISTS convoys_destination_lat_range,
  ADD CONSTRAINT convoys_destination_lat_range
    CHECK (destination_lat IS NULL OR (destination_lat >= -90 AND destination_lat <= 90));

ALTER TABLE public.convoys
  DROP CONSTRAINT IF EXISTS convoys_destination_lng_range,
  ADD CONSTRAINT convoys_destination_lng_range
    CHECK (destination_lng IS NULL OR (destination_lng >= -180 AND destination_lng <= 180));

ALTER TABLE public.convoy_messages
  DROP CONSTRAINT IF EXISTS convoy_messages_content_length,
  ADD CONSTRAINT convoy_messages_content_length CHECK (char_length(content) BETWEEN 1 AND 500);

ALTER TABLE public.convoy_messages
  DROP CONSTRAINT IF EXISTS convoy_messages_sender_name_length,
  ADD CONSTRAINT convoy_messages_sender_name_length CHECK (char_length(sender_name) BETWEEN 1 AND 50);

ALTER TABLE public.convoy_waypoints
  DROP CONSTRAINT IF EXISTS convoy_waypoints_name_length,
  ADD CONSTRAINT convoy_waypoints_name_length CHECK (char_length(name) BETWEEN 1 AND 200);

ALTER TABLE public.convoy_waypoints
  DROP CONSTRAINT IF EXISTS convoy_waypoints_address_length,
  ADD CONSTRAINT convoy_waypoints_address_length
    CHECK (address IS NULL OR char_length(address) <= 500);

ALTER TABLE public.convoy_waypoints
  DROP CONSTRAINT IF EXISTS convoy_waypoints_lat_range,
  ADD CONSTRAINT convoy_waypoints_lat_range CHECK (lat >= -90 AND lat <= 90);

ALTER TABLE public.convoy_waypoints
  DROP CONSTRAINT IF EXISTS convoy_waypoints_lng_range,
  ADD CONSTRAINT convoy_waypoints_lng_range CHECK (lng >= -180 AND lng <= 180);

-- ============================================
-- 3. Replace convoy code generator with cryptographically secure version
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_convoy_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  random_bytes BYTEA;
  i INTEGER;
  attempt INTEGER := 0;
BEGIN
  LOOP
    result := '';
    random_bytes := gen_random_bytes(6);
    FOR i IN 1..6 LOOP
      result := result || substr(chars, 1 + (get_byte(random_bytes, i - 1) % length(chars)), 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.convoys WHERE code = result AND is_active = true) THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    EXIT WHEN attempt >= 10;
  END LOOP;
  RAISE EXCEPTION 'Failed to generate unique convoy code';
END;
$$;

-- ============================================
-- 4. Lock down function execution
-- ============================================

-- profile_count: intentionally public stat, but restrict to authenticated only
REVOKE EXECUTE ON FUNCTION public.profile_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_count() TO authenticated;

-- generate_convoy_code: only authenticated callers
REVOKE EXECUTE ON FUNCTION public.generate_convoy_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_convoy_code() TO authenticated;

-- discord_integrations_touch is internal trigger only
REVOKE EXECUTE ON FUNCTION public.discord_integrations_touch() FROM PUBLIC, anon, authenticated;
