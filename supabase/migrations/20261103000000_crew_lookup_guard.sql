-- Crew codes can't be guessed in bulk any more. Every rider has a crew code (six characters),
-- and the crew lookups (boards, challenges, the month, crew convoys, crew plans) answered any
-- code with no limit, so trying codes found real crews: their members' names and stats, their
-- planned rides and meeting places, and the join codes of their open convoys. Accounts are free,
-- so a per-account limit alone doesn't stop it; what a prober can't avoid is asking about codes
-- that don't exist.
--
-- crew_lookup_ok(code): a code some crew uses (scores, a listed convoy or a plan on it) passes,
-- up to 600 lookups an account in 10 minutes (the app's boards and convoy lists ask far less);
-- one nobody uses is a miss, and an account gets 120 misses an hour. Past either, the lookups
-- answer with nothing (not an error, so a prober can't tell a real crew from an empty one). The
-- lookups are rewritten as plpgsql to ask it first; what they return is unchanged. Safe to run twice.

CREATE OR REPLACE FUNCTION public.crew_lookup_ok(_code text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF auth.uid() IS NULL OR length(c) < 4 THEN
    RETURN false;
  END IF;
  -- Out of misses: real crews go quiet too, so a hit can't stand out from the misses around it.
  IF EXISTS (
    SELECT 1 FROM public.edge_rate_limits r
    WHERE r.user_id = auth.uid() AND r.bucket = 'crew-miss'
      AND r.request_count >= 120 AND now() - r.window_start < interval '3600 seconds'
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.crew_scores s WHERE upper(s.crew_code) = c)
     OR EXISTS (SELECT 1 FROM public.crew_weekly_scores w WHERE upper(w.crew_code) = c)
     OR EXISTS (SELECT 1 FROM public.convoys v WHERE upper(v.crew_code) = c AND v.is_listed)
     OR EXISTS (SELECT 1 FROM public.crew_events e WHERE upper(e.crew_code) = c) THEN
    RETURN public.check_rate_limit('crew-lookup', 600, 600);
  END IF;
  RETURN public.check_rate_limit('crew-miss', 120, 3600);
END;
$$;

REVOKE ALL ON FUNCTION public.crew_lookup_ok(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_crew_convoys(_crew_code text)
RETURNS TABLE (
  id uuid, code text, name text, leader_name text, member_count integer,
  destination_name text, destination_address text, is_riding boolean, created_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.crew_lookup_ok(_crew_code) THEN RETURN; END IF;
  RETURN QUERY
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
END;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_leaderboard(_crew_code text)
RETURNS TABLE(display_name text, total_distance numeric, top_speed numeric, max_lean numeric, ride_count integer, hit_heavy numeric, petrol_head integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.crew_lookup_ok(_crew_code) THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.display_name, s.total_distance, s.top_speed, s.max_lean, s.ride_count, s.hit_heavy, s.petrol_head
  FROM public.crew_scores s
  WHERE s.crew_code = _crew_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_challenge(_crew_code text, _week_key text)
RETURNS TABLE(display_name text, distance numeric, ride_count integer, max_lean numeric, corner_score numeric, top_speed numeric, night_rides integer, longest_ride numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.crew_lookup_ok(_crew_code) THEN RETURN; END IF;
  RETURN QUERY
  SELECT w.display_name, w.distance, w.ride_count, w.max_lean, w.corner_score,
         w.top_speed, w.night_rides, w.longest_ride
  FROM public.crew_weekly_scores w
  WHERE w.crew_code = _crew_code
    AND w.week_key = _week_key
  ORDER BY w.distance DESC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_month(_crew_code text, _month_key text)
RETURNS TABLE(distance numeric, ride_count integer, members integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.crew_lookup_ok(_crew_code) THEN RETURN; END IF;
  RETURN QUERY
  SELECT COALESCE(sum(w.distance), 0)::numeric,
         COALESCE(sum(w.ride_count), 0)::integer,
         count(DISTINCT w.user_id)::integer
  FROM public.crew_weekly_scores w
  WHERE upper(w.crew_code) = upper(_crew_code)
    AND w.week_key IN (
      SELECT DISTINCT w2.week_key FROM public.crew_weekly_scores w2
      WHERE w2.updated_at >= (_month_key || '-01')::date
        AND w2.updated_at < ((_month_key || '-01')::date + interval '1 month')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_crew_events(_crew_codes text[], _from timestamptz, _to timestamptz)
RETURNS TABLE (
  id uuid, crew_code text, kind text, title text, notes text, place_name text, lat double precision, lng double precision,
  route jsonb, starts_at timestamptz, creator_name text, mine boolean, my_status text, going integer, maybe integer, going_names text[]
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  codes text[] := ARRAY[]::text[];
  c text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY coalesce(_crew_codes[1:4], ARRAY[]::text[]) LOOP
    IF public.crew_lookup_ok(c) THEN codes := codes || c; END IF;
  END LOOP;
  IF array_length(codes, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id, e.crew_code, e.kind, e.title, e.notes, e.place_name, e.lat, e.lng, e.route, e.starts_at, e.creator_name,
         e.created_by = auth.uid(),
         (SELECT r.status FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.user_id = auth.uid()),
         (SELECT count(*)::int FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'going'),
         (SELECT count(*)::int FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe'),
         ARRAY(SELECT r.display_name FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'going' ORDER BY r.updated_at LIMIT 12)
  FROM public.crew_events e
  WHERE e.crew_code = ANY (codes)
    AND e.starts_at >= _from AND e.starts_at < _to
    AND _to - _from <= interval '400 days'
  ORDER BY e.starts_at
  LIMIT 200;
END;
$$;

-- Who may call them is unchanged: signed-in riders only.
REVOKE EXECUTE ON FUNCTION public.list_crew_convoys(text), public.list_crew_leaderboard(text), public.list_crew_challenge(text, text),
  public.list_crew_month(text, text), public.list_crew_events(text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_crew_convoys(text), public.list_crew_leaderboard(text), public.list_crew_challenge(text, text),
  public.list_crew_month(text, text), public.list_crew_events(text[], timestamptz, timestamptz) TO authenticated;
