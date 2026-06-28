CREATE TABLE IF NOT EXISTS public.world_locations (
  user_id     UUID             PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  last_seen   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_locations TO authenticated;
GRANT ALL ON public.world_locations TO service_role;

ALTER TABLE public.world_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "world_locations_select" ON public.world_locations;
CREATE POLICY "world_locations_select"
  ON public.world_locations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "world_locations_insert" ON public.world_locations;
CREATE POLICY "world_locations_insert"
  ON public.world_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "world_locations_update" ON public.world_locations;
CREATE POLICY "world_locations_update"
  ON public.world_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "world_locations_delete" ON public.world_locations;
CREATE POLICY "world_locations_delete"
  ON public.world_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS world_locations_last_seen_idx ON public.world_locations (last_seen);