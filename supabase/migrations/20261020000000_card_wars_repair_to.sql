-- Card Wars: a part repair. A worn card can be brought back to 60 % (clear of
-- the 50 % line where ratings start to fade) for the share of the full price,
-- or all the way as before. One function with a default, so an app that still
-- calls cw_repair(_card) gets the full repair it always did.

drop function if exists public.cw_repair(text);

create or replace function public.cw_repair(_card text, _to integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare u uuid := auth.uid(); c integer; b integer; cost integer; p integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _to is null or _to not in (60, 100) then raise exception 'Repair is to 60 or 100'; end if;
  perform public.cw_daily_topup(u);
  select condition into c from public.cw_wear where user_id=u and card_id=_card for update;
  if c is null or c>=_to then raise exception 'Card is not worn'; end if;
  -- A rider's own card isn't in the catalogue: it's priced as a middling one.
  select price into p from public.cw_catalog where id=_card and category is not null;
  cost := greatest(1, ceil((_to-c) * coalesce(p,100) / 400.0)::integer);
  select balance into b from public.cw_accounts where user_id=u for update;
  if b<cost then raise exception 'Not enough RPM'; end if;
  update public.cw_accounts set balance=balance-cost where user_id=u returning balance into b;
  update public.cw_wear set condition=_to where user_id=u and card_id=_card;
  return jsonb_build_object('balance',b,'card',_card,'cost',cost,'condition',_to);
end $function$;

revoke all on function public.cw_repair(text, integer) from public, anon;
grant execute on function public.cw_repair(text, integer) to authenticated;

-- The app's probe: the part repair is here.
create or replace function public.cw_repair_rules()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$ select jsonb_build_object('part', 60) $$;

revoke all on function public.cw_repair_rules() from public, anon;
grant execute on function public.cw_repair_rules() to authenticated;
