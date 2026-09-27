-- Push notifications (Web Push): one row per device that turned notifications
-- on. Clients never read or write the table directly; they go through the two
-- SECURITY DEFINER functions below, and the send-push edge function reads it
-- with the service role.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- Which kinds of notification this device wants (e.g. 'rescue', 'convoy').
  categories text[] NOT NULL DEFAULT '{}',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the functions below and service_role.
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;

-- Endpoints must belong to a real browser push service, so the sender can
-- never be pointed at an arbitrary URL.
CREATE OR REPLACE FUNCTION public.is_push_service_endpoint(_endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
    AND length(_endpoint) <= 1024;
$$;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _categories text[] DEFAULT '{}',
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT public.is_push_service_endpoint(_endpoint) THEN
    RAISE EXCEPTION 'unsupported push endpoint';
  END IF;
  IF length(_p256dh) > 200 OR length(_auth) > 100 OR coalesce(array_length(_categories, 1), 0) > 20 THEN
    RAISE EXCEPTION 'invalid subscription';
  END IF;

  -- The same device (endpoint) moves to whoever is signed in on it now.
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, categories, user_agent)
  VALUES (v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    categories = EXCLUDED.categories,
    user_agent = EXCLUDED.user_agent,
    updated_at = now();

  -- Keep at most 10 devices per rider (oldest go first).
  DELETE FROM public.push_subscriptions
  WHERE user_id = v_user_id
    AND id NOT IN (
      SELECT id FROM public.push_subscriptions
      WHERE user_id = v_user_id
      ORDER BY updated_at DESC
      LIMIT 10
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_subscription(_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.push_subscriptions
  WHERE endpoint = _endpoint AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_subscription(text) TO authenticated;
