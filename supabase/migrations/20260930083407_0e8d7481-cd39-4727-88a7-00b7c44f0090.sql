-- Blacktop Enterprise, phase 1: organisations (schools, dealers, tour
-- operators, race teams), their members, invite codes, and short-lived guest
-- sessions for QR access (students, test riders, tour guests) without an
-- account of their own.
--
-- Privacy: nothing here reads or links a rider's consumer data (rides, garage,
-- crews, push). A member row only ties an auth user to an organisation.
--
-- Burn: organization_members.user_id cascades from auth.users. Guest sessions
-- and invites belong to the organisation, not a rider.
--
-- Access: anon gets nothing. Riders see only the organisations they belong
-- to; owners/admins manage them. Organisations, invites and guest sessions are
-- created by the service role (Edge Functions / the enterprise console), and
-- riders join through verify_enterprise_token().
--
-- Tiers and roles mirror src/features/enterprise/types.ts: keep them in sync.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  tier text NOT NULL DEFAULT 'academy' CHECK (tier IN ('academy', 'showroom', 'touring', 'track_pro', 'billion')),
  contact_email text,
  -- { logo_url, accent_color, welcome_message }
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { speed_caps, geofences, telemetry_retention_days }
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'driver' CHECK (role IN ('owner', 'admin', 'staff', 'instructor', 'driver')),
  callsign text CHECK (callsign IS NULL OR length(callsign) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX organization_members_user_idx ON public.organization_members (user_id);

-- Codes that add a signed-in rider to an organisation as a member.
CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (length(code) >= 6),
  role text NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'staff', 'instructor', 'driver')),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_invites_org_idx ON public.organization_invites (org_id);

-- QR guest access: a token that mounts the workspace for a limited time.
CREATE TABLE public.enterprise_guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE CHECK (length(session_token) >= 16),
  role text NOT NULL DEFAULT 'guest_rider' CHECK (role IN ('student', 'guest_rider', 'customer')),
  callsign text CHECK (callsign IS NULL OR length(callsign) <= 40),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enterprise_guest_sessions_org_idx ON public.enterprise_guest_sessions (org_id);
CREATE INDEX enterprise_guest_sessions_expires_idx ON public.enterprise_guest_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.organizations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.organizations_touch_updated_at();

-- The signed-in rider's role in an organisation, or null. SECURITY DEFINER so
-- policies on organization_members can use it without recursing into themselves.
CREATE OR REPLACE FUNCTION public.enterprise_role(_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role FROM public.organization_members m
  WHERE m.org_id = _org AND m.user_id = auth.uid()
$$;

-- ---- Row level security ---------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_guest_sessions ENABLE ROW LEVEL SECURITY;

-- Organisations: members see theirs; owners and admins edit them.
CREATE POLICY "Members read their organisation"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.enterprise_role(id) IS NOT NULL);

CREATE POLICY "Owners and admins update their organisation"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.enterprise_role(id) IN ('owner', 'admin'))
  WITH CHECK (public.enterprise_role(id) IN ('owner', 'admin'));

-- Members: see the roster of your own organisations; owners and admins manage
-- it; anyone but an owner can leave.
CREATE POLICY "Members read their organisation's roster"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.enterprise_role(org_id) IS NOT NULL);

CREATE POLICY "Owners and admins update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.enterprise_role(org_id) IN ('owner', 'admin'))
  WITH CHECK (public.enterprise_role(org_id) IN ('owner', 'admin') AND role <> 'owner');

CREATE POLICY "Members leave, owners and admins remove"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (public.enterprise_role(org_id) IN ('owner', 'admin') AND role <> 'owner')
  );

-- Invites: owners and admins see and revoke them.
CREATE POLICY "Owners and admins read invites"
  ON public.organization_invites FOR SELECT TO authenticated
  USING (public.enterprise_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owners and admins revoke invites"
  ON public.organization_invites FOR DELETE TO authenticated
  USING (public.enterprise_role(org_id) IN ('owner', 'admin'));

-- Guest sessions: staff see (to show the QR again) and revoke them.
CREATE POLICY "Staff read guest sessions"
  ON public.enterprise_guest_sessions FOR SELECT TO authenticated
  USING (public.enterprise_role(org_id) IN ('owner', 'admin', 'staff', 'instructor'));

CREATE POLICY "Staff revoke guest sessions"
  ON public.enterprise_guest_sessions FOR DELETE TO authenticated
  USING (public.enterprise_role(org_id) IN ('owner', 'admin', 'staff', 'instructor'));

-- ---- Grants -----------------------------------------------------------------

REVOKE ALL ON public.organizations FROM PUBLIC, anon;
REVOKE ALL ON public.organization_members FROM PUBLIC, anon;
REVOKE ALL ON public.organization_invites FROM PUBLIC, anon;
REVOKE ALL ON public.enterprise_guest_sessions FROM PUBLIC, anon;

GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, DELETE ON public.organization_invites TO authenticated;
GRANT SELECT, DELETE ON public.enterprise_guest_sessions TO authenticated;

GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_invites TO service_role;
GRANT ALL ON public.enterprise_guest_sessions TO service_role;

-- ---- Joining ------------------------------------------------------------------

-- Check a scanned or typed code. A guest session token returns the workspace
-- and the guest's role for as long as it lasts; an invite code adds the rider
-- as a member (keeping any role they already have). Returns null for anything
-- unknown, used up or expired. Only public organisation fields are returned
-- (no contact email or settings). Rate-limited against guessing.
CREATE OR REPLACE FUNCTION public.verify_enterprise_token(token_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text := btrim(coalesce(token_code, ''));
  v_guest public.enterprise_guest_sessions%ROWTYPE;
  v_invite public.organization_invites%ROWTYPE;
  v_member public.organization_members%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT public.check_rate_limit('enterprise-verify', 20, 3600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  IF length(v_code) < 6 OR length(v_code) > 200 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_guest FROM public.enterprise_guest_sessions
  WHERE session_token = v_code AND expires_at > now();

  IF FOUND THEN
    SELECT * INTO v_org FROM public.organizations WHERE id = v_guest.org_id;
    RETURN jsonb_build_object(
      'kind', 'guest',
      'org', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'slug', v_org.slug, 'tier', v_org.tier, 'branding', v_org.branding),
      'session', jsonb_build_object(
        'id', v_guest.id,
        'role', v_guest.role,
        'callsign', v_guest.callsign,
        'expires_at', v_guest.expires_at,
        'token', v_guest.session_token
      )
    );
  END IF;

  SELECT * INTO v_invite FROM public.organization_invites
  WHERE upper(code) = upper(v_code)
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (v_invite.org_id, v_user, v_invite.role)
  ON CONFLICT (org_id, user_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF coalesce(v_inserted, false) THEN
    UPDATE public.organization_invites SET uses = uses + 1 WHERE id = v_invite.id;
  END IF;

  SELECT * INTO v_member FROM public.organization_members WHERE org_id = v_invite.org_id AND user_id = v_user;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_invite.org_id;

  RETURN jsonb_build_object(
    'kind', 'member',
    'org', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'slug', v_org.slug, 'tier', v_org.tier, 'branding', v_org.branding),
    'session', jsonb_build_object(
      'id', v_member.id,
      'role', v_member.role,
      'callsign', v_member.callsign,
      'expires_at', NULL,
      'token', NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_enterprise_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizations_touch_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enterprise_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enterprise_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_enterprise_token(text) TO service_role;

-- Daily tidy-up: guest sessions go a day after they expire.
SELECT cron.schedule(
  'blacktop-enterprise-guest-cleanup',
  '41 3 * * *',
  $$DELETE FROM public.enterprise_guest_sessions WHERE expires_at < now() - interval '1 day'$$
);