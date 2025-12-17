-- Drop the existing policy
DROP POLICY IF EXISTS "Leaders can update their convoy" ON public.convoys;

-- Create a new policy that allows leaders to update their convoy
-- USING checks the OLD row (current leader can update)
-- WITH CHECK allows the new leader_id to be any valid user (for transfers)
CREATE POLICY "Leaders can update their convoy" 
ON public.convoys 
FOR UPDATE 
USING (auth.uid() = leader_id)
WITH CHECK (true);