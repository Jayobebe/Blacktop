-- Time attacks move to Track Day, off public roads.
--
-- 1. Card challenges (a time attack recorded on a public road and attached to
--    a dropped card) are removed: their columns on card_drops, the attempts
--    table and its push trigger go, and list_card_drops is recreated without
--    them. Card drops themselves are unchanged. Spectre cards already earned
--    live on riders' phones and are kept there.
--
-- 2. Track records, for riders who opt in (Settings → Your Blacktop → Track Day
--    leaderboards): each rider's best lap on a circuit library layout (an
--    OpenStreetMap circuit relation), per direction and vehicle class, is kept
--    for others to beat. Beating a rider's time collects their dog tag (a
--    Spectre of their card, on the beater's phone) and tells them by push.
--    Beating them again after they've improved collects a new one.
--
-- Rows cascade from auth.users (Burn removes them); clients never read the
-- tables directly, only through the functions below.

-- ── 1. card challenges out ───────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.card_challenge_attempts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS push_card_attempt ON public.card_challenge_attempts;
    DROP TABLE public.card_challenge_attempts;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.push_on_card_attempt();
DELETE FROM public.push_outbox WHERE kind = 'card_attempt';

DROP FUNCTION IF EXISTS public.list_card_drops(double precision, double precision, double precision, text);

ALTER TABLE public.card_drops
  DROP COLUMN IF EXISTS challenge_route,
  DROP COLUMN IF EXISTS challenge_time_sec,
  DROP COLUMN IF EXISTS challenge_distance_mi,
  DROP COLUMN IF EXISTS challenge_finish_lat,
  DROP COLUMN IF EXISTS challenge_finish_lng,
  DROP COLUMN IF EXISTS challenge_set_at;

CREATE FUNCTION public.list_card_drops(_lat double precision, _lng double precision, _radius_km double precision, _crew_code text)
 RETURNS TABLE(id uuid, owner_name text, vehicle_name text, make_model text, tier text, total_rides integer, total_distance_mi numeric, total_duration_sec integer, top_speed_mph numeric, max_lean numeric, max_g_force numeric, photo_path text, placement_x numeric, placement_y numeric, placement_scale numeric, card_zoom numeric, lat double precision, lng double precision, is_own boolean, collected boolean, created_at timestamp with time zone)
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
         d.created_at
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

REVOKE ALL ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) TO authenticated;

-- ── 2. track records ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.track_records (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  osm_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('cw', 'ccw')),
  vehicle_class text NOT NULL CHECK (vehicle_class IN ('motorcycle', 'car', 'bicycle', 'ebike', 'escooter')),
  lap_ms integer NOT NULL CHECK (lap_ms BETWEEN 10000 AND 3600000),
  sectors integer[] NOT NULL DEFAULT '{}',
  track_name text NOT NULL,
  display_name text NOT NULL,
  vehicle_name text,
  /** The rider's card (shared-card shape), shown as the dog tag when beaten. */
  card jsonb,
  /** GPS evidence for the lap: fixes in it and the longest gap between two. */
  fixes integer,
  max_gap_ms integer,
  /** Far quicker than the board (under 90 % of its median): kept, but shown only to its rider and beats nobody. */
  flagged boolean NOT NULL DEFAULT false,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, osm_id, direction, vehicle_class)
);
CREATE INDEX IF NOT EXISTS track_records_board_idx ON public.track_records (osm_id, direction, vehicle_class, lap_ms);
ALTER TABLE public.track_records
  ADD COLUMN IF NOT EXISTS fixes integer,
  ADD COLUMN IF NOT EXISTS max_gap_ms integer,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE public.track_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_records FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.track_record_beats (
  beater_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  beaten_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  osm_id bigint NOT NULL,
  direction text NOT NULL,
  vehicle_class text NOT NULL,
  /** The time that was beaten, and the time that beat it. */
  beaten_ms integer NOT NULL,
  beater_ms integer NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (beater_id, beaten_id, osm_id, direction, vehicle_class)
);
CREATE INDEX IF NOT EXISTS track_record_beats_beaten_idx ON public.track_record_beats (beaten_id);
ALTER TABLE public.track_record_beats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_record_beats FROM PUBLIC, anon, authenticated;

/**
 * A rider's lap on a library layout (opted-in riders only; the app checks the
 * switch, this checks the lap). Keeps their best, and returns every rider whose
 * time it newly beats (their dog tags), telling each of them by push.
 * Rejects laps no vehicle could do (over 350 km/h average for the lap length),
 * laps whose sectors don't add up to the lap, and laps without the GPS to back
 * them (under 0.8 fixes a second on average, or a gap over 3 s). A lap far
 * quicker than the board (under 90 % of its median, with 5 or more riders on
 * it) is kept but flagged: only its rider sees it, and it beats nobody.
 */
CREATE OR REPLACE FUNCTION public.submit_track_lap(
  _osm_id bigint,
  _direction text,
  _vehicle_class text,
  _lap_ms integer,
  _sectors integer[],
  _length_m integer,
  _track_name text,
  _display_name text,
  _vehicle_name text DEFAULT NULL,
  _card jsonb DEFAULT NULL,
  _fixes integer DEFAULT NULL,
  _max_gap_ms integer DEFAULT NULL
)
RETURNS TABLE(display_name text, vehicle_name text, lap_ms integer, card jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me uuid := auth.uid();
  v_name text := left(coalesce(nullif(btrim(_display_name), ''), 'Rider'), 30);
  v_sum bigint;
  v_positive boolean;
  v_median numeric;
  v_flagged boolean := false;
  rec record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _direction NOT IN ('cw', 'ccw') OR _vehicle_class NOT IN ('motorcycle', 'car', 'bicycle', 'ebike', 'escooter') THEN
    RAISE EXCEPTION 'invalid lap';
  END IF;
  IF _lap_ms IS NULL OR _lap_ms < 10000 OR _lap_ms > 3600000 OR _length_m IS NULL OR _length_m < 200 OR _length_m > 30000 THEN
    RAISE EXCEPTION 'invalid lap';
  END IF;
  -- km/h = (m / ms) * 3600
  IF (_length_m::numeric / _lap_ms) * 3600 > 350 THEN
    RAISE EXCEPTION 'implausible lap';
  END IF;
  -- The sectors are the lap, split: all there, all positive, adding up to it.
  SELECT sum(x), bool_and(x > 0) INTO v_sum, v_positive FROM unnest(_sectors) AS x;
  IF coalesce(array_length(_sectors, 1), 0) < 1 OR NOT coalesce(v_positive, false)
     OR abs(v_sum - _lap_ms) > greatest(100, _lap_ms / 200) THEN
    RAISE EXCEPTION 'implausible lap';
  END IF;
  -- The GPS behind it: ~1 fix a second at least, never 3 s without one.
  IF _fixes IS NULL OR _max_gap_ms IS NULL OR _fixes < (_lap_ms / 1000.0) * 0.8 OR _max_gap_ms > 3000 THEN
    RAISE EXCEPTION 'implausible lap';
  END IF;
  -- Far quicker than everyone else: held back from other riders.
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t.lap_ms) INTO v_median
  FROM public.track_records t
  WHERE t.osm_id = _osm_id AND t.direction = _direction AND t.vehicle_class = _vehicle_class
    AND t.user_id <> v_me AND NOT t.flagged
  HAVING count(*) >= 5;
  IF v_median IS NOT NULL AND _lap_ms < v_median * 0.9 THEN
    v_flagged := true;
  END IF;
  IF _card IS NOT NULL AND (jsonb_typeof(_card) <> 'object' OR length(_card::text) > 4000) THEN
    _card := NULL;
  END IF;

  -- Keep the rider's best (or their first).
  INSERT INTO public.track_records AS r (user_id, osm_id, direction, vehicle_class, lap_ms, sectors, track_name, display_name, vehicle_name, card, fixes, max_gap_ms, flagged, set_at)
  VALUES (v_me, _osm_id, _direction, _vehicle_class, _lap_ms, coalesce(_sectors[1:30], '{}'), left(_track_name, 80), v_name, left(_vehicle_name, 40), _card, _fixes, _max_gap_ms, v_flagged, now())
  ON CONFLICT (user_id, osm_id, direction, vehicle_class) DO UPDATE SET
    lap_ms = EXCLUDED.lap_ms,
    sectors = EXCLUDED.sectors,
    track_name = EXCLUDED.track_name,
    display_name = EXCLUDED.display_name,
    vehicle_name = EXCLUDED.vehicle_name,
    card = EXCLUDED.card,
    fixes = EXCLUDED.fixes,
    max_gap_ms = EXCLUDED.max_gap_ms,
    flagged = EXCLUDED.flagged,
    set_at = now()
  WHERE r.lap_ms > EXCLUDED.lap_ms;

  -- A held-back lap takes nobody's dog tag.
  IF v_flagged THEN RETURN; END IF;

  -- Riders whose standing time this lap beats, and haven't been beaten by this
  -- rider at that time already (a new, faster time of theirs can be beaten again).
  FOR rec IN
    SELECT t.user_id, t.display_name, t.vehicle_name, t.lap_ms, t.card
    FROM public.track_records t
    WHERE t.osm_id = _osm_id AND t.direction = _direction AND t.vehicle_class = _vehicle_class
      AND t.user_id <> v_me AND t.lap_ms > _lap_ms AND NOT t.flagged
      AND NOT EXISTS (
        SELECT 1 FROM public.track_record_beats b
        WHERE b.beater_id = v_me AND b.beaten_id = t.user_id AND b.osm_id = _osm_id
          AND b.direction = _direction AND b.vehicle_class = _vehicle_class AND b.beaten_ms <= t.lap_ms
      )
    ORDER BY t.lap_ms
    LIMIT 50
  LOOP
    INSERT INTO public.track_record_beats AS b (beater_id, beaten_id, osm_id, direction, vehicle_class, beaten_ms, beater_ms, at)
    VALUES (v_me, rec.user_id, _osm_id, _direction, _vehicle_class, rec.lap_ms, _lap_ms, now())
    ON CONFLICT (beater_id, beaten_id, osm_id, direction, vehicle_class) DO UPDATE SET
      beaten_ms = EXCLUDED.beaten_ms, beater_ms = EXCLUDED.beater_ms, at = now();
    PERFORM public.push_enqueue('track_beaten', jsonb_build_object(
      'beaten', rec.user_id, 'by_name', v_name, 'track', left(_track_name, 80), 'their_ms', rec.lap_ms, 'by_ms', _lap_ms
    ));
    display_name := rec.display_name;
    vehicle_name := rec.vehicle_name;
    lap_ms := rec.lap_ms;
    card := rec.card;
    RETURN NEXT;
  END LOOP;
END;
$$;

/** A layout's board: the fastest riders in a direction and vehicle class. */
CREATE OR REPLACE FUNCTION public.track_leaderboard(_osm_id bigint, _direction text, _vehicle_class text, _limit integer DEFAULT 20)
RETURNS TABLE(rank bigint, display_name text, vehicle_name text, lap_ms integer, sectors integer[], set_at timestamptz, is_me boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_number() OVER (ORDER BY t.lap_ms, t.set_at) AS rank,
         t.display_name, t.vehicle_name, t.lap_ms, t.sectors, t.set_at, t.user_id = auth.uid() AS is_me
  FROM public.track_records t
  WHERE auth.uid() IS NOT NULL
    AND (NOT t.flagged OR t.user_id = auth.uid())
    AND t.osm_id = _osm_id AND t.direction = _direction AND t.vehicle_class = _vehicle_class
  ORDER BY t.lap_ms, t.set_at
  LIMIT greatest(1, least(coalesce(_limit, 20), 100));
$$;

/** Opting out takes the rider's times off every board. */
CREATE OR REPLACE FUNCTION public.leave_track_leaderboards()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.track_records WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.submit_track_lap(bigint, text, text, integer, integer[], integer, text, text, text, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.track_leaderboard(bigint, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_track_leaderboards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_track_lap(bigint, text, text, integer, integer[], integer, text, text, text, jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_leaderboard(bigint, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_track_leaderboards() TO authenticated;