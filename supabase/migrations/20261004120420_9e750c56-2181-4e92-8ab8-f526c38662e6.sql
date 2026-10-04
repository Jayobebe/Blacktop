revoke execute on function public.hazards_in_bbox from public, anon;
revoke execute on function public.list_crew_leaderboard from public, anon;
revoke execute on function public.remove_my_hazard from public, anon;
revoke execute on function public.report_hazard from public, anon;
revoke execute on function public.vote_hazard from public, anon;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_push_service_endpoint' loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;