-- Add has_navigated column to convoy_members to track who clicked Navigate
ALTER TABLE public.convoy_members 
ADD COLUMN IF NOT EXISTS has_navigated boolean NOT NULL DEFAULT false;