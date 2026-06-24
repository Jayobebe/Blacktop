-- Security fix: place-search (and potentially other edge functions) require
-- auth, but auth is free and instant here (signInAnonymously()), so it was
-- effectively an unthrottled proxy to Nominatim/Overpass. Add a small,
-- reusable per-user/per-bucket rate limiter that edge functions can call.

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the SECURITY DEFINER function below
-- (and service_role) can read/write this table.
REVOKE ALL ON public.edge_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _max_requests integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.edge_rate_limits (user_id, bucket, window_start, request_count)
  VALUES (v_user_id, _bucket, now(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE SET
    window_start = CASE
      WHEN now() - edge_rate_limits.window_start > make_interval(secs => _window_seconds)
        THEN now()
      ELSE edge_rate_limits.window_start
    END,
    request_count = CASE
      WHEN now() - edge_rate_limits.window_start > make_interval(secs => _window_seconds)
        THEN 1
      ELSE edge_rate_limits.request_count + 1
    END
  RETURNING request_count INTO v_count;

  RETURN v_count <= _max_requests;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
