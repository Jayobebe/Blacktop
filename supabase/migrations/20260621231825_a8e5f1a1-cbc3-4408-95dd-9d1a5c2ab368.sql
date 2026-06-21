REVOKE EXECUTE ON FUNCTION public.burn_ride_data_on_end() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.burn_ride_data_on_end() TO service_role;