alter table public.cw_accounts add column if not exists last_topup date;

create or replace function public.cw_daily_topup(_u uuid) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.cw_accounts(user_id) values(_u) on conflict do nothing;
 update public.cw_accounts set balance=greatest(balance,10), last_topup=current_date where user_id=_u and (last_topup is null or last_topup<current_date);
$$;
revoke all on function public.cw_daily_topup(uuid) from public, anon, authenticated;

drop function if exists public.cw_shop();
create function public.cw_shop() returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is not null then perform public.cw_daily_topup(auth.uid()); end if;
 return jsonb_build_object(
  'balance',coalesce((select balance from public.cw_accounts where user_id=auth.uid()),100),
  'freeSpins',coalesce((select free_spins from public.cw_accounts where user_id=auth.uid()),5),
  'owned',coalesce((select jsonb_agg(card_id) from public.cw_owned where user_id=auth.uid()),'[]'::jsonb),
  'spins',coalesce((select jsonb_object_agg(category,count) from public.cw_spins where user_id=auth.uid() and count>0),'{}'::jsonb));
end $$;
revoke all on function public.cw_shop() from public, anon; grant execute on function public.cw_shop() to authenticated;

create or replace function public.cw_repair(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); c integer; b integer; cost integer;
begin
 if u is null then raise exception 'Sign in required'; end if;
 perform public.cw_daily_topup(u);
 select condition into c from public.cw_wear where user_id=u and card_id=_card for update;
 if c is null or c>=100 then raise exception 'Card is not worn'; end if;
 cost:=100-c;
 select balance into b from public.cw_accounts where user_id=u for update;
 if b<cost then raise exception 'Not enough RPM'; end if;
 update public.cw_accounts set balance=balance-cost where user_id=u returning balance into b;
 update public.cw_wear set condition=100 where user_id=u and card_id=_card;
 return jsonb_build_object('balance',b,'card',_card,'cost',cost);
end $$;
revoke all on function public.cw_repair(text) from public, anon; grant execute on function public.cw_repair(text) to authenticated;