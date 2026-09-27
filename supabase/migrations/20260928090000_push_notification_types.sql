-- Notification types for send-push:
--   * each device records its crew and (for weather alerts) a rounded location
--   * events from the database queue up in push_outbox (via triggers) and the
--     send-push function sends them; pg_net nudges it immediately and pg_cron
--     runs its scheduled checks (weather, reminders, crew results) every 10 min
--   * push_sent de-duplicates, push_reminders holds time-based reminders
-- Nothing here is readable by clients; send-push uses the service role.

-- ── Devices: crew + rounded weather location ─────────────────────────────────

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS crew_code text,
  ADD COLUMN IF NOT EXISTS weather_lat numeric(4, 1),
  ADD COLUMN IF NOT EXISTS weather_lng numeric(4, 1),
  ADD COLUMN IF NOT EXISTS weather_at timestamptz;

CREATE INDEX IF NOT EXISTS push_subscriptions_crew_idx ON public.push_subscriptions (crew_code);

DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text[], text);

CREATE FUNCTION public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _categories text[] DEFAULT '{}',
  _user_agent text DEFAULT NULL,
  _crew_code text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_crew text := nullif(left(upper(regexp_replace(coalesce(_crew_code, ''), '[^A-Za-z0-9]', '', 'g')), 10), '');
  v_has_loc boolean := _lat IS NOT NULL AND _lng IS NOT NULL
    AND _lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT public.is_push_service_endpoint(_endpoint) THEN
    RAISE EXCEPTION 'unsupported push endpoint';
  END IF;
  IF length(_p256dh) > 200 OR length(_auth) > 100 OR coalesce(array_length(_categories, 1), 0) > 20 THEN
    RAISE EXCEPTION 'invalid subscription';
  END IF;

  -- Location is only ever stored rounded to 0.1° (about 11 km).
  INSERT INTO public.push_subscriptions
    (user_id, endpoint, p256dh, auth, categories, user_agent, crew_code, weather_lat, weather_lng, weather_at)
  VALUES (
    v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300), v_crew,
    CASE WHEN v_has_loc THEN round(_lat::numeric, 1) END,
    CASE WHEN v_has_loc THEN round(_lng::numeric, 1) END,
    CASE WHEN v_has_loc THEN now() END
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    categories = EXCLUDED.categories,
    user_agent = EXCLUDED.user_agent,
    crew_code = EXCLUDED.crew_code,
    -- Keep the last location when this call didn't send one, unless weather
    -- alerts were switched off (then forget it).
    weather_lat = CASE WHEN v_has_loc THEN EXCLUDED.weather_lat
                       WHEN 'weather' = ANY (EXCLUDED.categories) THEN push_subscriptions.weather_lat END,
    weather_lng = CASE WHEN v_has_loc THEN EXCLUDED.weather_lng
                       WHEN 'weather' = ANY (EXCLUDED.categories) THEN push_subscriptions.weather_lng END,
    weather_at = CASE WHEN v_has_loc THEN EXCLUDED.weather_at
                      WHEN 'weather' = ANY (EXCLUDED.categories) THEN push_subscriptions.weather_at END,
    updated_at = now();

  DELETE FROM public.push_subscriptions
  WHERE user_id = v_user_id
    AND id NOT IN (
      SELECT id FROM public.push_subscriptions
      WHERE user_id = v_user_id
      ORDER BY updated_at DESC
      LIMIT 10
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision) TO authenticated;

-- ── Settings for the sender ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_config (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM PUBLIC, anon, authenticated;

-- The send-push function's address (the project ref is public; change it here
-- if the project ever moves).
INSERT INTO public.push_config (key, value)
VALUES ('function_url', 'https://xwagsaqsomzrubfpjaad.supabase.co/functions/v1/send-push')
ON CONFLICT (key) DO NOTHING;

-- ── De-duplication ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_sent (
  key text PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_sent FROM PUBLIC, anon, authenticated;

-- True the first time a key is seen; with a cooldown, true again once that
-- long has passed since the last time.
CREATE OR REPLACE FUNCTION public.push_mark_once(_key text, _cooldown_seconds integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_sent (key) VALUES (_key) ON CONFLICT (key) DO NOTHING;
  IF FOUND THEN
    RETURN true;
  END IF;
  IF _cooldown_seconds IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.push_sent SET sent_at = now()
  WHERE key = _key AND sent_at < now() - make_interval(secs => _cooldown_seconds);
  RETURN FOUND;
END;
$$;

-- ── Event outbox ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_outbox (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_outbox_pending_idx ON public.push_outbox (id) WHERE claimed_at IS NULL;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM PUBLIC, anon, authenticated;

-- Hands pending events to exactly one sender run.
CREATE OR REPLACE FUNCTION public.claim_push_outbox(_limit integer DEFAULT 100)
RETURNS SETOF public.push_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.push_outbox o SET claimed_at = now()
  WHERE o.id IN (
    SELECT id FROM public.push_outbox
    WHERE claimed_at IS NULL
    ORDER BY id
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.*;
$$;

-- Wakes send-push through pg_net when it's available. Never fails the
-- caller's transaction: if it can't, the 10-minute schedule picks it up.
CREATE OR REPLACE FUNCTION public.push_call(_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  SELECT value INTO v_url FROM public.push_config WHERE key = 'function_url';
  IF v_url IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING v_url, jsonb_build_object('action', _action), '{"Content-Type": "application/json"}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'push_call(%) failed: %', _action, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_enqueue(_kind text, _payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_outbox (kind, payload) VALUES (_kind, _payload);
  PERFORM public.push_call('drain');
END;
$$;

-- Scheduled checks (weather, reminders, crew results); send-push throttles itself.
CREATE OR REPLACE FUNCTION public.push_tick()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.push_call('tick');
$$;

-- ── Time-based reminders (maintenance) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL,
  key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  due_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS push_reminders_due_idx ON public.push_reminders (due_at) WHERE sent_at IS NULL;
ALTER TABLE public.push_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_reminders FROM PUBLIC, anon, authenticated;

-- Replaces this rider's pending reminders of one kind (only ever sent to them).
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
  IF _category NOT IN ('maintenance') THEN
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

REVOKE ALL ON FUNCTION public.push_mark_once(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_call(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_enqueue(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_mark_once(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(integer) TO service_role;
GRANT ALL ON public.push_subscriptions, public.push_outbox, public.push_sent, public.push_reminders, public.push_config TO service_role;
GRANT USAGE ON SEQUENCE public.push_outbox_id_seq TO service_role;

-- ── Event triggers ──────────────────────────────────────────────────────────

-- Someone raced a dropped card's time attack.
CREATE OR REPLACE FUNCTION public.push_on_card_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('card_attempt', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_card_attempt ON public.card_challenge_attempts;
CREATE TRIGGER push_card_attempt AFTER INSERT ON public.card_challenge_attempts
  FOR EACH ROW EXECUTE FUNCTION public.push_on_card_attempt();

-- Someone picked up (collected) a dropped card.
CREATE OR REPLACE FUNCTION public.push_on_card_collected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('card_collected', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_card_collected ON public.card_drop_collections;
CREATE TRIGGER push_card_collected AFTER INSERT ON public.card_drop_collections
  FOR EACH ROW EXECUTE FUNCTION public.push_on_card_collected();

-- Blacktank: new request, status changes, pledges, payouts.
CREATE OR REPLACE FUNCTION public.push_on_tank_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.push_enqueue('tank_request', jsonb_build_object('id', NEW.id));
  ELSE
    PERFORM public.push_enqueue('tank_status', jsonb_build_object('id', NEW.id, 'status', NEW.status, 'actor', auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_tank_request_insert ON public.blacktank_requests;
CREATE TRIGGER push_tank_request_insert AFTER INSERT ON public.blacktank_requests
  FOR EACH ROW EXECUTE FUNCTION public.push_on_tank_request();
DROP TRIGGER IF EXISTS push_tank_request_status ON public.blacktank_requests;
CREATE TRIGGER push_tank_request_status AFTER UPDATE OF status ON public.blacktank_requests
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.push_on_tank_request();

CREATE OR REPLACE FUNCTION public.push_on_tank_pledge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('tank_pledge', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_tank_pledge ON public.blacktank_pledges;
CREATE TRIGGER push_tank_pledge AFTER INSERT ON public.blacktank_pledges
  FOR EACH ROW EXECUTE FUNCTION public.push_on_tank_pledge();

CREATE OR REPLACE FUNCTION public.push_on_tank_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('tank_settlement', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_tank_settlement ON public.blacktank_settlements;
CREATE TRIGGER push_tank_settlement AFTER INSERT ON public.blacktank_settlements
  FOR EACH ROW EXECUTE FUNCTION public.push_on_tank_settlement();

-- Crew board: whoever this update just passed, per metric. Joining or moving
-- crew never counts as passing anyone.
CREATE OR REPLACE FUNCTION public.push_on_crew_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.crew_scores;
  v_metrics text[];
BEGIN
  IF OLD.crew_code IS DISTINCT FROM NEW.crew_code THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT * FROM public.crew_scores s
    WHERE s.crew_code = NEW.crew_code AND s.user_id <> NEW.user_id
  LOOP
    v_metrics := ARRAY[]::text[];
    IF r.total_distance > 0 AND NEW.total_distance > r.total_distance AND OLD.total_distance <= r.total_distance THEN
      v_metrics := v_metrics || 'distance'::text; END IF;
    IF r.top_speed > 0 AND NEW.top_speed > r.top_speed AND OLD.top_speed <= r.top_speed THEN
      v_metrics := v_metrics || 'top_speed'::text; END IF;
    IF r.max_lean > 0 AND NEW.max_lean > r.max_lean AND OLD.max_lean <= r.max_lean THEN
      v_metrics := v_metrics || 'max_lean'::text; END IF;
    IF r.ride_count > 0 AND NEW.ride_count > r.ride_count AND OLD.ride_count <= r.ride_count THEN
      v_metrics := v_metrics || 'ride_count'::text; END IF;
    IF r.hit_heavy > 0 AND NEW.hit_heavy > r.hit_heavy AND OLD.hit_heavy <= r.hit_heavy THEN
      v_metrics := v_metrics || 'hit_heavy'::text; END IF;
    IF r.petrol_head > 0 AND NEW.petrol_head > r.petrol_head AND OLD.petrol_head <= r.petrol_head THEN
      v_metrics := v_metrics || 'petrol_head'::text; END IF;
    IF array_length(v_metrics, 1) > 0 THEN
      PERFORM public.push_enqueue('crew_overtake', jsonb_build_object(
        'by', NEW.user_id, 'by_name', NEW.display_name, 'victim', r.user_id,
        'crew', NEW.crew_code, 'metrics', to_jsonb(v_metrics)));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_crew_scores ON public.crew_scores;
CREATE TRIGGER push_crew_scores AFTER UPDATE ON public.crew_scores
  FOR EACH ROW
  WHEN ((NEW.total_distance, NEW.top_speed, NEW.max_lean, NEW.ride_count, NEW.hit_heavy, NEW.petrol_head)
        IS DISTINCT FROM (OLD.total_distance, OLD.top_speed, OLD.max_lean, OLD.ride_count, OLD.hit_heavy, OLD.petrol_head))
  EXECUTE FUNCTION public.push_on_crew_scores();

-- Weekly challenge progress (targets, and the crew's monthly goal).
CREATE OR REPLACE FUNCTION public.push_on_crew_week()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_enqueue('crew_week', jsonb_build_object(
    'user', NEW.user_id, 'crew', NEW.crew_code, 'week', NEW.week_key));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_crew_week_insert ON public.crew_weekly_scores;
CREATE TRIGGER push_crew_week_insert AFTER INSERT ON public.crew_weekly_scores
  FOR EACH ROW EXECUTE FUNCTION public.push_on_crew_week();
DROP TRIGGER IF EXISTS push_crew_week_update ON public.crew_weekly_scores;
CREATE TRIGGER push_crew_week_update AFTER UPDATE ON public.crew_weekly_scores
  FOR EACH ROW
  WHEN ((NEW.distance, NEW.ride_count, NEW.max_lean, NEW.corner_score, NEW.top_speed, NEW.night_rides, NEW.longest_ride)
        IS DISTINCT FROM (OLD.distance, OLD.ride_count, OLD.max_lean, OLD.corner_score, OLD.top_speed, OLD.night_rides, OLD.longest_ride))
  EXECUTE FUNCTION public.push_on_crew_week();

-- A convoy unlocked for the crew.
CREATE OR REPLACE FUNCTION public.push_on_crew_convoy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_listed AND NEW.crew_code IS NOT NULL AND NEW.ride_ended_at IS NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.is_listed OR OLD.crew_code IS DISTINCT FROM NEW.crew_code) THEN
    PERFORM public.push_enqueue('crew_convoy', jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS push_crew_convoy ON public.convoys;
CREATE TRIGGER push_crew_convoy AFTER INSERT OR UPDATE OF is_listed, crew_code ON public.convoys
  FOR EACH ROW EXECUTE FUNCTION public.push_on_crew_convoy();

REVOKE ALL ON FUNCTION public.push_on_card_attempt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_card_collected() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_tank_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_tank_pledge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_tank_settlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_crew_scores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_crew_week() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_crew_convoy() FROM PUBLIC, anon, authenticated;

-- ── Background plumbing: pg_net (instant sends) + pg_cron (every 10 min) ──────
-- Each step is optional: if an extension can't be enabled here, the migration
-- still succeeds and the setup guide covers switching it on.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net not enabled: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not enabled: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'blacktop-push-tick';
    PERFORM cron.schedule('blacktop-push-tick', '*/10 * * * *', 'SELECT public.push_tick()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'push schedule not created: %', SQLERRM;
END;
$$;
