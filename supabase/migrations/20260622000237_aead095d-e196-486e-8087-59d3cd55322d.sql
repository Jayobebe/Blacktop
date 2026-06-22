
CREATE OR REPLACE FUNCTION public.enforce_convoy_message_sender_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Profile not found for sender';
  END IF;
  NEW.sender_name := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sender_name_on_convoy_messages ON public.convoy_messages;
CREATE TRIGGER enforce_sender_name_on_convoy_messages
BEFORE INSERT OR UPDATE ON public.convoy_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_convoy_message_sender_name();
