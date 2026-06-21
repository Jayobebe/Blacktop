
-- Trigger functions: revoke direct execute access. Triggers still fire normally.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.burn_ride_data_on_end() FROM PUBLIC, anon, authenticated;
