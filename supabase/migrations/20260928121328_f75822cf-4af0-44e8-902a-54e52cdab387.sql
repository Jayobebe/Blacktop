ALTER FUNCTION public.hazard_ttl(text) SET search_path = public;
ALTER FUNCTION public.is_push_service_endpoint(text) SET search_path = public;

CREATE OR REPLACE FUNCTION public.rate_limit_speedshop_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.check_rate_limit('speedshop-vote', 120, 600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.rate_limit_crew_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.check_rate_limit('crew-scores', 60, 600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_speedshop_votes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rate_limit_crew_scores() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS speedshop_votes_rate_limit ON public.speedshop_votes;
CREATE TRIGGER speedshop_votes_rate_limit BEFORE INSERT OR UPDATE ON public.speedshop_votes
FOR EACH ROW EXECUTE FUNCTION public.rate_limit_speedshop_votes();

DROP TRIGGER IF EXISTS crew_scores_rate_limit ON public.crew_scores;
CREATE TRIGGER crew_scores_rate_limit BEFORE INSERT OR UPDATE ON public.crew_scores
FOR EACH ROW EXECUTE FUNCTION public.rate_limit_crew_scores();