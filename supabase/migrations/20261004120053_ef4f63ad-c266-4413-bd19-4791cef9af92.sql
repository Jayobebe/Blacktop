create table public.cw_wear(user_id uuid not null references auth.users(id) on delete cascade, card_id text not null, condition integer not null default 100 check(condition between 0 and 100), primary key(user_id, card_id));
grant select on public.cw_wear to authenticated;
grant all on public.cw_wear to service_role;
alter table public.cw_wear enable row level security;
create policy "Own card wear" on public.cw_wear for select to authenticated using(auth.uid()=user_id);

create or replace function public.cw_is_race(_card text) returns boolean language sql immutable set search_path=public as $$ select _card = any(array['gr86','gt3r','rally','r6','s1000','rs660']) $$;

create or replace function public.cw_wear_mult(_user uuid, _card text, _cat integer) returns numeric language plpgsql stable security definer set search_path=public as $$
declare c integer; g numeric;
begin
  select condition into c from public.cw_wear where user_id=_user and card_id=_card;
  c := coalesce(c, 100);
  g := case when c >= 50 then 1 else 1 - (50 - c) * 0.01 end;
  if _cat = 4 and public.cw_is_race(_card) then g := g * (0.6 + 0.4 * c / 100.0); end if;
  return g;
end $$;

create or replace function public.cw_apply_wear(_p1 uuid, _p2 uuid, _d1 text[], _d2 text[], _log jsonb) returns void language plpgsql security definer set search_path=public as $$
declare side integer; u uuid; d text[]; fought text[]; card text;
begin
  for side in 1..2 loop
    u := case side when 1 then _p1 else _p2 end;
    d := case side when 1 then _d1 else _d2 end;
    continue when u is null or d is null;
    select coalesce(array_agg(distinct e->>('card'||side)), '{}') into fought from jsonb_array_elements(coalesce(_log,'[]')) e;
    foreach card in array d loop
      insert into public.cw_wear(user_id, card_id, condition)
      values(u, card, case when card = any(fought) then 100 - case when public.cw_is_race(card) then 15 else 8 end else 100 end)
      on conflict (user_id, card_id) do update set condition = case when card = any(fought)
        then greatest(0, cw_wear.condition - case when public.cw_is_race(card) then 15 else 8 end)
        else least(100, cw_wear.condition + 10) end;
    end loop;
  end loop;
end $$;
revoke all on function public.cw_wear_mult(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.cw_apply_wear(uuid,uuid,text[],text[],jsonb) from public, anon, authenticated;

create or replace function public.cw_my_wear() returns table(card_id text, condition integer) language sql stable security definer set search_path=public as $$ select card_id, condition from public.cw_wear where user_id = auth.uid() $$;
grant execute on function public.cw_my_wear() to authenticated;

do $migration$
declare d text;
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer)'::regprocedure) into d;
  if position('cw_wear_mult' in d) > 0 then return; end if;
  if position('select vehicle,ratings[cat] into v1,s1 from public.cw_catalog where id=m.d1[m.move1+1]' in d) = 0 then raise exception 'cw_action shape changed'; end if;
  d := replace(d, 'select vehicle,ratings[cat] into v1,s1 from public.cw_catalog where id=m.d1[m.move1+1]', 'select vehicle,ratings[cat] into v1,s1 from public.cw_catalog where id=m.d1[m.move1+1];s1:=round(s1*public.cw_wear_mult(m.p1,m.d1[m.move1+1],cat))');
  d := replace(d, 'select vehicle,ratings[cat] into v2,s2 from public.cw_catalog where id=m.d2[m.move2+1]', 'select vehicle,ratings[cat] into v2,s2 from public.cw_catalog where id=m.d2[m.move2+1];s2:=round(s2*public.cw_wear_mult(m.p2,m.d2[m.move2+1],cat))');
  d := replace(d, 'update public.cw_accounts set balance=balance+case', 'perform public.cw_apply_wear(m.p1,m.p2,m.d1,m.d2,m.log);update public.cw_accounts set balance=balance+case');
  execute d;
end $migration$;