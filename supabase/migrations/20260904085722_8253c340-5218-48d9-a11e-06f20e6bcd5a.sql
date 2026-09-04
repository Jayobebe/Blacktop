CREATE TABLE public.derez_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  leader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lives integer NOT NULL DEFAULT 3,
  arena jsonb,
  state text NOT NULL DEFAULT 'lobby',
  winner_id uuid,
  winner_name text,
  started_at timestamptz,
  round_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.derez_lobbies TO authenticated;
GRANT ALL ON public.derez_lobbies TO service_role;

CREATE TABLE public.derez_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.derez_lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Rider',
  accent_color text NOT NULL DEFAULT 'orange',
  is_ready boolean NOT NULL DEFAULT false,
  lives_left integer NOT NULL DEFAULT 3,
  is_alive boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lobby_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.derez_players TO authenticated;
GRANT ALL ON public.derez_players TO service_role;

CREATE OR REPLACE FUNCTION public.is_derez_member(_lobby_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.derez_players p
    WHERE p.lobby_id = _lobby_id AND p.user_id = _user_id
  );
$$;

ALTER TABLE public.derez_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derez_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their derez lobby"
ON public.derez_lobbies FOR SELECT TO authenticated
USING (public.is_derez_member(id, auth.uid()) OR leader_id = auth.uid());

CREATE POLICY "Users can create derez lobbies"
ON public.derez_lobbies FOR INSERT TO authenticated
WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Leaders can update their derez lobby"
ON public.derez_lobbies FOR UPDATE TO authenticated
USING (auth.uid() = leader_id) WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Leaders can delete their derez lobby"
ON public.derez_lobbies FOR DELETE TO authenticated
USING (auth.uid() = leader_id);

CREATE POLICY "Members can view derez players"
ON public.derez_players FOR SELECT TO authenticated
USING (public.is_derez_member(lobby_id, auth.uid()));

CREATE POLICY "Users can join derez lobbies"
ON public.derez_players FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (SELECT count(*) FROM public.derez_players dp WHERE dp.lobby_id = derez_players.lobby_id) < 8
);

CREATE POLICY "Users can update their own derez player row"
ON public.derez_players FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Leaders can update derez players"
ON public.derez_players FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.derez_lobbies l WHERE l.id = derez_players.lobby_id AND l.leader_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.derez_lobbies l WHERE l.id = derez_players.lobby_id AND l.leader_id = auth.uid()));

CREATE POLICY "Users can leave derez lobbies"
ON public.derez_players FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.derez_lobbies_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER derez_lobbies_touch_trg
BEFORE UPDATE ON public.derez_lobbies
FOR EACH ROW EXECUTE FUNCTION public.derez_lobbies_touch();

CREATE OR REPLACE FUNCTION public.lookup_derez_by_code(_code text)
RETURNS public.derez_lobbies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.derez_lobbies
  WHERE code = upper(_code)
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_derez_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_derez_member(uuid, uuid) TO authenticated;

ALTER TABLE public.derez_lobbies REPLICA IDENTITY FULL;
ALTER TABLE public.derez_players REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.derez_lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.derez_players;