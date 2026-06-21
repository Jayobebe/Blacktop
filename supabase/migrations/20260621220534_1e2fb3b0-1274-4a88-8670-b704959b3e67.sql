
-- 1. Burn server-side lifetime stats from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_distance;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS lifetime_top_speed;

-- 2. Lava-funnel trigger: when a ride ends, wipe sensitive ride data instantly
CREATE OR REPLACE FUNCTION public.burn_ride_data_on_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fires only when ride_ended_at transitions from NULL to a value
  IF NEW.ride_ended_at IS NOT NULL
     AND (OLD.ride_ended_at IS NULL OR OLD.ride_ended_at IS DISTINCT FROM NEW.ride_ended_at)
  THEN
    -- Scrub all per-rider stats from convoy_members (keep rows so reconnection works)
    UPDATE public.convoy_members
       SET current_speed   = 0,
           top_speed       = 0,
           distance_driven = 0,
           current_lat     = NULL,
           current_lng     = NULL,
           stationary_time = 0,
           is_speaking     = false,
           has_navigated   = false
     WHERE convoy_id = NEW.id;

    -- Delete ephemeral coordination data
    DELETE FROM public.convoy_messages  WHERE convoy_id = NEW.id;
    DELETE FROM public.convoy_waypoints WHERE convoy_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS burn_ride_data_on_end_trg ON public.convoys;
CREATE TRIGGER burn_ride_data_on_end_trg
AFTER UPDATE OF ride_ended_at ON public.convoys
FOR EACH ROW
EXECUTE FUNCTION public.burn_ride_data_on_end();

-- 3. Aggregate-only public stat: profile count (no row-level access)
CREATE OR REPLACE FUNCTION public.profile_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.profiles;
$$;

GRANT EXECUTE ON FUNCTION public.profile_count() TO anon, authenticated;
