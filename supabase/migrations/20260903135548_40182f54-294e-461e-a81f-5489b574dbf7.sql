CREATE TABLE public.crew_weekly_scores (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  crew_code text NOT NULL,
  display_name text NOT NULL DEFAULT 'Rider',
  distance numeric NOT NULL DEFAULT 0,
  ride_count integer NOT NULL DEFAULT 0,
  max_lean numeric NOT NULL DEFAULT 0,
  corner_score numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_key, crew_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_weekly_scores TO authenticated;
GRANT ALL ON public.crew_weekly_scores TO service_role;

ALTER TABLE public.crew_weekly_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_weekly_scores_own_all ON public.crew_weekly_scores
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.list_crew_challenge(_crew_code text, _week_key text)
RETURNS TABLE(display_name text, distance numeric, ride_count integer, max_lean numeric, corner_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.display_name, w.distance, w.ride_count, w.max_lean, w.corner_score
  FROM public.crew_weekly_scores w
  WHERE w.crew_code = _crew_code
    AND w.week_key = _week_key
  ORDER BY w.distance DESC
  LIMIT 50;
$$;