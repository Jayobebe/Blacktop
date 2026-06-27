-- World sharing: lightweight opt-in presence table so the Blacktop World globe
-- can count both convoy riders and solo riders who have enabled world sharing.
-- Separate from convoy_members so it works regardless of ride mode, and so RLS
-- can simply allow any authenticated user to read it (users explicitly opt in).

CREATE TABLE public.world_locations (
  user_id     UUID             PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  last_seen   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

ALTER TABLE public.world_locations ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read opted-in locations (consent is given by enabling world sharing).
CREATE POLICY "world_locations_select"
  ON public.world_locations FOR SELECT TO authenticated USING (true);

-- Users may only write / delete their own row.
CREATE POLICY "world_locations_insert"
  ON public.world_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "world_locations_update"
  ON public.world_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "world_locations_delete"
  ON public.world_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fast freshness-filtered count used by the World page.
CREATE INDEX world_locations_last_seen_idx ON public.world_locations (last_seen);
