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
