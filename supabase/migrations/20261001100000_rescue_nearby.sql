-- Rescue reach: riders can opt in to "Riders near me who need help"
-- (push category 'rescue_nearby'). Like weather alerts, that keeps the
-- device's position rounded to 0.1° (about 11 km), so send-push can reach
-- opted-in riders within the radius the rider in trouble chose.
-- Same function as 20260927182708, only the "keep the location" rule changes.

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _categories text[] DEFAULT '{}',
  _user_agent text DEFAULT NULL,
  _crew_code text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_crew text := nullif(left(upper(regexp_replace(coalesce(_crew_code, ''), '[^A-Za-z0-9]', '', 'g')), 10), '');
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

  -- Location is only ever stored rounded to 0.1° (about 11 km).
  INSERT INTO public.push_subscriptions
    (user_id, endpoint, p256dh, auth, categories, user_agent, crew_code, weather_lat, weather_lng, weather_at)
  VALUES (
    v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300), v_crew,
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
