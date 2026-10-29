-- Convoy live channels for the convoy's members only. The rules on realtime.messages
-- (20260625005430) only apply to private channels, and the app opened every channel as
-- public, so anyone signed in who knew a convoy's id could join its channels: end every
-- member's ride, join its voice, send rescue calls, reactions and routes. The app now opens
-- every convoy channel as private (src/lib/convoyChannel.ts), and this teaches the rule the
-- convoy channels it didn't know yet: route requests and shared routes, regroup calls,
-- passengers' reactions and convoy merges. Spectating (`spectate:<id>`) stays a public
-- channel: it's for the crew, who aren't members.
--
-- Run this BEFORE the app update goes live: an app opening these as private before the rule
-- knows them would be refused. Safe to run twice.

CREATE OR REPLACE FUNCTION public.convoy_id_from_topic(_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_raw text;
BEGIN
  IF _topic IS NULL THEN RETURN NULL; END IF;

  IF _topic LIKE 'convoy-control:%' THEN
    v_raw := substring(_topic from 16);
  ELSIF _topic LIKE 'voice:%' THEN
    v_raw := substring(_topic from 7);
  ELSIF _topic LIKE 'map-presence:%' THEN
    v_raw := substring(_topic from 14);
  ELSIF _topic LIKE 'rescue-%' THEN
    v_raw := substring(_topic from 8);
  ELSIF _topic LIKE 'route-request-%' THEN
    v_raw := substring(_topic from 15);
  ELSIF _topic LIKE 'regroup-%' THEN
    v_raw := substring(_topic from 9);
  ELSIF _topic LIKE 'reactions-%' THEN
    v_raw := substring(_topic from 11);
  ELSIF _topic LIKE 'prox-convoy:%' THEN
    v_raw := substring(_topic from 13);
  ELSE
    RETURN NULL;
  END IF;

  BEGIN
    v_id := v_raw::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.convoy_id_from_topic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convoy_id_from_topic(text) TO authenticated, service_role;
