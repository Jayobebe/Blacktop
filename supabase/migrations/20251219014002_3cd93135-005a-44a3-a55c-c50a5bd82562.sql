-- Create lobby/convoy chat messages table
CREATE TABLE public.convoy_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  convoy_id UUID NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.convoy_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages for convoys they're a member of
CREATE POLICY "Users can view convoy messages" 
ON public.convoy_messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.convoy_members 
    WHERE convoy_members.convoy_id = convoy_messages.convoy_id 
    AND convoy_members.user_id = auth.uid()
  )
);

-- Users can insert messages for convoys they're a member of
CREATE POLICY "Users can send convoy messages" 
ON public.convoy_messages 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.convoy_members 
    WHERE convoy_members.convoy_id = convoy_messages.convoy_id 
    AND convoy_members.user_id = auth.uid()
  )
);

-- Enable realtime for convoy_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_messages;