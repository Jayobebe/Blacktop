-- Tighten direct table reads: only the row owner may select.
DROP POLICY IF EXISTS "world_locations_select" ON public.world_locations;
CREATE POLICY "world_locations_select_own"
  ON public.world_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Coarse, anonymous presence for the World globe.
-- Coordinates are rounded to whole degrees (~111 km) and user_id is dropped so
-- callers can count riders + light up countries without tracking individuals.
CREATE OR REPLACE FUNCTION public.get_world_presence()
RETURNS TABLE (lat double precision, lng double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(lat)::double precision AS lat,
         round(lng)::double precision AS lng
  FROM public.world_locations
  WHERE last_seen > now() - interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.get_world_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_world_presence() TO authenticated;