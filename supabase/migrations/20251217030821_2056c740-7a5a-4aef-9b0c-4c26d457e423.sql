-- Drop the problematic recursive SELECT policy
DROP POLICY IF EXISTS "Members can view convoy members" ON public.convoy_members;

-- Create a simpler non-recursive SELECT policy
-- Allow authenticated users to view members of active convoys
CREATE POLICY "Members can view convoy members" 
ON public.convoy_members 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.convoys c
    WHERE c.id = convoy_members.convoy_id 
    AND c.is_active = true
  )
);

-- Also fix the UPDATE policy to be simpler and avoid any recursion issues
DROP POLICY IF EXISTS "Users can update their own membership" ON public.convoy_members;

CREATE POLICY "Users can update their own membership" 
ON public.convoy_members 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);