-- Privacy retention: positions and speeds that could otherwise sit in Postgres
-- forever when a phone dies, the app crashes or a convoy is never ended.
--
-- 1. world_locations (Blacktop World presence): the phone deletes its row when
--    a ride ends normally; anything not refreshed for 15 minutes goes. (The
--    globe already ignores rows older than 10 minutes.)
-- 2. Abandoned convoys: a convoy over 24 hours old that nobody in it has been
--    heard from for 16 hours is ended. Setting ride_ended_at fires
--    burn_ride_data_on_end(), which deletes its members (positions, speeds),
--    waypoints and messages. The 16-hour quiet check lets a multi-day tour
--    stop overnight without being ended; an abandoned one is gone within ~40 h.
--
-- Both run once now for what's already there, then on pg_cron. Safe to re-run;
-- the schedules are skipped (with a notice) if pg_cron isn't enabled.

CREATE INDEX IF NOT EXISTS world_locations_last_seen_idx ON public.world_locations (last_seen);
CREATE INDEX IF NOT EXISTS convoy_members_convoy_last_seen_idx ON public.convoy_members (convoy_id, last_seen);

-- The backlog, now.
DELETE FROM public.world_locations WHERE last_seen < now() - interval '15 minutes';

UPDATE public.convoys c
   SET ride_ended_at = now(), is_active = false
 WHERE c.ride_ended_at IS NULL
   AND c.created_at < now() - interval '24 hours'
   AND NOT EXISTS (
     SELECT 1 FROM public.convoy_members m
      WHERE m.convoy_id = c.id AND m.last_seen > now() - interval '16 hours'
   );

-- From now on.
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
      WHERE jobname IN ('blacktop-world-locations-cleanup', 'blacktop-abandoned-convoys-scrub');

    PERFORM cron.schedule(
      'blacktop-world-locations-cleanup',
      '*/10 * * * *',
      $job$DELETE FROM public.world_locations WHERE last_seen < now() - interval '15 minutes'$job$
    );

    PERFORM cron.schedule(
      'blacktop-abandoned-convoys-scrub',
      '17 * * * *',
      $job$UPDATE public.convoys c
              SET ride_ended_at = now(), is_active = false
            WHERE c.ride_ended_at IS NULL
              AND c.created_at < now() - interval '24 hours'
              AND NOT EXISTS (
                SELECT 1 FROM public.convoy_members m
                 WHERE m.convoy_id = c.id AND m.last_seen > now() - interval '16 hours'
              )$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled: privacy retention jobs not scheduled';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'privacy retention jobs not scheduled: %', SQLERRM;
END;
$$;
