CREATE OR REPLACE FUNCTION public.is_push_service_endpoint(_endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
      _endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
      OR _endpoint ~ '^fcm:[A-Za-z0-9_:-]{20,1000}$'
      OR _endpoint ~ '^apns:[0-9a-fA-F]{64,200}$'
    )
    AND length(_endpoint) <= 1024;
$$;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS distance_unit text CHECK (distance_unit IN ('miles', 'km')),
  ADD COLUMN IF NOT EXISTS speed_unit text CHECK (speed_unit IN ('mph', 'kph'));

DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb);

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
  _crew_names jsonb DEFAULT NULL,
  _distance_unit text DEFAULT NULL,
  _speed_unit text DEFAULT NULL
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
  v_dist text := CASE WHEN _distance_unit IN ('miles', 'km') THEN _distance_unit END;
  v_speed text := CASE WHEN _speed_unit IN ('mph', 'kph') THEN _speed_unit END;
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

  SELECT coalesce(array_agg(c), '{}') INTO v_codes FROM (
    SELECT DISTINCT c FROM (
      SELECT nullif(left(upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')), 10), '') AS c
        FROM unnest(coalesce(_crew_codes, ARRAY[v_crew])) AS x
    ) s WHERE c IS NOT NULL AND length(c) >= 4
    LIMIT 4
  ) t;
  IF v_crew IS NULL AND array_length(v_codes, 1) > 0 THEN v_crew := v_codes[1]; END IF;

  SELECT coalesce(jsonb_object_agg(upper(k), left(btrim(v), 30)), '{}'::jsonb) INTO v_names
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(_crew_names) = 'object' THEN _crew_names ELSE '{}'::jsonb END) AS e(k, v)
   WHERE upper(k) = ANY(v_codes) AND length(btrim(v)) > 0;

  INSERT INTO public.push_subscriptions
    (user_id, endpoint, p256dh, auth, categories, user_agent, crew_code, crew_codes, crew_names, distance_unit, speed_unit, weather_lat, weather_lng, weather_at)
  VALUES (
    v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300), v_crew, v_codes, v_names, v_dist, v_speed,
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
    distance_unit = coalesce(EXCLUDED.distance_unit, push_subscriptions.distance_unit),
    speed_unit = coalesce(EXCLUDED.speed_unit, push_subscriptions.speed_unit),
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

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb, text, text) TO authenticated;

DROP TRIGGER IF EXISTS push_card_attempt ON public.card_challenge_attempts;
DROP FUNCTION IF EXISTS public.push_on_card_attempt();
DROP TABLE IF EXISTS public.card_challenge_attempts;
DELETE FROM public.push_outbox WHERE kind = 'card_attempt';

DROP FUNCTION IF EXISTS public.list_card_drops(double precision, double precision, double precision, text);

ALTER TABLE public.card_drops
  DROP COLUMN IF EXISTS challenge_route,
  DROP COLUMN IF EXISTS challenge_time_sec,
  DROP COLUMN IF EXISTS challenge_distance_mi,
  DROP COLUMN IF EXISTS challenge_finish_lat,
  DROP COLUMN IF EXISTS challenge_finish_lng,
  DROP COLUMN IF EXISTS challenge_set_at;

CREATE FUNCTION public.list_card_drops(_lat double precision, _lng double precision, _radius_km double precision, _crew_code text)
 RETURNS TABLE(id uuid, owner_name text, vehicle_name text, make_model text, tier text, total_rides integer, total_distance_mi numeric, total_duration_sec integer, top_speed_mph numeric, max_lean numeric, max_g_force numeric, photo_path text, placement_x numeric, placement_y numeric, placement_scale numeric, card_zoom numeric, lat double precision, lng double precision, is_own boolean, collected boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.owner_name, d.vehicle_name, d.make_model, d.tier,
         d.total_rides, d.total_distance_mi, d.total_duration_sec,
         d.top_speed_mph, d.max_lean, d.max_g_force, d.photo_path,
         d.placement_x, d.placement_y, d.placement_scale, d.card_zoom,
         d.lat, d.lng,
         d.owner_id = auth.uid() AS is_own,
         EXISTS (
           SELECT 1 FROM public.card_drop_collections c
           WHERE c.drop_id = d.id AND c.collector_id = auth.uid()
         ) AS collected,
         d.created_at
  FROM public.card_drops d
  WHERE d.is_active
    AND auth.uid() IS NOT NULL
    AND (d.visibility = 'world' OR d.crew_code = _crew_code OR d.owner_id = auth.uid())
    AND (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(_lat)) * cos(radians(d.lat)) * cos(radians(d.lng) - radians(_lng))
          + sin(radians(_lat)) * sin(radians(d.lat))
        ))
      )
    ) <= greatest(1, least(_radius_km, 500))
  ORDER BY d.created_at DESC
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.track_records (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  osm_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('cw', 'ccw')),
  vehicle_class text NOT NULL CHECK (vehicle_class IN ('motorcycle', 'car', 'bicycle', 'ebike', 'escooter')),
  lap_ms integer NOT NULL CHECK (lap_ms BETWEEN 10000 AND 3600000),
  sectors integer[] NOT NULL DEFAULT '{}',
  track_name text NOT NULL,
  display_name text NOT NULL,
  vehicle_name text,
  card jsonb,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, osm_id, direction, vehicle_class)
);
CREATE INDEX IF NOT EXISTS track_records_board_idx ON public.track_records (osm_id, direction, vehicle_class, lap_ms);
ALTER TABLE public.track_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_records FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.track_record_beats (
  beater_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  beaten_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  osm_id bigint NOT NULL,
  direction text NOT NULL,
  vehicle_class text NOT NULL,
  beaten_ms integer NOT NULL,
  beater_ms integer NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (beater_id, beaten_id, osm_id, direction, vehicle_class)
);
CREATE INDEX IF NOT EXISTS track_record_beats_beaten_idx ON public.track_record_beats (beaten_id);
ALTER TABLE public.track_record_beats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_record_beats FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_track_lap(
  _osm_id bigint,
  _direction text,
  _vehicle_class text,
  _lap_ms integer,
  _sectors integer[],
  _length_m integer,
  _track_name text,
  _display_name text,
  _vehicle_name text DEFAULT NULL,
  _card jsonb DEFAULT NULL
)
RETURNS TABLE(display_name text, vehicle_name text, lap_ms integer, card jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me uuid := auth.uid();
  v_name text := left(coalesce(nullif(btrim(_display_name), ''), 'Rider'), 30);
  rec record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _direction NOT IN ('cw', 'ccw') OR _vehicle_class NOT IN ('motorcycle', 'car', 'bicycle', 'ebike', 'escooter') THEN
    RAISE EXCEPTION 'invalid lap';
  END IF;
  IF _lap_ms IS NULL OR _lap_ms < 10000 OR _lap_ms > 3600000 OR _length_m IS NULL OR _length_m < 200 OR _length_m > 30000 THEN
    RAISE EXCEPTION 'invalid lap';
  END IF;
  IF (_length_m::numeric / _lap_ms) * 3600 > 350 THEN
    RAISE EXCEPTION 'implausible lap';
  END IF;
  IF _card IS NOT NULL AND (jsonb_typeof(_card) <> 'object' OR length(_card::text) > 4000) THEN
    _card := NULL;
  END IF;

  INSERT INTO public.track_records AS r (user_id, osm_id, direction, vehicle_class, lap_ms, sectors, track_name, display_name, vehicle_name, card, set_at)
  VALUES (v_me, _osm_id, _direction, _vehicle_class, _lap_ms, coalesce(_sectors[1:30], '{}'), left(_track_name, 80), v_name, left(_vehicle_name, 40), _card, now())
  ON CONFLICT (user_id, osm_id, direction, vehicle_class) DO UPDATE SET
    lap_ms = EXCLUDED.lap_ms,
    sectors = EXCLUDED.sectors,
    track_name = EXCLUDED.track_name,
    display_name = EXCLUDED.display_name,
    vehicle_name = EXCLUDED.vehicle_name,
    card = EXCLUDED.card,
    set_at = now()
  WHERE r.lap_ms > EXCLUDED.lap_ms;

  FOR rec IN
    SELECT t.user_id, t.display_name, t.vehicle_name, t.lap_ms, t.card
    FROM public.track_records t
    WHERE t.osm_id = _osm_id AND t.direction = _direction AND t.vehicle_class = _vehicle_class
      AND t.user_id <> v_me AND t.lap_ms > _lap_ms
      AND NOT EXISTS (
        SELECT 1 FROM public.track_record_beats b
        WHERE b.beater_id = v_me AND b.beaten_id = t.user_id AND b.osm_id = _osm_id
          AND b.direction = _direction AND b.vehicle_class = _vehicle_class AND b.beaten_ms <= t.lap_ms
      )
    ORDER BY t.lap_ms
    LIMIT 50
  LOOP
    INSERT INTO public.track_record_beats AS b (beater_id, beaten_id, osm_id, direction, vehicle_class, beaten_ms, beater_ms, at)
    VALUES (v_me, rec.user_id, _osm_id, _direction, _vehicle_class, rec.lap_ms, _lap_ms, now())
    ON CONFLICT (beater_id, beaten_id, osm_id, direction, vehicle_class) DO UPDATE SET
      beaten_ms = EXCLUDED.beaten_ms, beater_ms = EXCLUDED.beater_ms, at = now();
    PERFORM public.push_enqueue('track_beaten', jsonb_build_object(
      'beaten', rec.user_id, 'by_name', v_name, 'track', left(_track_name, 80), 'their_ms', rec.lap_ms, 'by_ms', _lap_ms
    ));
    display_name := rec.display_name;
    vehicle_name := rec.vehicle_name;
    lap_ms := rec.lap_ms;
    card := rec.card;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_leaderboard(_osm_id bigint, _direction text, _vehicle_class text, _limit integer DEFAULT 20)
RETURNS TABLE(rank bigint, display_name text, vehicle_name text, lap_ms integer, sectors integer[], set_at timestamptz, is_me boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_number() OVER (ORDER BY t.lap_ms, t.set_at) AS rank,
         t.display_name, t.vehicle_name, t.lap_ms, t.sectors, t.set_at, t.user_id = auth.uid() AS is_me
  FROM public.track_records t
  WHERE auth.uid() IS NOT NULL
    AND t.osm_id = _osm_id AND t.direction = _direction AND t.vehicle_class = _vehicle_class
  ORDER BY t.lap_ms, t.set_at
  LIMIT greatest(1, least(coalesce(_limit, 20), 100));
$$;

CREATE OR REPLACE FUNCTION public.leave_track_leaderboards()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.track_records WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.submit_track_lap(bigint, text, text, integer, integer[], integer, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.track_leaderboard(bigint, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_track_leaderboards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_track_lap(bigint, text, text, integer, integer[], integer, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_leaderboard(bigint, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_track_leaderboards() TO authenticated;