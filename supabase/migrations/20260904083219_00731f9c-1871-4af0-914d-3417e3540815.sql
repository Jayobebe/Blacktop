-- Card drop incentives: collection kickbacks + per-area prestige kings.
ALTER TABLE public.card_drop_collections
  ADD COLUMN IF NOT EXISTS collector_name text NOT NULL DEFAULT 'Rider';

CREATE OR REPLACE FUNCTION public.collect_card_drop(
  _drop_id uuid,
  _lat double precision,
  _lng double precision
)
RETURNS TABLE (
  id uuid,
  owner_name text,
  vehicle_name text,
  make_model text,
  tier text,
  total_rides integer,
  total_distance_mi numeric,
  total_duration_sec integer,
  top_speed_mph numeric,
  max_lean numeric,
  max_g_force numeric,
  photo_path text,
  placement_x numeric,
  placement_y numeric,
  placement_scale numeric,
  card_zoom numeric,
  lat double precision,
  lng double precision
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.card_drops;
  dist_m double precision;
  collector text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO d FROM public.card_drops WHERE public.card_drops.id = _drop_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'drop not found';
  END IF;

  dist_m := 6371000 * acos(
    least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(d.lat)) * cos(radians(d.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(d.lat))
    ))
  );

  IF dist_m > 120 THEN
    RAISE EXCEPTION 'too far from card';
  END IF;

  SELECT COALESCE(p.display_name, 'Rider') INTO collector
  FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.card_drop_collections (drop_id, collector_id, collector_name)
  VALUES (d.id, auth.uid(), COALESCE(collector, 'Rider'))
  ON CONFLICT (drop_id, collector_id) DO NOTHING;

  RETURN QUERY SELECT d.id, d.owner_name, d.vehicle_name, d.make_model, d.tier,
    d.total_rides, d.total_distance_mi, d.total_duration_sec, d.top_speed_mph,
    d.max_lean, d.max_g_force, d.photo_path, d.placement_x, d.placement_y,
    d.placement_scale, d.card_zoom, d.lat, d.lng;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_kickbacks()
RETURNS TABLE (
  id uuid,
  collector_name text,
  vehicle_name text,
  tier text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.collector_name, d.vehicle_name, d.tier, c.created_at
  FROM public.card_drop_collections c
  JOIN public.card_drops d ON d.id = c.drop_id
  WHERE d.owner_id = auth.uid()
  ORDER BY c.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.area_card_kings(
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 50
)
RETURNS TABLE (
  owner_name text,
  collected_count bigint,
  active_drops bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nearby AS (
    SELECT d.id, d.owner_name, d.is_active
    FROM public.card_drops d
    WHERE auth.uid() IS NOT NULL
      AND (
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(_lat)) * cos(radians(d.lat)) * cos(radians(d.lng) - radians(_lng))
            + sin(radians(_lat)) * sin(radians(d.lat))
          ))
        )
      ) <= greatest(1, least(_radius_km, 500))
  )
  SELECT n.owner_name,
         COUNT(c.id) AS collected_count,
         COUNT(*) FILTER (WHERE n.is_active) AS active_drops
  FROM nearby n
  LEFT JOIN public.card_drop_collections c ON c.drop_id = n.id
  GROUP BY n.owner_name
  ORDER BY collected_count DESC, active_drops DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_kickbacks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.area_card_kings(double precision, double precision, double precision) TO authenticated;