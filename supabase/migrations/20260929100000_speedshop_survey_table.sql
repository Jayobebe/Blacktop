-- Speedshop survey results for the table on the demo account's Settings page:
-- every rider's answers rolled up per item (with a count per price band) and
-- the suggestions. Anonymous: no rider ids or names ever leave the database.

CREATE OR REPLACE FUNCTION public.speedshop_survey_table()
RETURNS TABLE (item_id text, yes integer, maybe integer, no integer, prices jsonb, last_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.item_id,
         count(*) FILTER (WHERE v.interest = 'yes')::integer,
         count(*) FILTER (WHERE v.interest = 'maybe')::integer,
         count(*) FILTER (WHERE v.interest = 'no')::integer,
         coalesce((
           SELECT jsonb_object_agg(p.price_band, p.n)
           FROM (
             SELECT v2.price_band, count(*) AS n
             FROM public.speedshop_votes v2
             WHERE v2.item_id = v.item_id AND v2.interest <> 'no' AND v2.price_band IS NOT NULL
             GROUP BY v2.price_band
           ) p
         ), '{}'::jsonb),
         max(v.updated_at)
  FROM public.speedshop_votes v
  GROUP BY v.item_id;
$$;

CREATE OR REPLACE FUNCTION public.speedshop_suggestion_list(_limit integer DEFAULT 200)
RETURNS TABLE (body text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.body, s.created_at
  FROM public.speedshop_suggestions s
  ORDER BY s.created_at DESC
  LIMIT least(greatest(_limit, 1), 500);
$$;

REVOKE ALL ON FUNCTION public.speedshop_survey_table() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.speedshop_suggestion_list(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.speedshop_survey_table() TO authenticated;
GRANT EXECUTE ON FUNCTION public.speedshop_suggestion_list(integer) TO authenticated;
