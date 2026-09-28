-- Hazard reports (Waze style): riders report what's on the road where they
-- are; everyone sees them on the map and gets a warning riding up to one.
--
-- Anonymous: the reporter is kept only for rate limiting, merging, "is this
-- mine" and account burn. The table isn't readable directly; the functions
-- below return rows without reporter ids.
--
-- Burn: reporter_id and voter_id cascade from auth.users, so burning an
-- account deletes its reports and votes.
--
-- Types and lifetimes mirror src/features/hazards/types.ts: keep them in sync.

CREATE TABLE public.hazards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'pothole', 'debris', 'oil', 'gravel',
    'flooding', 'ice', 'mud', 'fog',
    'crash', 'breakdown', 'roadworks', 'closed', 'standstill',
    'hivis', 'animal', 'jam', 'other'
  )),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- Direction of travel when reported (degrees), so warnings are for riders heading that way.
  heading real CHECK (heading IS NULL OR (heading >= 0 AND heading < 360)),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmations integer NOT NULL DEFAULT 0,
  denials integer NOT NULL DEFAULT 0
);

CREATE INDEX hazards_expires_idx ON public.hazards (expires_at);
CREATE INDEX hazards_lat_lng_idx ON public.hazards (lat, lng);
CREATE INDEX hazards_reporter_idx ON public.hazards (reporter_id);

CREATE TABLE public.hazard_votes (
  hazard_id uuid NOT NULL REFERENCES public.hazards (id) ON DELETE CASCADE,
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  still_there boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hazard_id, voter_id)
);

CREATE INDEX hazard_votes_voter_idx ON public.hazard_votes (voter_id);

-- No direct access: everything goes through the functions below.
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_votes ENABLE ROW LEVEL SECURITY;

-- How long each kind of report lasts without anyone confirming it.
CREATE OR REPLACE FUNCTION public.hazard_ttl(_kind text)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _kind
    WHEN 'pothole'    THEN interval '30 days'
    WHEN 'debris'     THEN interval '2 hours'
    WHEN 'oil'        THEN interval '6 hours'
    WHEN 'gravel'     THEN interval '7 days'
    WHEN 'flooding'   THEN interval '12 hours'
    WHEN 'ice'        THEN interval '6 hours'
    WHEN 'mud'        THEN interval '2 days'
    WHEN 'fog'        THEN interval '3 hours'
    WHEN 'crash'      THEN interval '2 hours'
    WHEN 'breakdown'  THEN interval '2 hours'
    WHEN 'roadworks'  THEN interval '7 days'
    WHEN 'closed'     THEN interval '24 hours'
    WHEN 'standstill' THEN interval '20 minutes'
    WHEN 'hivis'      THEN interval '1 hour'
    WHEN 'animal'     THEN interval '30 minutes'
    WHEN 'jam'        THEN interval '45 minutes'
    ELSE interval '2 hours'
  END
$$;

-- Live hazards in a box (anonymous: no reporter ids, just whether it's yours).
CREATE OR REPLACE FUNCTION public.hazards_in_bbox(_west double precision, _south double precision, _east double precision, _north double precision)
RETURNS TABLE (
  id uuid, kind text, lat double precision, lng double precision, heading real,
  created_at timestamptz, expires_at timestamptz, confirmations integer, denials integer,
  mine boolean, my_vote boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.kind, h.lat, h.lng, h.heading, h.created_at, h.expires_at, h.confirmations, h.denials,
         h.reporter_id = auth.uid() AS mine,
         (SELECT v.still_there FROM public.hazard_votes v WHERE v.hazard_id = h.id AND v.voter_id = auth.uid()) AS my_vote
  FROM public.hazards h
  WHERE auth.uid() IS NOT NULL
    AND h.expires_at > now()
    AND h.lat BETWEEN _south AND _north
    AND h.lng BETWEEN _west AND _east
    -- Guard against a whole-planet query.
    AND (_north - _south) <= 2 AND (_east - _west) <= 3
  ORDER BY h.created_at DESC
  LIMIT 500
$$;

-- Report a hazard where the rider is. The same kind within 50 m of a live
-- report counts as a confirmation of it instead of a duplicate.
CREATE OR REPLACE FUNCTION public.report_hazard(_kind text, _lat double precision, _lng double precision, _heading real DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_dlat double precision := 50.0 / 110540;
  v_dlng double precision := 50.0 / (111320 * greatest(cos(radians(_lat)), 0.01));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT public.check_rate_limit('hazard-report', 8, 3600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  SELECT h.id INTO v_id
  FROM public.hazards h
  WHERE h.kind = _kind
    AND h.expires_at > now()
    AND h.lat BETWEEN _lat - v_dlat AND _lat + v_dlat
    AND h.lng BETWEEN _lng - v_dlng AND _lng + v_dlng
  ORDER BY h.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.hazards
    SET confirmations = confirmations + 1,
        expires_at = greatest(expires_at, now() + public.hazard_ttl(_kind))
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.hazards (kind, lat, lng, heading, reporter_id, expires_at)
  VALUES (_kind, _lat, _lng, _heading, v_user, now() + public.hazard_ttl(_kind))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- "Still there?" One vote per rider per hazard; not on your own report.
-- Confirming extends its life; two "gone" votes that outweigh the
-- confirmations clear it.
CREATE OR REPLACE FUNCTION public.vote_hazard(_id uuid, _still_there boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_h public.hazards%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT public.check_rate_limit('hazard-vote', 60, 3600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  SELECT * INTO v_h FROM public.hazards WHERE id = _id AND expires_at > now();
  IF NOT FOUND OR v_h.reporter_id = v_user THEN
    RETURN;
  END IF;

  INSERT INTO public.hazard_votes (hazard_id, voter_id, still_there)
  VALUES (_id, v_user, _still_there)
  ON CONFLICT (hazard_id, voter_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN; -- already voted
  END IF;

  IF _still_there THEN
    UPDATE public.hazards
    SET confirmations = confirmations + 1,
        expires_at = greatest(expires_at, now() + public.hazard_ttl(kind))
    WHERE id = _id;
  ELSE
    UPDATE public.hazards
    SET denials = denials + 1,
        expires_at = CASE WHEN denials + 1 >= 2 AND denials + 1 > confirmations THEN now() ELSE expires_at END
    WHERE id = _id;
  END IF;
END;
$$;

-- Take back your own report (the undo, or "it's gone" on one you made).
CREATE OR REPLACE FUNCTION public.remove_my_hazard(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.hazards WHERE id = _id AND reporter_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.hazard_ttl(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hazards_in_bbox(double precision, double precision, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_hazard(text, double precision, double precision, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vote_hazard(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_my_hazard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hazard_ttl(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hazards_in_bbox(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_hazard(text, double precision, double precision, real) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_hazard(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_hazard(uuid) TO authenticated;

-- Hourly tidy-up: expired reports go a day after they lapse (votes cascade).
SELECT cron.schedule(
  'blacktop-hazards-cleanup',
  '23 * * * *',
  $$DELETE FROM public.hazards WHERE expires_at < now() - interval '1 day'$$
);
