
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

DROP POLICY IF EXISTS "Convoy members can read realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Convoy members can broadcast realtime" ON realtime.messages;

CREATE POLICY "Convoy members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_convoy_member(
    public.convoy_id_from_topic((realtime.topic())),
    (SELECT auth.uid())
  )
);

CREATE POLICY "Convoy members can broadcast realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_convoy_member(
    public.convoy_id_from_topic((realtime.topic())),
    (SELECT auth.uid())
  )
);
