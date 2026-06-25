-- Security fix: lookup_convoy_by_code (used by joinConvoy()) had no rate
-- limit, unlike every other sensitive RPC/edge function in this codebase
-- (place-search, burn-account, discord-announce-*). Anonymous auth is free
-- and instant, so without this an attacker could script unlimited calls to
-- brute-force the 6-character convoy code space and harvest any active
-- convoy's id/leader_id/destination without ever joining it. 20 attempts per
-- 5 minutes comfortably covers mistyped codes while making brute force
-- impractical.

CREATE OR REPLACE FUNCTION public.lookup_convoy_by_code(_code text)
RETURNS public.convoys
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.convoys;
BEGIN
  IF NOT public.check_rate_limit('lookup-convoy-code', 20, 300) THEN
    RAISE EXCEPTION 'Too many attempts, please slow down';
  END IF;

  SELECT * INTO v_result FROM public.convoys WHERE code = _code AND is_active = true LIMIT 1;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_convoy_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_convoy_by_code(text) TO authenticated;
