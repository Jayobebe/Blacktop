-- Add is_paused column to convoys table for leader to pause all members' rides
ALTER TABLE public.convoys 
ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false;

-- Add paused_at timestamp to track when the ride was paused
ALTER TABLE public.convoys 
ADD COLUMN paused_at TIMESTAMP WITH TIME ZONE;