-- Speedshop survey: nothing is for sale yet, so riders tell us what they'd
-- buy and what they'd pay. Riders only ever see their own answers plus the
-- anonymous totals from speedshop_results().

CREATE TABLE IF NOT EXISTS public.speedshop_votes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id text NOT NULL CHECK (item_id ~ '^[a-z0-9-]{1,40}$'),
  interest text NOT NULL CHECK (interest IN ('yes', 'maybe', 'no')),
  price_band text CHECK (price_band IS NULL OR length(price_band) <= 20),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.speedshop_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speedshop_votes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speedshop_votes TO authenticated;
GRANT ALL ON public.speedshop_votes TO service_role;

DROP POLICY IF EXISTS speedshop_votes_own ON public.speedshop_votes;
CREATE POLICY speedshop_votes_own ON public.speedshop_votes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.speedshop_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.speedshop_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speedshop_suggestions FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.speedshop_suggestions TO authenticated;
GRANT ALL ON public.speedshop_suggestions TO service_role;

DROP POLICY IF EXISTS speedshop_suggestions_read_own ON public.speedshop_suggestions;
CREATE POLICY speedshop_suggestions_read_own ON public.speedshop_suggestions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- At most 5 suggestions per rider per day.
DROP POLICY IF EXISTS speedshop_suggestions_insert_own ON public.speedshop_suggestions;
CREATE POLICY speedshop_suggestions_insert_own ON public.speedshop_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      SELECT count(*) FROM public.speedshop_suggestions s
      WHERE s.user_id = auth.uid() AND s.created_at > now() - interval '1 day'
    ) < 5
  );

-- Anonymous totals per item, and the most-picked price among the interested.
CREATE OR REPLACE FUNCTION public.speedshop_results()
RETURNS TABLE (item_id text, yes integer, maybe integer, no integer, top_price text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.item_id,
         count(*) FILTER (WHERE v.interest = 'yes')::integer,
         count(*) FILTER (WHERE v.interest = 'maybe')::integer,
         count(*) FILTER (WHERE v.interest = 'no')::integer,
         mode() WITHIN GROUP (ORDER BY v.price_band) FILTER (WHERE v.interest <> 'no' AND v.price_band IS NOT NULL)
  FROM public.speedshop_votes v
  GROUP BY v.item_id;
$$;

REVOKE ALL ON FUNCTION public.speedshop_results() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.speedshop_results() TO authenticated;
