ALTER TABLE public.convoys ADD COLUMN IF NOT EXISTS crew_code text;
ALTER TABLE public.convoys ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.crew_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  crew_code text NOT NULL,
  display_name text NOT NULL DEFAULT 'Rider',
  total_distance numeric NOT NULL DEFAULT 0,
  top_speed numeric NOT NULL DEFAULT 0,
  max_lean numeric NOT NULL DEFAULT 0,
  ride_count integer NOT NULL DEFAULT 0,
  hit_heavy integer NOT NULL DEFAULT 0,
  petrol_head integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_scores TO authenticated;
GRANT ALL ON public.crew_scores TO service_role;
ALTER TABLE public.crew_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_scores_own_all" ON public.crew_scores;
CREATE POLICY "crew_scores_own_all" ON public.crew_scores
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS crew_scores_crew_idx ON public.crew_scores (crew_code);
CREATE INDEX IF NOT EXISTS convoys_crew_listed_idx ON public.convoys (crew_code) WHERE is_listed;

CREATE OR REPLACE FUNCTION public.list_crew_convoys(_crew_code text)
RETURNS TABLE (
  id uuid, code text, name text, leader_name text, member_count integer,
  destination_name text, destination_address text, is_riding boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.code, c.name,
         COALESCE(p.display_name, 'Unknown'),
         (SELECT count(*)::int FROM public.convoy_members m WHERE m.convoy_id = c.id),
         c.destination_name, c.destination_address,
         (c.ride_started_at IS NOT NULL AND c.ride_ended_at IS NULL),
         c.created_at
  FROM public.convoys c
  LEFT JOIN public.profiles p ON p.id = c.leader_id
  WHERE c.is_listed
    AND COALESCE(c.is_active, false)
    AND c.ride_ended_at IS NULL
    AND upper(c.crew_code) = upper(_crew_code)
  ORDER BY c.created_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.crew_convoy_detail(_convoy_id uuid)
RETURNS TABLE (
  member_name text, is_leader boolean, lat numeric, lng numeric, top_speed numeric, distance_driven numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.display_name, 'Rider'),
         (m.user_id = c.leader_id),
         round(m.current_lat::numeric, 2),
         round(m.current_lng::numeric, 2),
         m.top_speed::numeric,
         m.distance_driven::numeric
  FROM public.convoy_members m
  JOIN public.convoys c ON c.id = m.convoy_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.convoy_id = _convoy_id AND c.is_listed
  ORDER BY (m.user_id = c.leader_id) DESC, m.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_leaderboard(_crew_code text)
RETURNS TABLE (
  display_name text, total_distance numeric, top_speed numeric, max_lean numeric,
  ride_count integer, hit_heavy integer, petrol_head integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.display_name, s.total_distance, s.top_speed, s.max_lean,
         s.ride_count, s.hit_heavy, s.petrol_head
  FROM public.crew_scores s
  WHERE upper(s.crew_code) = upper(_crew_code)
  ORDER BY s.total_distance DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.list_crew_convoys(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.crew_convoy_detail(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_crew_leaderboard(text) TO authenticated, anon;