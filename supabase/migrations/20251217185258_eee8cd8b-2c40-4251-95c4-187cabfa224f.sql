-- Add convoy_members and convoy_waypoints to realtime publication (convoys is already added)
DO $$ 
BEGIN
  -- Try to add convoy_members
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_members;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
  
  -- Try to add convoy_waypoints
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_waypoints;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
END $$;

-- Set REPLICA IDENTITY FULL for all convoy tables (allows comparing old vs new values)
ALTER TABLE public.convoys REPLICA IDENTITY FULL;
ALTER TABLE public.convoy_members REPLICA IDENTITY FULL;
ALTER TABLE public.convoy_waypoints REPLICA IDENTITY FULL;