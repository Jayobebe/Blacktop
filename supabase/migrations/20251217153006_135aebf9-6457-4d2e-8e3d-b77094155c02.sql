-- Add stationary_time column to convoy_members for Rocksteady badge calculation
ALTER TABLE public.convoy_members 
ADD COLUMN IF NOT EXISTS stationary_time INTEGER DEFAULT 0;

COMMENT ON COLUMN public.convoy_members.stationary_time IS 'Total seconds spent at 0 speed during the ride';