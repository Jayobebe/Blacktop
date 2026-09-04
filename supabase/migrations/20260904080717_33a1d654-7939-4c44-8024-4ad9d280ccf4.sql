ALTER TABLE public.crew_weekly_scores
  ADD COLUMN IF NOT EXISTS top_speed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_rides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_ride numeric NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.list_crew_challenge(text, text);

CREATE FUNCTION public.list_crew_challenge(_crew_code text, _week_key text)
RETURNS TABLE(display_name text, distance numeric, ride_count integer, max_lean numeric, corner_score numeric, top_speed numeric, night_rides integer, longest_ride numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT w.display_name, w.distance, w.ride_count, w.max_lean, w.corner_score,
         w.top_speed, w.night_rides, w.longest_ride
  FROM public.crew_weekly_scores w
  WHERE w.crew_code = _crew_code
    AND w.week_key = _week_key
  ORDER BY w.distance DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_month(_crew_code text, _month_key text)
RETURNS TABLE(distance numeric, ride_count integer, members integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(w.distance), 0)::numeric AS distance,
         COALESCE(sum(w.ride_count), 0)::integer AS ride_count,
         count(DISTINCT w.user_id)::integer AS members
  FROM public.crew_weekly_scores w
  WHERE upper(w.crew_code) = upper(_crew_code)
    AND w.week_key IN (
      SELECT DISTINCT w2.week_key FROM public.crew_weekly_scores w2
      WHERE w2.updated_at >= (_month_key || '-01')::date
        AND w2.updated_at < ((_month_key || '-01')::date + interval '1 month')
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_crew_challenge(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crew_month(text, text) TO authenticated;