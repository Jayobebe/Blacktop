-- Riders can be in up to four crews, with their own name for each.
--
-- 1. push_subscriptions: crew_codes (every crew this device's rider is in) and
--    crew_names ({code: the rider's name for it}); crew notifications reach a
--    device in any of its crews and start with that rider's name for the crew.
--    crew_code stays as the active crew (older apps and older code read it).
-- 2. register_push_subscription gains _crew_codes / _crew_names (optional, so
--    older apps calling it the old way keep working).
-- 3. crew_scores: one row per rider per crew (it was one per rider), so a rider
--    can be on every one of their crews' boards.
--
-- The app and send-push work before this runs (active crew only) and pick the
-- new columns up as soon as it has.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS crew_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crew_names jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.push_subscriptions
   SET crew_codes = ARRAY[crew_code]
 WHERE crew_code IS NOT NULL AND crew_codes = '{}';

CREATE INDEX IF NOT EXISTS push_subscriptions_crew_codes_idx ON public.push_subscriptions USING gin (crew_codes);

DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision);

CREATE FUNCTION public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _categories text[] DEFAULT '{}',
  _user_agent text DEFAULT NULL,
  _crew_code text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _crew_codes text[] DEFAULT NULL,
  _crew_names jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_crew text := nullif(left(upper(regexp_replace(coalesce(_crew_code, ''), '[^A-Za-z0-9]', '', 'g')), 10), '');
  v_codes text[];
  v_names jsonb;
  v_has_loc boolean := _lat IS NOT NULL AND _lng IS NOT NULL
    AND _lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180;
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

  -- Up to four crews, cleaned like crew_code; an older app sends only its one.
  SELECT coalesce(array_agg(c), '{}') INTO v_codes FROM (
    SELECT DISTINCT c FROM (
      SELECT nullif(left(upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')), 10), '') AS c
        FROM unnest(coalesce(_crew_codes, ARRAY[v_crew])) AS x
    ) s WHERE c IS NOT NULL AND length(c) >= 4
    LIMIT 4
  ) t;
  IF v_crew IS NULL AND array_length(v_codes, 1) > 0 THEN v_crew := v_codes[1]; END IF;

  -- The rider's names, only for their crews, 30 characters at most.
  SELECT coalesce(jsonb_object_agg(upper(k), left(btrim(v), 30)), '{}'::jsonb) INTO v_names
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(_crew_names) = 'object' THEN _crew_names ELSE '{}'::jsonb END) AS e(k, v)
   WHERE upper(k) = ANY(v_codes) AND length(btrim(v)) > 0;

  -- Location is only ever stored rounded to 0.1° (about 11 km).
  INSERT INTO public.push_subscriptions
    (user_id, endpoint, p256dh, auth, categories, user_agent, crew_code, crew_codes, crew_names, weather_lat, weather_lng, weather_at)
  VALUES (
    v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300), v_crew, v_codes, v_names,
    CASE WHEN v_has_loc THEN round(_lat::numeric, 1) END,
    CASE WHEN v_has_loc THEN round(_lng::numeric, 1) END,
    CASE WHEN v_has_loc THEN now() END
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    categories = EXCLUDED.categories,
    user_agent = EXCLUDED.user_agent,
    crew_code = EXCLUDED.crew_code,
    crew_codes = EXCLUDED.crew_codes,
    crew_names = EXCLUDED.crew_names,
    -- Keep the last location when this call didn't send one, unless both
    -- features that use it (weather alerts, helping nearby riders) are off.
    weather_lat = CASE WHEN v_has_loc THEN EXCLUDED.weather_lat
                       WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_lat END,
    weather_lng = CASE WHEN v_has_loc THEN EXCLUDED.weather_lng
                       WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_lng END,
    weather_at = CASE WHEN v_has_loc THEN EXCLUDED.weather_at
                      WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_at END,
    updated_at = now();

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

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb) TO authenticated;

-- One board row per rider per crew.
ALTER TABLE public.crew_scores DROP CONSTRAINT IF EXISTS crew_scores_pkey;
ALTER TABLE public.crew_scores ADD PRIMARY KEY (user_id, crew_code);
