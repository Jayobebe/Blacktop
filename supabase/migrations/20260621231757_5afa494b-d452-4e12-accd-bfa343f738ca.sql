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

    -- Delete ephemeral coordination and membership data for the burned lobby.
    DELETE FROM public.convoy_messages  WHERE convoy_id = NEW.id;
    DELETE FROM public.convoy_waypoints WHERE convoy_id = NEW.id;
    DELETE FROM public.convoy_members   WHERE convoy_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS burn_ride_data_on_end_trg ON public.convoys;
CREATE TRIGGER burn_ride_data_on_end_trg
BEFORE UPDATE OF ride_ended_at ON public.convoys
FOR EACH ROW
EXECUTE FUNCTION public.burn_ride_data_on_end();

UPDATE public.convoys c
SET is_active = false
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.convoy_members cm
    WHERE cm.convoy_id = c.id
  );

UPDATE public.convoys
SET is_active = false
WHERE is_active = true
  AND ride_ended_at IS NOT NULL;