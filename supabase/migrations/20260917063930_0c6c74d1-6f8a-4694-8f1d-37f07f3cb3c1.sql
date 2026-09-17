ALTER TABLE public.crew_scores ALTER COLUMN hit_heavy TYPE numeric USING hit_heavy::numeric;

DROP FUNCTION IF EXISTS public.list_crew_leaderboard(text);

CREATE FUNCTION public.list_crew_leaderboard(_crew_code text)
RETURNS TABLE(display_name text, total_distance numeric, top_speed numeric, max_lean numeric, ride_count integer, hit_heavy numeric, petrol_head integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.display_name, s.total_distance, s.top_speed, s.max_lean, s.ride_count, s.hit_heavy, s.petrol_head
  FROM public.crew_scores s
  WHERE s.crew_code = _crew_code
$$;