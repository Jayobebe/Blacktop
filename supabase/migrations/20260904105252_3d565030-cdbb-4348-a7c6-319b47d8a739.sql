ALTER TABLE public.card_drops
  ADD COLUMN IF NOT EXISTS challenge_route jsonb,
  ADD COLUMN IF NOT EXISTS challenge_time_sec integer,
  ADD COLUMN IF NOT EXISTS challenge_distance_mi numeric,
  ADD COLUMN IF NOT EXISTS challenge_finish_lat double precision,
  ADD COLUMN IF NOT EXISTS challenge_finish_lng double precision,
  ADD COLUMN IF NOT EXISTS challenge_set_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.card_challenge_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid NOT NULL REFERENCES public.card_drops(id) ON DELETE CASCADE,
  challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenger_name text NOT NULL DEFAULT 'Rider',
  time_sec integer NOT NULL DEFAULT 0,
  result text NOT NULL DEFAULT 'lost',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.card_challenge_attempts TO authenticated;
GRANT ALL ON public.card_challenge_attempts TO service_role;

ALTER TABLE public.card_challenge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challengers record their own attempts"
  ON public.card_challenge_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Challengers and drop owners read attempts"
  ON public.card_challenge_attempts FOR SELECT TO authenticated
  USING (
    auth.uid() = challenger_id
    OR EXISTS (
      SELECT 1 FROM public.card_drops d
      WHERE d.id = card_challenge_attempts.drop_id AND d.owner_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS card_challenge_attempts_drop_idx
  ON public.card_challenge_attempts (drop_id);

DROP FUNCTION IF EXISTS public.list_card_drops(double precision, double precision, double precision, text);

CREATE OR REPLACE FUNCTION public.list_card_drops(_lat double precision, _lng double precision, _radius_km double precision, _crew_code text)
 RETURNS TABLE(id uuid, owner_name text, vehicle_name text, make_model text, tier text, total_rides integer, total_distance_mi numeric, total_duration_sec integer, top_speed_mph numeric, max_lean numeric, max_g_force numeric, photo_path text, placement_x numeric, placement_y numeric, placement_scale numeric, card_zoom numeric, lat double precision, lng double precision, is_own boolean, collected boolean, created_at timestamp with time zone, challenge_route jsonb, challenge_time_sec integer, challenge_distance_mi numeric, challenge_finish_lat double precision, challenge_finish_lng double precision)
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
         d.created_at,
         d.challenge_route, d.challenge_time_sec, d.challenge_distance_mi,
         d.challenge_finish_lat, d.challenge_finish_lng
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