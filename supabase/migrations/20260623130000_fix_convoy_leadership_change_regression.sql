-- Fixes a regression from the RLS hardening migration
-- (20260621223240_f30ae609...): tightening the convoys UPDATE policy to
-- WITH CHECK (auth.uid() = leader_id) was correct for ordinary updates, but
-- it also silently broke the two legitimate paths that change leader_id:
--   1. transferLeadership() in useConvoyState.ts — current leader hands off
--      to another member; now fails WITH CHECK since the new leader_id
--      isn't the caller's own uid.
--   2. Auto-promote-last-remaining-member in useConvoyState.ts — the last
--      member promotes themselves; now fails USING since the caller isn't
--      the current leader yet.
--
-- Rather than loosening the general UPDATE policy (which also guards
-- destination/is_active/is_paused), add two narrow SECURITY DEFINER
-- functions that validate each specific transition before changing
-- leader_id, leaving the blanket UPDATE policy untouched.

CREATE OR REPLACE FUNCTION public.transfer_convoy_leadership(_convoy_id uuid, _new_leader_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.convoys WHERE id = _convoy_id AND leader_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the current leader can transfer leadership';
  END IF;

  IF NOT public.is_convoy_member(_convoy_id, _new_leader_id) THEN
    RAISE EXCEPTION 'New leader must be a member of this convoy';
  END IF;

  UPDATE public.convoys SET leader_id = _new_leader_id WHERE id = _convoy_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_convoy_leadership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_convoy_leadership(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_convoy_leadership(_convoy_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count integer;
BEGIN
  IF NOT public.is_convoy_member(_convoy_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only a member of this convoy can claim leadership';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.convoy_members WHERE convoy_id = _convoy_id;

  IF v_member_count != 1 THEN
    RAISE EXCEPTION 'Leadership can only be auto-claimed when you are the sole remaining member';
  END IF;

  UPDATE public.convoys SET leader_id = auth.uid() WHERE id = _convoy_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_convoy_leadership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_convoy_leadership(uuid) TO authenticated;
