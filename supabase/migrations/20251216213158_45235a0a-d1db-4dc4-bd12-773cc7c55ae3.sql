-- Create profiles table for driver information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  total_distance DECIMAL(10,2) DEFAULT 0,
  lifetime_top_speed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Create convoys table
CREATE TABLE public.convoys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  destination_name TEXT,
  destination_address TEXT,
  destination_lat DECIMAL(10,7),
  destination_lng DECIMAL(10,7),
  destination_set_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on convoys
ALTER TABLE public.convoys ENABLE ROW LEVEL SECURITY;

-- Convoys policies
CREATE POLICY "Anyone can view active convoys" ON public.convoys
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Authenticated users can create convoys" ON public.convoys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Leaders can update their convoy" ON public.convoys
  FOR UPDATE TO authenticated USING (auth.uid() = leader_id);

CREATE POLICY "Leaders can delete their convoy" ON public.convoys
  FOR DELETE TO authenticated USING (auth.uid() = leader_id);

-- Create convoy_members table
CREATE TABLE public.convoy_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convoy_id UUID REFERENCES public.convoys(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_speaking BOOLEAN DEFAULT false,
  current_speed INTEGER DEFAULT 0,
  top_speed INTEGER DEFAULT 0,
  distance_driven DECIMAL(10,2) DEFAULT 0,
  current_lat DECIMAL(10,7),
  current_lng DECIMAL(10,7),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(convoy_id, user_id)
);

-- Enable RLS on convoy_members
ALTER TABLE public.convoy_members ENABLE ROW LEVEL SECURITY;

-- Convoy members policies
CREATE POLICY "Members can view convoy members" ON public.convoy_members
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.convoy_members cm 
      WHERE cm.convoy_id = convoy_members.convoy_id 
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join convoys" ON public.convoy_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own membership" ON public.convoy_members
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can leave convoys" ON public.convoy_members
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate unique convoy code
CREATE OR REPLACE FUNCTION public.generate_convoy_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Enable realtime for convoy_members (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.convoys;