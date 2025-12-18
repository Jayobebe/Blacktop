-- Add ride_started_at column to convoys table for reliable start-ride signaling
ALTER TABLE public.convoys ADD COLUMN IF NOT EXISTS ride_started_at TIMESTAMPTZ DEFAULT NULL;