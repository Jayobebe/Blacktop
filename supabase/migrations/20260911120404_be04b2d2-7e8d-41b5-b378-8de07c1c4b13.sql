CREATE TABLE public.blacktank_places (
  crew_code text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  label text NOT NULL DEFAULT 'Blacktank',
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blacktank_places TO authenticated;
GRANT ALL ON public.blacktank_places TO service_role;

ALTER TABLE public.blacktank_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tank place"
  ON public.blacktank_places FOR SELECT TO authenticated
  USING (public.is_blacktank_member(crew_code, auth.uid()));

CREATE TRIGGER blacktank_places_touch BEFORE UPDATE ON public.blacktank_places
  FOR EACH ROW EXECUTE FUNCTION public.blacktank_touch();

CREATE OR REPLACE FUNCTION public.blacktank_set_place(_crew_code text, _lat double precision, _lng double precision, _label text DEFAULT 'Blacktank')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_blacktank_member(_crew_code, auth.uid()) THEN RAISE EXCEPTION 'join the tank first'; END IF;
  INSERT INTO public.blacktank_places (crew_code, lat, lng, label, set_by)
  VALUES (upper(trim(_crew_code)), _lat, _lng, COALESCE(nullif(trim(_label),''),'Blacktank'), auth.uid())
  ON CONFLICT (crew_code) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, label = EXCLUDED.label, set_by = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.blacktank_get_place(_crew_code text)
RETURNS TABLE(lat double precision, lng double precision, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.lat, p.lng, p.label FROM public.blacktank_places p
  WHERE upper(p.crew_code) = upper(_crew_code)
    AND public.is_blacktank_member(_crew_code, auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.blacktank_set_place(text, double precision, double precision, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.blacktank_get_place(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.blacktank_set_place(text, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blacktank_get_place(text) TO authenticated;