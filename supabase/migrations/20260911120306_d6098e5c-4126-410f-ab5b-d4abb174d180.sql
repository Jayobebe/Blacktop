-- Blacktank: crew-scoped pledge ledger (no custody)

CREATE TABLE public.blacktank_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_code text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Rider',
  nim_address text,
  usdt_address text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_code, user_id)
);

CREATE TABLE public.blacktank_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_code text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Rider',
  currency text NOT NULL CHECK (currency IN ('NIM','USDT')),
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blacktank_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_code text NOT NULL,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL DEFAULT 'Rider',
  payout_address text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('NIM','USDT')),
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','expired','settled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blacktank_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.blacktank_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voter_name text NOT NULL DEFAULT 'Rider',
  approve boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, voter_id)
);

CREATE TABLE public.blacktank_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.blacktank_requests(id) ON DELETE CASCADE,
  crew_code text NOT NULL,
  payer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payer_name text NOT NULL DEFAULT 'Rider',
  currency text NOT NULL CHECK (currency IN ('NIM','USDT')),
  amount numeric NOT NULL CHECK (amount > 0),
  tx_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, payer_id)
);

CREATE INDEX blacktank_members_crew_idx ON public.blacktank_members (crew_code);
CREATE INDEX blacktank_pledges_crew_idx ON public.blacktank_pledges (crew_code);
CREATE INDEX blacktank_requests_crew_idx ON public.blacktank_requests (crew_code, status);
CREATE INDEX blacktank_settlements_req_idx ON public.blacktank_settlements (request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blacktank_members TO authenticated;
GRANT SELECT ON public.blacktank_pledges TO authenticated;
GRANT SELECT ON public.blacktank_requests TO authenticated;
GRANT SELECT ON public.blacktank_votes TO authenticated;
GRANT SELECT ON public.blacktank_settlements TO authenticated;
GRANT ALL ON public.blacktank_members TO service_role;
GRANT ALL ON public.blacktank_pledges TO service_role;
GRANT ALL ON public.blacktank_requests TO service_role;
GRANT ALL ON public.blacktank_votes TO service_role;
GRANT ALL ON public.blacktank_settlements TO service_role;

ALTER TABLE public.blacktank_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacktank_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacktank_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacktank_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacktank_settlements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_blacktank_member(_crew_code text, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blacktank_members m
    WHERE upper(m.crew_code) = upper(_crew_code) AND m.user_id = _user_id
  );
$$;

CREATE POLICY "Members read tank roster"
  ON public.blacktank_members FOR SELECT TO authenticated
  USING (public.is_blacktank_member(crew_code, auth.uid()));
CREATE POLICY "Join tank as self"
  ON public.blacktank_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own tank membership"
  ON public.blacktank_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Leave tank as self"
  ON public.blacktank_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members read pledges"
  ON public.blacktank_pledges FOR SELECT TO authenticated
  USING (public.is_blacktank_member(crew_code, auth.uid()));
CREATE POLICY "Members read requests"
  ON public.blacktank_requests FOR SELECT TO authenticated
  USING (public.is_blacktank_member(crew_code, auth.uid()));
CREATE POLICY "Members read settlements"
  ON public.blacktank_settlements FOR SELECT TO authenticated
  USING (public.is_blacktank_member(crew_code, auth.uid()));
CREATE POLICY "Members read votes"
  ON public.blacktank_votes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blacktank_requests r
    WHERE r.id = request_id AND public.is_blacktank_member(r.crew_code, auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.blacktank_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER blacktank_members_touch BEFORE UPDATE ON public.blacktank_members
  FOR EACH ROW EXECUTE FUNCTION public.blacktank_touch();
CREATE TRIGGER blacktank_requests_touch BEFORE UPDATE ON public.blacktank_requests
  FOR EACH ROW EXECUTE FUNCTION public.blacktank_touch();

-- Join / update wallet details
CREATE OR REPLACE FUNCTION public.blacktank_join(_crew_code text, _nim_address text DEFAULT NULL, _usdt_address text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF coalesce(trim(_crew_code), '') = '' THEN RAISE EXCEPTION 'crew code required'; END IF;
  SELECT COALESCE(display_name, 'Rider') INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.blacktank_members (crew_code, user_id, display_name, nim_address, usdt_address)
  VALUES (upper(trim(_crew_code)), auth.uid(), COALESCE(v_name, 'Rider'), _nim_address, _usdt_address)
  ON CONFLICT (crew_code, user_id) DO UPDATE
    SET display_name = COALESCE(v_name, 'Rider'),
        nim_address = COALESCE(EXCLUDED.nim_address, public.blacktank_members.nim_address),
        usdt_address = COALESCE(EXCLUDED.usdt_address, public.blacktank_members.usdt_address);
END; $$;

-- Chip in
CREATE OR REPLACE FUNCTION public.blacktank_pledge(_crew_code text, _currency text, _amount numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_id uuid;
BEGIN
  IF NOT public.is_blacktank_member(_crew_code, auth.uid()) THEN RAISE EXCEPTION 'join the tank first'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _currency NOT IN ('NIM','USDT') THEN RAISE EXCEPTION 'unsupported currency'; END IF;
  SELECT COALESCE(display_name, 'Rider') INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.blacktank_pledges (crew_code, user_id, display_name, currency, amount, note)
  VALUES (upper(trim(_crew_code)), auth.uid(), COALESCE(v_name,'Rider'), _currency, _amount, nullif(trim(_note),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Lazily expire stale open requests
CREATE OR REPLACE FUNCTION public.blacktank_sweep(_crew_code text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.blacktank_requests
  SET status = 'expired'
  WHERE upper(crew_code) = upper(_crew_code) AND status = 'open' AND expires_at < now();
$$;

-- Ask the crew for money
CREATE OR REPLACE FUNCTION public.blacktank_request(_crew_code text, _currency text, _amount numeric, _reason text, _payout_address text, _expires_minutes integer DEFAULT 720)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_id uuid; v_open integer;
BEGIN
  IF NOT public.is_blacktank_member(_crew_code, auth.uid()) THEN RAISE EXCEPTION 'join the tank first'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _currency NOT IN ('NIM','USDT') THEN RAISE EXCEPTION 'unsupported currency'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'a reason is required'; END IF;
  IF coalesce(trim(_payout_address),'') = '' THEN RAISE EXCEPTION 'a payout address is required'; END IF;
  PERFORM public.blacktank_sweep(_crew_code);
  SELECT count(*) INTO v_open FROM public.blacktank_requests
    WHERE upper(crew_code) = upper(_crew_code) AND requester_id = auth.uid() AND status = 'open';
  IF v_open > 0 THEN RAISE EXCEPTION 'you already have an open request'; END IF;
  SELECT COALESCE(display_name, 'Rider') INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.blacktank_requests (crew_code, requester_id, requester_name, payout_address, currency, amount, reason, expires_at)
  VALUES (upper(trim(_crew_code)), auth.uid(), COALESCE(v_name,'Rider'), trim(_payout_address), _currency, _amount, trim(_reason),
          now() + make_interval(mins => greatest(5, least(coalesce(_expires_minutes,720), 10080))))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Vote. Unanimous approval from every other member unlocks the payout.
CREATE OR REPLACE FUNCTION public.blacktank_vote(_request_id uuid, _approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.blacktank_requests; v_name text; v_needed integer; v_yes integer;
BEGIN
  SELECT * INTO r FROM public.blacktank_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.is_blacktank_member(r.crew_code, auth.uid()) THEN RAISE EXCEPTION 'not a tank member'; END IF;
  IF r.requester_id = auth.uid() THEN RAISE EXCEPTION 'you cannot vote on your own request'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'this request is closed'; END IF;
  IF r.expires_at < now() THEN
    UPDATE public.blacktank_requests SET status = 'expired' WHERE id = r.id;
    RETURN 'expired';
  END IF;

  SELECT COALESCE(display_name,'Rider') INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.blacktank_votes (request_id, voter_id, voter_name, approve)
  VALUES (r.id, auth.uid(), COALESCE(v_name,'Rider'), _approve)
  ON CONFLICT (request_id, voter_id) DO UPDATE SET approve = EXCLUDED.approve;

  IF NOT _approve THEN
    UPDATE public.blacktank_requests SET status = 'rejected' WHERE id = r.id;
    RETURN 'rejected';
  END IF;

  SELECT count(*) INTO v_needed FROM public.blacktank_members m
    WHERE upper(m.crew_code) = upper(r.crew_code) AND m.user_id <> r.requester_id;
  SELECT count(*) INTO v_yes FROM public.blacktank_votes v
    WHERE v.request_id = r.id AND v.approve;

  IF v_yes >= v_needed AND v_needed > 0 THEN
    UPDATE public.blacktank_requests SET status = 'approved' WHERE id = r.id;
    RETURN 'approved';
  END IF;
  RETURN 'open';
END; $$;

-- Requester withdraws their own request
CREATE OR REPLACE FUNCTION public.blacktank_cancel_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.blacktank_requests SET status = 'rejected'
  WHERE id = _request_id AND requester_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'nothing to cancel'; END IF;
END; $$;

-- Record that a pledger has paid their share directly to the requester
CREATE OR REPLACE FUNCTION public.blacktank_settle(_request_id uuid, _amount numeric, _tx_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.blacktank_requests; v_name text; v_left integer;
BEGIN
  SELECT * INTO r FROM public.blacktank_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.is_blacktank_member(r.crew_code, auth.uid()) THEN RAISE EXCEPTION 'not a tank member'; END IF;
  IF r.status NOT IN ('approved','settled') THEN RAISE EXCEPTION 'request is not approved'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  SELECT COALESCE(display_name,'Rider') INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.blacktank_settlements (request_id, crew_code, payer_id, payer_name, currency, amount, tx_ref)
  VALUES (r.id, r.crew_code, auth.uid(), COALESCE(v_name,'Rider'), r.currency, _amount, nullif(trim(_tx_ref),''))
  ON CONFLICT (request_id, payer_id) DO UPDATE SET amount = EXCLUDED.amount, tx_ref = EXCLUDED.tx_ref;

  SELECT count(*) INTO v_left FROM public.blacktank_members m
    WHERE upper(m.crew_code) = upper(r.crew_code)
      AND m.user_id <> r.requester_id
      AND NOT EXISTS (SELECT 1 FROM public.blacktank_settlements s WHERE s.request_id = r.id AND s.payer_id = m.user_id);
  IF v_left = 0 THEN
    UPDATE public.blacktank_requests SET status = 'settled' WHERE id = r.id;
  END IF;
END; $$;

-- Tank overview
CREATE OR REPLACE FUNCTION public.blacktank_summary(_crew_code text)
RETURNS TABLE(currency text, pledged numeric, paid_out numeric, balance numeric, member_count integer, my_pledged numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cur AS (SELECT unnest(ARRAY['NIM','USDT']) AS c),
  ok AS (SELECT public.is_blacktank_member(_crew_code, auth.uid()) AS yes)
  SELECT cur.c,
    COALESCE((SELECT sum(p.amount) FROM public.blacktank_pledges p
              WHERE upper(p.crew_code)=upper(_crew_code) AND p.currency=cur.c),0),
    COALESCE((SELECT sum(s.amount) FROM public.blacktank_settlements s
              WHERE upper(s.crew_code)=upper(_crew_code) AND s.currency=cur.c),0),
    COALESCE((SELECT sum(p.amount) FROM public.blacktank_pledges p
              WHERE upper(p.crew_code)=upper(_crew_code) AND p.currency=cur.c),0)
      - COALESCE((SELECT sum(s.amount) FROM public.blacktank_settlements s
              WHERE upper(s.crew_code)=upper(_crew_code) AND s.currency=cur.c),0),
    (SELECT count(*)::int FROM public.blacktank_members m WHERE upper(m.crew_code)=upper(_crew_code)),
    COALESCE((SELECT sum(p.amount) FROM public.blacktank_pledges p
              WHERE upper(p.crew_code)=upper(_crew_code) AND p.currency=cur.c AND p.user_id=auth.uid()),0)
  FROM cur, ok WHERE ok.yes;
$$;

-- Requests plus vote tallies and my share
CREATE OR REPLACE FUNCTION public.blacktank_list_requests(_crew_code text)
RETURNS TABLE(
  id uuid, requester_id uuid, requester_name text, payout_address text,
  currency text, amount numeric, reason text, status text,
  expires_at timestamptz, created_at timestamptz,
  yes_votes integer, no_votes integer, votes_needed integer,
  is_mine boolean, my_vote boolean, my_share numeric, my_settled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.requester_id, r.requester_name, r.payout_address,
    r.currency, r.amount, r.reason,
    CASE WHEN r.status='open' AND r.expires_at < now() THEN 'expired' ELSE r.status END,
    r.expires_at, r.created_at,
    (SELECT count(*)::int FROM public.blacktank_votes v WHERE v.request_id=r.id AND v.approve),
    (SELECT count(*)::int FROM public.blacktank_votes v WHERE v.request_id=r.id AND NOT v.approve),
    (SELECT count(*)::int FROM public.blacktank_members m
       WHERE upper(m.crew_code)=upper(r.crew_code) AND m.user_id <> r.requester_id),
    r.requester_id = auth.uid(),
    (SELECT v.approve FROM public.blacktank_votes v WHERE v.request_id=r.id AND v.voter_id=auth.uid()),
    CASE WHEN r.requester_id = auth.uid() THEN 0
         ELSE round(r.amount / greatest(1, (SELECT count(*) FROM public.blacktank_members m
              WHERE upper(m.crew_code)=upper(r.crew_code) AND m.user_id <> r.requester_id)), 6) END,
    EXISTS (SELECT 1 FROM public.blacktank_settlements s WHERE s.request_id=r.id AND s.payer_id=auth.uid())
  FROM public.blacktank_requests r
  WHERE upper(r.crew_code) = upper(_crew_code)
    AND public.is_blacktank_member(_crew_code, auth.uid())
  ORDER BY (r.status='open') DESC, r.created_at DESC
  LIMIT 50;
$$;

-- Who has chipped in
CREATE OR REPLACE FUNCTION public.blacktank_list_pledges(_crew_code text)
RETURNS TABLE(display_name text, currency text, total numeric, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.display_name, p.currency, sum(p.amount), max(p.created_at)
  FROM public.blacktank_pledges p
  WHERE upper(p.crew_code) = upper(_crew_code)
    AND public.is_blacktank_member(_crew_code, auth.uid())
  GROUP BY p.display_name, p.currency
  ORDER BY sum(p.amount) DESC
  LIMIT 50;
$$;