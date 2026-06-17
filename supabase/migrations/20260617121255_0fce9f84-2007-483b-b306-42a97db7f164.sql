CREATE TABLE public.discord_integrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_url text NOT NULL,
  server_name text,
  role_to_ping text,
  auto_announce boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_integrations TO authenticated;
GRANT ALL ON public.discord_integrations TO service_role;

ALTER TABLE public.discord_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own discord integration"
  ON public.discord_integrations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.discord_integrations_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER discord_integrations_touch
  BEFORE UPDATE ON public.discord_integrations
  FOR EACH ROW EXECUTE FUNCTION public.discord_integrations_touch();