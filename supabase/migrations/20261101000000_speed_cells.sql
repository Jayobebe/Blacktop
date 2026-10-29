-- The shared speed-limit map (supabase/functions/place-search/speedCells.ts): one small JSON file
-- per map cell, OpenStreetMap's roads and their maxspeed, fetched from Overpass the first time a
-- rider passes through and read by every phone after that straight from storage. Public to read
-- (it's OpenStreetMap data, nothing about anyone); no policies, so only the service role (the
-- place-search function) can write. Up to 2 MB a file, JSON only. Safe to run twice.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('speed-cells', 'speed-cells', true, 2097152, ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
