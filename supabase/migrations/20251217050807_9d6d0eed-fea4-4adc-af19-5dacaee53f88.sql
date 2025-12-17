-- Create waypoints table for convoy routes
CREATE TABLE public.convoy_waypoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  convoy_id UUID NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.convoy_waypoints ENABLE ROW LEVEL SECURITY;

-- Anyone in an active convoy can view waypoints
CREATE POLICY "Members can view convoy waypoints"
ON public.convoy_waypoints
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id
    AND c.is_active = true
  )
);

-- Only convoy leader can manage waypoints
CREATE POLICY "Leaders can insert waypoints"
ON public.convoy_waypoints
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id
    AND c.leader_id = auth.uid()
  )
);

CREATE POLICY "Leaders can update waypoints"
ON public.convoy_waypoints
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id
    AND c.leader_id = auth.uid()
  )
);

CREATE POLICY "Leaders can delete waypoints"
ON public.convoy_waypoints
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_waypoints.convoy_id
    AND c.leader_id = auth.uid()
  )
);

-- Index for faster lookups
CREATE INDEX idx_convoy_waypoints_convoy_id ON public.convoy_waypoints(convoy_id);
CREATE INDEX idx_convoy_waypoints_order ON public.convoy_waypoints(convoy_id, order_index);

-- Enable realtime for waypoints
ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_waypoints;