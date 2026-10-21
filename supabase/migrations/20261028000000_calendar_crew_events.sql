-- Blacktop Calendar (src/features/calendar).
--
-- 1. Dated reminders of kind 'calendar' (the rider's own plans, MOT / insurance /
--    tax reminders, Track Day bookings), sent by send-push's tick like
--    maintenance ones.
-- 2. Crew plans: a ride or a meet put on a crew's calendar, with who's going.
--    Anyone holding the crew's code sees them (as with crew convoys). RLS on and
--    no policies: everything goes through the functions below. Rows cascade from
--    auth.users, so Burn removes a rider's plans and answers; a plan goes a week
--    after its start (hourly).

-- ── 1. Calendar reminders ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_push_reminders(_category text, _reminders jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF _category NOT IN ('maintenance', 'calendar') THEN
    RAISE EXCEPTION 'unknown reminder kind';
  END IF;
  IF jsonb_typeof(_reminders) <> 'array' OR jsonb_array_length(_reminders) > 200 THEN
    RAISE EXCEPTION 'invalid reminders';
  END IF;

  DELETE FROM public.push_reminders r
  WHERE r.user_id = v_user_id AND r.category = _category AND r.sent_at IS NULL
    AND r.key NOT IN (SELECT x ->> 'key' FROM jsonb_array_elements(_reminders) x WHERE x ->> 'key' IS NOT NULL);

  INSERT INTO public.push_reminders (user_id, category, key, title, body, url, due_at)
  SELECT v_user_id, _category, left(x.key, 200), left(x.title, 120), left(x.body, 300),
         CASE WHEN x.url LIKE '/%' THEN left(x.url, 200) END, x.due_at
  FROM jsonb_to_recordset(_reminders) AS x(key text, title text, body text, url text, due_at timestamptz)
  WHERE x.key IS NOT NULL AND x.title IS NOT NULL AND x.body IS NOT NULL
    AND x.due_at > now() - interval '1 day' AND x.due_at < now() + interval '5 years'
  ON CONFLICT (user_id, key) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    url = EXCLUDED.url,
    due_at = EXCLUDED.due_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_push_reminders(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_push_reminders(text, jsonb) TO authenticated;

-- ── 2. Crew plans ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crew_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_code text NOT NULL CHECK (crew_code ~ '^[A-Z0-9]{4,12}$'),
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  creator_name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('ride', 'meet')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
  place_name text NOT NULL DEFAULT '' CHECK (length(place_name) <= 120),
  lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  -- A ride's plan: its stops and end, as the app routes them (at most 25 points).
  route jsonb CHECK (route IS NULL OR (jsonb_typeof(route) = 'array' AND jsonb_array_length(route) <= 26)),
  starts_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crew_events_crew_start ON public.crew_events (crew_code, starts_at);

CREATE TABLE IF NOT EXISTS public.crew_event_rsvps (
  event_id uuid NOT NULL REFERENCES public.crew_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('going', 'maybe', 'no')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.crew_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_event_rsvps ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.crew_events, public.crew_event_rsvps TO service_role;

-- The plans of these crews between two times, with who's going and this rider's own answer.
CREATE OR REPLACE FUNCTION public.list_crew_events(_crew_codes text[], _from timestamptz, _to timestamptz)
RETURNS TABLE (
  id uuid, crew_code text, kind text, title text, notes text, place_name text, lat double precision, lng double precision,
  route jsonb, starts_at timestamptz, creator_name text, mine boolean, my_status text, going integer, maybe integer, going_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.crew_code, e.kind, e.title, e.notes, e.place_name, e.lat, e.lng, e.route, e.starts_at, e.creator_name,
         e.created_by = auth.uid(),
         (SELECT r.status FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.user_id = auth.uid()),
         (SELECT count(*)::int FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'going'),
         (SELECT count(*)::int FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe'),
         ARRAY(SELECT r.display_name FROM public.crew_event_rsvps r WHERE r.event_id = e.id AND r.status = 'going' ORDER BY r.updated_at LIMIT 12)
  FROM public.crew_events e
  WHERE auth.uid() IS NOT NULL
    AND e.crew_code = ANY (_crew_codes[1:4])
    AND e.starts_at >= _from AND e.starts_at < _to
    AND _to - _from <= interval '400 days'
  ORDER BY e.starts_at
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.create_crew_event(
  _crew_code text, _kind text, _title text, _notes text, _place_name text,
  _lat double precision, _lng double precision, _route jsonb, _starts_at timestamptz, _creator_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT public.check_rate_limit('crew_event', 10, 3600) THEN RAISE EXCEPTION 'too many plans'; END IF;
  IF _starts_at < now() - interval '1 hour' OR _starts_at > now() + interval '1 year' THEN RAISE EXCEPTION 'bad time'; END IF;
  INSERT INTO public.crew_events (crew_code, created_by, creator_name, kind, title, notes, place_name, lat, lng, route, starts_at)
  VALUES (upper(_crew_code), v_user, left(coalesce(_creator_name, ''), 40), _kind, left(trim(_title), 80), left(coalesce(_notes, ''), 300),
          left(coalesce(_place_name, ''), 120), _lat, _lng, _route, _starts_at)
  RETURNING id INTO v_id;
  -- The one who made it is going.
  INSERT INTO public.crew_event_rsvps (event_id, user_id, display_name, status)
  VALUES (v_id, v_user, left(coalesce(_creator_name, ''), 40), 'going');
  RETURN v_id;
END;
$$;

-- Only the one who made it can take it off.
CREATE OR REPLACE FUNCTION public.delete_crew_event(_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH gone AS (DELETE FROM public.crew_events WHERE id = _id AND created_by = auth.uid() RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM gone);
$$;

CREATE OR REPLACE FUNCTION public.rsvp_crew_event(_id uuid, _status text, _display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _status NOT IN ('going', 'maybe', 'no') THEN RAISE EXCEPTION 'bad answer'; END IF;
  IF NOT public.check_rate_limit('crew_event_rsvp', 60, 3600) THEN RAISE EXCEPTION 'too many answers'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_events WHERE id = _id) THEN RAISE EXCEPTION 'no such plan'; END IF;
  INSERT INTO public.crew_event_rsvps (event_id, user_id, display_name, status, updated_at)
  VALUES (_id, auth.uid(), left(coalesce(_display_name, ''), 40), _status, now())
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, display_name = EXCLUDED.display_name, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.list_crew_events(text[], timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_crew_event(text, text, text, text, text, double precision, double precision, jsonb, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_crew_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rsvp_crew_event(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_crew_events(text[], timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_crew_event(text, text, text, text, text, double precision, double precision, jsonb, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_crew_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rsvp_crew_event(uuid, text, text) TO authenticated;

-- A new plan tells the crew (send-push 'crew_event'); the evening-before reminder is send-push's tick.
CREATE OR REPLACE FUNCTION public.push_on_crew_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('crew_event', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_crew_event ON public.crew_events;
CREATE TRIGGER push_crew_event AFTER INSERT ON public.crew_events
  FOR EACH ROW EXECUTE FUNCTION public.push_on_crew_event();
REVOKE ALL ON FUNCTION public.push_on_crew_event() FROM PUBLIC, anon, authenticated;

-- Hourly: a plan goes a week after it started (its answers with it).
DO $$
BEGIN
  PERFORM cron.schedule('blacktop-crew-events-cleanup', '41 * * * *', $q$DELETE FROM public.crew_events WHERE starts_at < now() - interval '7 days'$q$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available: crew plans will not be tidied automatically';
END;
$$;
