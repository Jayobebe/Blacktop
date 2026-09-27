-- The push schedule (weather, dated reminders, crew results) runs every
-- 30 minutes instead of 10. Instant alerts are unaffected (pg_net).
-- Safe to re-run; does nothing if pg_cron isn't enabled.
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'blacktop-push-tick';
    PERFORM cron.schedule('blacktop-push-tick', '*/30 * * * *', 'SELECT public.push_tick()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'push schedule not updated: %', SQLERRM;
END;
$$;
