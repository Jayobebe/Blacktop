-- Add accent_color column to convoy_members for personalized colors in lobbies
ALTER TABLE public.convoy_members 
ADD COLUMN accent_color text DEFAULT 'orange';

-- Add comment for documentation
COMMENT ON COLUMN public.convoy_members.accent_color IS 'User selected accent color for display in convoy lobbies';