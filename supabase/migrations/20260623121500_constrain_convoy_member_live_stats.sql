-- Security fix: convoy_members live-stat columns (current_speed, top_speed,
-- distance_driven, stationary_time) are writable by their owning member with
-- no plausibility check, so a client bypassing the app can fabricate values
-- (e.g. top_speed = 9999) to always win badges in calculateBadges(). Bound
-- them to values no honest client could exceed.
--
-- current_speed/top_speed mirror MAX_SPEED_SANITY in
-- src/features/ride/hooks/useActiveRide.ts, which already discards GPS
-- readings above 200 mph before they're ever sent, so this never rejects a
-- legitimate update. distance_driven/stationary_time use generous ceilings
-- sized for a single ride session, not a tight bound.

ALTER TABLE public.convoy_members
  DROP CONSTRAINT IF EXISTS convoy_members_current_speed_range,
  ADD CONSTRAINT convoy_members_current_speed_range CHECK (current_speed BETWEEN 0 AND 200);

ALTER TABLE public.convoy_members
  DROP CONSTRAINT IF EXISTS convoy_members_top_speed_range,
  ADD CONSTRAINT convoy_members_top_speed_range CHECK (top_speed BETWEEN 0 AND 200);

ALTER TABLE public.convoy_members
  DROP CONSTRAINT IF EXISTS convoy_members_distance_driven_range,
  ADD CONSTRAINT convoy_members_distance_driven_range CHECK (distance_driven BETWEEN 0 AND 1000);

ALTER TABLE public.convoy_members
  DROP CONSTRAINT IF EXISTS convoy_members_stationary_time_range,
  ADD CONSTRAINT convoy_members_stationary_time_range CHECK (stationary_time BETWEEN 0 AND 86400);
