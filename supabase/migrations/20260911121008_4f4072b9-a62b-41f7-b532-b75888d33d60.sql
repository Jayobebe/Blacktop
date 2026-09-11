-- Card / world / crew helpers: signed-in only (the app always signs in before use)
REVOKE EXECUTE ON FUNCTION public.area_card_kings(double precision, double precision, double precision) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.collect_card_drop(uuid, double precision, double precision) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crew_convoy_detail(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_world_presence() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_derez_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_crew_challenge(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_crew_convoys(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_crew_leaderboard(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_crew_month(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_my_kickbacks() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lookup_derez_by_code(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.area_card_kings(double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_card_drop(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_convoy_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_world_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_derez_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_card_drops(double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crew_challenge(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crew_convoys(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crew_leaderboard(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_crew_month(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_kickbacks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_derez_by_code(text) TO authenticated;

-- Trigger helper: never called directly by clients
REVOKE EXECUTE ON FUNCTION public.enforce_convoy_message_sender_name() FROM anon, authenticated, public;