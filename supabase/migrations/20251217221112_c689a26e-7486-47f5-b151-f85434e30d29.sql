-- Add ride_ended_at column to track when leader ends the ride
-- This provides a durable way for all members to detect ride end (not dependent on broadcast)
ALTER TABLE public.convoys ADD COLUMN IF NOT EXISTS ride_ended_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;