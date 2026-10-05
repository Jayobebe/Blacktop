create or replace function public.cw_wear_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 2, 'road', 1, 'race', 2, 'past', 10, 'extra', 1, 'cap', 45, 'rest', 10)
$$;
revoke all on function public.cw_wear_rules() from public, anon;
grant execute on function public.cw_wear_rules() to authenticated;

create or replace function public.cw_wear_loss(_card text, _rounds integer) returns integer language sql stable set search_path=public as $$
  select case when coalesce(_rounds, 0) <= 0 then 0
    else least(45, _rounds * (case when public.cw_is_race(_card) then 2 else 1 end) + greatest(0, _rounds - 10)) end
$$;
revoke all on function public.cw_wear_loss(text,integer) from public, anon, authenticated;

create or replace function public.cw_wear_rounds(_user uuid, _cards text[], _rounds integer[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare i integer; loss integer; fought text[] := '{}'::text[];
begin
  if _user is null or _cards is null or _rounds is null or cardinality(_cards) <> cardinality(_rounds) then return; end if;
  for i in 1..cardinality(_cards) loop
    continue when _cards[i] is null or coalesce(_rounds[i], 0) <= 0;
    loss := public.cw_wear_loss(_cards[i], _rounds[i]);
    fought := array_append(fought, _cards[i]);
    insert into public.cw_wear(user_id,card_id,condition) values(_user,left(_cards[i],120),100-loss)
    on conflict(user_id,card_id) do update set condition=greatest(0,cw_wear.condition-loss);
  end loop;
  update public.cw_wear w set condition=least(100,w.condition+10) where w.user_id=_user and w.condition<100 and not (w.card_id = any(fought));
end $$;
revoke all on function public.cw_wear_rounds(uuid,text[],integer[]) from public, anon, authenticated;

create or replace function public.cw_apply_wear(_p1 uuid, _p2 uuid, _d1 text[], _d2 text[], _log jsonb)
 returns void language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare cards text[]; rounds integer[];
begin
  select coalesce(array_agg(t.card), '{}'::text[]), coalesce(array_agg(t.n), '{}'::integer[]) into cards, rounds
    from (select e->>'card1' as card, count(*)::integer as n from jsonb_array_elements(coalesce(_log,'[]')) e where e->>'card1' is not null group by 1) t;
  perform public.cw_wear_rounds(_p1, cards, rounds);
  select coalesce(array_agg(t.card), '{}'::text[]), coalesce(array_agg(t.n), '{}'::integer[]) into cards, rounds
    from (select e->>'card2' as card, count(*)::integer as n from jsonb_array_elements(coalesce(_log,'[]')) e where e->>'card2' is not null group by 1) t;
  perform public.cw_wear_rounds(_p2, cards, rounds);
  delete from public.cw_wear where user_id=_p1 and card_id in (select e->>'r1' from jsonb_array_elements(coalesce(_log,'[]')) e where e ? 'r1');
  delete from public.cw_wear where user_id=_p2 and card_id in (select e->>'r2' from jsonb_array_elements(coalesce(_log,'[]')) e where e ? 'r2');
end $function$;
revoke all on function public.cw_apply_wear(uuid,uuid,text[],text[],jsonb) from public, anon, authenticated;

create or replace function public.cw_report_wear(_run uuid, _deck text[], _rounds integer[], _raptured text)
 returns table(card_id text, condition integer) language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid:=auth.uid(); previous uuid; last_r date;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if _run is null then raise exception 'Battle required'; end if;
 if _deck is null or cardinality(_deck)<>5 or (select count(distinct x) from unnest(_deck) x)<>5 then raise exception 'Deck needs five unique cards'; end if;
 if _rounds is null or cardinality(_rounds)<>5 or exists(select 1 from unnest(_rounds) x where x is null or x<0 or x>400)
    or (select sum(x) from unnest(_rounds) x)<1 then raise exception 'Invalid battle'; end if;
 perform public.cw_daily_topup(u);
 select a.last_wear_run, a.last_rapture into previous, last_r from public.cw_accounts a where a.user_id=u for update;
 if previous is distinct from _run then
   if not public.check_rate_limit('cw_wear_offline', 6, 60) then raise exception 'Too many battles'; end if;
   perform public.cw_wear_rounds(u,_deck,_rounds);
   update public.cw_accounts a set last_wear_run=_run where a.user_id=u;
   if _raptured is not null and _raptured=any(_deck) and last_r is distinct from current_date then
     delete from public.cw_wear w where w.user_id=u and w.card_id=_raptured;
     update public.cw_accounts a set last_rapture=current_date where a.user_id=u;
   end if;
 end if;
 return query select w.card_id,w.condition from public.cw_wear w where w.user_id=u;
end $function$;
revoke all on function public.cw_report_wear(uuid,text[],integer[],text) from public, anon;
grant execute on function public.cw_report_wear(uuid,text[],integer[],text) to authenticated;