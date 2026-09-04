CREATE TABLE public.card_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  copy_index integer NOT NULL DEFAULT 0,
  crew_code text NOT NULL,
  owner_name text NOT NULL DEFAULT 'Rider',
  vehicle_name text NOT NULL,
  make_model text,
  tier text NOT NULL DEFAULT 'locked',
  total_rides integer NOT NULL DEFAULT 0,
  total_distance_mi numeric NOT NULL DEFAULT 0,
  total_duration_sec integer NOT NULL DEFAULT 0,
  top_speed_mph numeric NOT NULL DEFAULT 0,
  max_lean numeric NOT NULL DEFAULT 0,
  max_g_force numeric NOT NULL DEFAULT 0,
  photo_path text,
  placement_x numeric NOT NULL DEFAULT 50,
  placement_y numeric NOT NULL DEFAULT 50,
  placement_scale numeric NOT NULL DEFAULT 100,
  card_zoom numeric NOT NULL DEFAULT 1,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  visibility text NOT NULL DEFAULT 'world',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_drops TO authenticated;
GRANT ALL ON public.card_drops TO service_role;

ALTER TABLE public.card_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own card drops"
ON public.card_drops FOR ALL TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX card_drops_geo_idx ON public.card_drops (lat, lng) WHERE is_active;
CREATE INDEX card_drops_owner_idx ON public.card_drops (owner_id);

CREATE TABLE public.card_drop_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid NOT NULL REFERENCES public.card_drops(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drop_id, collector_id)
);

GRANT SELECT, INSERT ON public.card_drop_collections TO authenticated;
GRANT ALL ON public.card_drop_collections TO service_role;

ALTER TABLE public.card_drop_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collectors read their own collections"
ON public.card_drop_collections FOR SELECT TO authenticated
USING (auth.uid() = collector_id);

CREATE POLICY "Collectors record their own collections"
ON public.card_drop_collections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = collector_id);

CREATE OR REPLACE FUNCTION public.card_drops_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER card_drops_updated_at
BEFORE UPDATE ON public.card_drops
FOR EACH ROW EXECUTE FUNCTION public.card_drops_touch();

CREATE OR REPLACE FUNCTION public.list_card_drops(
  _lat double precision,
  _lng double precision,
  _radius_km double precision,
  _crew_code text
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
  lng double precision,
  is_own boolean,
  collected boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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

  INSERT INTO public.card_drop_collections (drop_id, collector_id)
  VALUES (d.id, auth.uid())
  ON CONFLICT (drop_id, collector_id) DO NOTHING;

  RETURN QUERY SELECT d.id, d.owner_name, d.vehicle_name, d.make_model, d.tier,
    d.total_rides, d.total_distance_mi, d.total_duration_sec, d.top_speed_mph,
    d.max_lean, d.max_g_force, d.photo_path, d.placement_x, d.placement_y,
    d.placement_scale, d.card_zoom, d.lat, d.lng;
END;
$$;