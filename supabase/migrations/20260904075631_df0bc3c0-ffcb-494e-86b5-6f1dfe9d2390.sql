CREATE OR REPLACE FUNCTION public.my_card_collection_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.card_drop_collections
  WHERE collector_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_card_collection_count() TO authenticated;