-- lovable-cron-fallback-reviewed: privacy TTL for live positions must purge within 15 min; time-based, no row event to hook
-- Privacy retention: positions and speeds that could otherwise sit in Postgres
-- forever when a phone dies, the app crashes or a convoy is never ended.
--
-- 1. world_locations (Blacktop World presence): the phone deletes its row when
--    a ride ends normally; anything not refreshed for 15 minutes goes. (The
--    globe already ignores rows older than 10 minutes.)
-- 2. Abandoned convoys: a convoy over 24 hours old that nobody in it has been
--    heard from for 16 hours is ended. Setting ride_ended_at fires
--    burn_ride_data_on_end(), which deletes its members (positions, speeds),
--    waypoints and messages. The 16-hour quiet check lets a multi-day tour
--    stop overnight without being ended; an abandoned one is gone within ~40 h.
--
-- Both run once now for what's already there, then on pg_cron. Safe to re-run;
-- the schedules are skipped (with a notice) if pg_cron isn't enabled.

CREATE INDEX IF NOT EXISTS world_locations_last_seen_idx ON public.world_locations (last_seen);
CREATE INDEX IF NOT EXISTS convoy_members_convoy_last_seen_idx ON public.convoy_members (convoy_id, last_seen);

-- The backlog, now.
DELETE FROM public.world_locations WHERE last_seen < now() - interval '15 minutes';

UPDATE public.convoys c
   SET ride_ended_at = now(), is_active = false
 WHERE c.ride_ended_at IS NULL
   AND c.created_at < now() - interval '24 hours'
   AND NOT EXISTS (
     SELECT 1 FROM public.convoy_members m
      WHERE m.convoy_id = c.id AND m.last_seen > now() - interval '16 hours'
   );

-- From now on.
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
      WHERE jobname IN ('blacktop-world-locations-cleanup', 'blacktop-abandoned-convoys-scrub');

    PERFORM cron.schedule(
      'blacktop-world-locations-cleanup',
      '*/10 * * * *',
      $job$DELETE FROM public.world_locations WHERE last_seen < now() - interval '15 minutes'$job$
    );

    PERFORM cron.schedule(
      'blacktop-abandoned-convoys-scrub',
      '17 * * * *',
      $job$UPDATE public.convoys c
              SET ride_ended_at = now(), is_active = false
            WHERE c.ride_ended_at IS NULL
              AND c.created_at < now() - interval '24 hours'
              AND NOT EXISTS (
                SELECT 1 FROM public.convoy_members m
                 WHERE m.convoy_id = c.id AND m.last_seen > now() - interval '16 hours'
              )$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled: privacy retention jobs not scheduled';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'privacy retention jobs not scheduled: %', SQLERRM;
END;
$$;
-- An ended convoy keeps no destination. The lobby's End ride already blanked
-- it, but ending from the ride screen, the abandoned-convoy job
-- (20261004000000_privacy_retention_scrub.sql) and older paths only set
-- ride_ended_at, so the destination's name, address and coordinates stayed on
-- the convoy row. Nothing reads an ended convoy's destination (the crew convoy
-- list, crew-convoy pushes, session restore and join-by-code all skip ended or
-- inactive convoys), so it goes whichever way the convoy ends.
--
-- burn_ride_data_on_end() runs BEFORE the update that sets ride_ended_at, so it
-- blanks the destination on NEW as well as deleting members, waypoints and
-- messages. Same function otherwise; its trigger and grants are unchanged.

CREATE OR REPLACE FUNCTION public.burn_ride_data_on_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fires only when ride_ended_at transitions from NULL to a value.
  IF NEW.ride_ended_at IS NOT NULL
     AND (OLD.ride_ended_at IS NULL OR OLD.ride_ended_at IS DISTINCT FROM NEW.ride_ended_at)
  THEN
    -- A finished convoy is no longer joinable/restorable.
    NEW.is_active := false;

    -- Where they were going goes with it.
    NEW.destination_name    := NULL;
    NEW.destination_address := NULL;
    NEW.destination_lat     := NULL;
    NEW.destination_lng     := NULL;
    NEW.destination_set_at  := NULL;

    -- Delete ephemeral coordination and membership data for the burned lobby.
    DELETE FROM public.convoy_messages  WHERE convoy_id = NEW.id;
    DELETE FROM public.convoy_waypoints WHERE convoy_id = NEW.id;
    DELETE FROM public.convoy_members   WHERE convoy_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Convoys deactivated without being ended (a leader leaving, or starting a new
-- convoy, only sets is_active = false) kept their members' positions and
-- speeds until the abandoned-convoy job reached them (~40 h). Nothing ever
-- reactivates a convoy and phones drop out as soon as it goes inactive, so
-- they're ended now (the trigger wipes members, waypoints, messages and the
-- destination) and the hourly job ends them from now on.
UPDATE public.convoys
   SET ride_ended_at = now()
 WHERE ride_ended_at IS NULL
   AND is_active IS NOT TRUE;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'blacktop-abandoned-convoys-scrub';
    PERFORM cron.schedule(
      'blacktop-abandoned-convoys-scrub',
      '17 * * * *',
      $job$UPDATE public.convoys c
              SET ride_ended_at = now(), is_active = false
            WHERE c.ride_ended_at IS NULL
              AND (
                c.is_active IS NOT TRUE
                OR (
                  c.created_at < now() - interval '24 hours'
                  AND NOT EXISTS (
                    SELECT 1 FROM public.convoy_members m
                     WHERE m.convoy_id = c.id AND m.last_seen > now() - interval '16 hours'
                  )
                )
              )$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled: abandoned-convoy job not updated';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'abandoned-convoy job not updated: %', SQLERRM;
END;
$$;

-- Anything left over (ended before the trigger blanked destinations): blank
-- what it kept. (This update doesn't touch ride_ended_at, so no trigger.)
UPDATE public.convoys
   SET destination_name    = NULL,
       destination_address = NULL,
       destination_lat     = NULL,
       destination_lng     = NULL,
       destination_set_at  = NULL
 WHERE (ride_ended_at IS NOT NULL OR is_active IS NOT TRUE)
   AND (destination_name IS NOT NULL OR destination_address IS NOT NULL
        OR destination_lat IS NOT NULL OR destination_lng IS NOT NULL
        OR destination_set_at IS NOT NULL);
-- Peaks a rider keeps private (Public Road Privacy) are stored as NULL, not 0:
-- the app shows them as "--" and leaves them out of rankings and badges, where
-- a 0 would read as a real (and poor) figure. Only the NOT NULL constraints
-- change; defaults stay 0 and existing rows are untouched.

ALTER TABLE public.card_drops
  ALTER COLUMN top_speed_mph DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL,
  ALTER COLUMN max_g_force DROP NOT NULL;

ALTER TABLE public.crew_scores
  ALTER COLUMN top_speed DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL;

-- corner_score comes from lean, so it's private with it.
ALTER TABLE public.crew_weekly_scores
  ALTER COLUMN top_speed DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL,
  ALTER COLUMN corner_score DROP NOT NULL;

-- convoy_members.top_speed already allows NULL (its 0-200 check passes NULL).
-- Riders can be in up to four crews, with their own name for each.
--
-- 1. push_subscriptions: crew_codes (every crew this device's rider is in) and
--    crew_names ({code: the rider's name for it}); crew notifications reach a
--    device in any of its crews and start with that rider's name for the crew.
--    crew_code stays as the active crew (older apps and older code read it).
-- 2. register_push_subscription gains _crew_codes / _crew_names (optional, so
--    older apps calling it the old way keep working).
-- 3. crew_scores: one row per rider per crew (it was one per rider), so a rider
--    can be on every one of their crews' boards.
--
-- The app and send-push work before this runs (active crew only) and pick the
-- new columns up as soon as it has.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS crew_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crew_names jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.push_subscriptions
   SET crew_codes = ARRAY[crew_code]
 WHERE crew_code IS NOT NULL AND crew_codes = '{}';

CREATE INDEX IF NOT EXISTS push_subscriptions_crew_codes_idx ON public.push_subscriptions USING gin (crew_codes);

DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision);

CREATE FUNCTION public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _categories text[] DEFAULT '{}',
  _user_agent text DEFAULT NULL,
  _crew_code text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _crew_codes text[] DEFAULT NULL,
  _crew_names jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_crew text := nullif(left(upper(regexp_replace(coalesce(_crew_code, ''), '[^A-Za-z0-9]', '', 'g')), 10), '');
  v_codes text[];
  v_names jsonb;
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

  -- Up to four crews, cleaned like crew_code; an older app sends only its one.
  SELECT coalesce(array_agg(c), '{}') INTO v_codes FROM (
    SELECT DISTINCT c FROM (
      SELECT nullif(left(upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')), 10), '') AS c
        FROM unnest(coalesce(_crew_codes, ARRAY[v_crew])) AS x
    ) s WHERE c IS NOT NULL AND length(c) >= 4
    LIMIT 4
  ) t;
  IF v_crew IS NULL AND array_length(v_codes, 1) > 0 THEN v_crew := v_codes[1]; END IF;

  -- The rider's names, only for their crews, 30 characters at most.
  SELECT coalesce(jsonb_object_agg(upper(k), left(btrim(v), 30)), '{}'::jsonb) INTO v_names
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(_crew_names) = 'object' THEN _crew_names ELSE '{}'::jsonb END) AS e(k, v)
   WHERE upper(k) = ANY(v_codes) AND length(btrim(v)) > 0;

  -- Location is only ever stored rounded to 0.1° (about 11 km).
  INSERT INTO public.push_subscriptions
    (user_id, endpoint, p256dh, auth, categories, user_agent, crew_code, crew_codes, crew_names, weather_lat, weather_lng, weather_at)
  VALUES (
    v_user_id, _endpoint, _p256dh, _auth, coalesce(_categories, '{}'), left(_user_agent, 300), v_crew, v_codes, v_names,
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
    crew_codes = EXCLUDED.crew_codes,
    crew_names = EXCLUDED.crew_names,
    -- Keep the last location when this call didn't send one, unless both
    -- features that use it (weather alerts, helping nearby riders) are off.
    weather_lat = CASE WHEN v_has_loc THEN EXCLUDED.weather_lat
                       WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_lat END,
    weather_lng = CASE WHEN v_has_loc THEN EXCLUDED.weather_lng
                       WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_lng END,
    weather_at = CASE WHEN v_has_loc THEN EXCLUDED.weather_at
                      WHEN EXCLUDED.categories && ARRAY['weather', 'rescue_nearby'] THEN push_subscriptions.weather_at END,
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

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text[], text, text, double precision, double precision, text[], jsonb) TO authenticated;

-- One board row per rider per crew.
ALTER TABLE public.crew_scores DROP CONSTRAINT IF EXISTS crew_scores_pkey;
ALTER TABLE public.crew_scores ADD PRIMARY KEY (user_id, crew_code);