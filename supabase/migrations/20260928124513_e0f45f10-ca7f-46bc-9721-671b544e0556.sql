-- Upserts fire both the insert and update triggers; count each save once.
CREATE OR REPLACE FUNCTION public.rate_limit_speedshop_votes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('bt.rl_speedshop', true) = '1' THEN
    PERFORM set_config('bt.rl_speedshop', '', true);
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.check_rate_limit('speedshop-vote', 120, 600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  IF TG_OP = 'INSERT' THEN PERFORM set_config('bt.rl_speedshop', '1', true); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.rate_limit_crew_scores()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('bt.rl_crew', true) = '1' THEN
    PERFORM set_config('bt.rl_crew', '', true);
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.check_rate_limit('crew-scores', 60, 600) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  IF TG_OP = 'INSERT' THEN PERFORM set_config('bt.rl_crew', '1', true); END IF;
  RETURN NEW;
END; $$;