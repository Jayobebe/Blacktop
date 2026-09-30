-- Peaks a rider keeps private (Public Road Privacy) are stored as NULL, not 0:
-- the app shows them as "--" and leaves them out of rankings and badges, where
-- a 0 would read as a real (and poor) figure. Only the NOT NULL constraints
-- change; defaults stay 0 and existing rows are untouched.

ALTER TABLE public.card_drops
  ALTER COLUMN top_speed_mph DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL,
  ALTER COLUMN max_g_force DROP NOT NULL;

ALTER TABLE public.crew_scores
  ALTER COLUMN top_speed DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL;

-- corner_score comes from lean, so it's private with it.
ALTER TABLE public.crew_weekly_scores
  ALTER COLUMN top_speed DROP NOT NULL,
  ALTER COLUMN max_lean DROP NOT NULL,
  ALTER COLUMN corner_score DROP NOT NULL;

-- convoy_members.top_speed already allows NULL (its 0-200 check passes NULL).
