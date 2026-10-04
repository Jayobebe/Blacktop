alter table public.cw_catalog add column if not exists category text;
update public.cw_catalog c set category=v.cat from (values ('911','road'),('gt3r','race'),('m3','road'),('m4gt3','race'),('296gtb','road'),('296gt3','race'),('750s','road'),('720sgt3','race'),('amggtbs','road'),('amggt3','race'),('gryaris','road'),('suprag4','race'),('civic','road'),('nsxgt3','race'),('mustangdh','road'),('rally','race'),('mx5','road'),('mx5cup','race'),('gti','road'),('gtitcr','race'),('mt07','road'),('r6','race'),('ninja','road'),('zx10rr','race'),('sv650','road'),('gsxr','race'),('fireblade','road'),('firebladesbk','race'),('panigale','road'),('v4rsbk','race'),('gs','road'),('s1000','race'),('rs660f','road'),('rs660','race'),('890duke','road'),('rc8c','race'),('striple','road'),('moto2','race'),('f3rr','road'),('f3ss','race'),('c8r','gtlm'),('c7r','gtlm'),('rsr19','gtlm'),('rsr17','gtlm'),('488gte','gtlm'),('m8gte','gtlm'),('m6gtlm','gtlm'),('fordgt','gtlm'),('vantagegte','gtlm'),('lexusrcf','gtlm'),('rb19','f1'),('w11','f1'),('f2004','f1'),('mp44','f1'),('fw14b','f1'),('w07','f1'),('rb9','f1'),('lotus79','f1'),('mcl38','f1'),('bgp001','f1'),('m1000tt','tt'),('firebladett','tt'),('zx10tt','tt'),('gsxrtt','tt'),('r1tt','tt'),('norton','tt'),('shinden','tt'),('rc30','tt'),('ow01','tt'),('striplett','tt'),('gp23','motogp'),('rc213v','motogp'),('m1_15','motogp'),('gsxrr','motogp'),('rc16','motogp'),('rsgp','motogp'),('rc211v','motogp'),('gp7','motogp'),('m1_04','motogp'),('nsr500','motogp')) v(id,cat) where c.id=v.id;
update public.cw_catalog set price=case category when 'gtlm' then 180 when 'tt' then 180 when 'f1' then 400 when 'motogp' then 400 else 0 end;

alter table public.cw_accounts add column if not exists free_spins integer not null default 5 check (free_spins>=0), add column if not exists last_offline_reward timestamptz;

create table public.cw_spins(user_id uuid not null references auth.users(id) on delete cascade, category text not null, count integer not null default 0 check(count>=0), primary key(user_id,category));
grant select on public.cw_spins to authenticated; grant all on public.cw_spins to service_role;
alter table public.cw_spins enable row level security;
create policy "Own bonus spins" on public.cw_spins for select to authenticated using (auth.uid()=user_id);

create or replace function public.cw_cat_cost(_cat text, _spin boolean) returns integer language sql immutable set search_path=public as $$
 select case _cat when 'road' then 60 when 'race' then 100 when 'gtlm' then 180 when 'tt' then 180 when 'f1' then 400 when 'motogp' then 400 end / case when _spin then 6 else 1 end
$$;

create or replace function public.cw_shop() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'balance',coalesce((select balance from public.cw_accounts where user_id=auth.uid()),100),
  'freeSpins',coalesce((select free_spins from public.cw_accounts where user_id=auth.uid()),5),
  'owned',coalesce((select jsonb_agg(card_id) from public.cw_owned where user_id=auth.uid()),'[]'::jsonb),
  'spins',coalesce((select jsonb_object_agg(category,count) from public.cw_spins where user_id=auth.uid() and count>0),'{}'::jsonb));
$$;

create or replace function public.cw_buy(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); p integer; b integer;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select public.cw_cat_cost(category,false) into p from public.cw_catalog where id=_card;
 if p is null then raise exception 'Card not for sale'; end if;
 insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
 select balance into b from public.cw_accounts where user_id=u for update;
 if exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then raise exception 'Already owned'; end if;
 if b<p then raise exception 'Not enough RPM'; end if;
 update public.cw_accounts set balance=balance-p where user_id=u returning balance into b;
 insert into public.cw_owned(user_id,card_id) values(u,_card);
 return jsonb_build_object('balance',b,'card',_card);
end $$;

create or replace function public.cw_spin(_cat text, _free boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); a public.cw_accounts%rowtype; cost integer; r double precision; card text; amount integer:=0; extra integer:=0; kind text; bonus integer; cat text:=_cat;
begin
 if u is null then raise exception 'Sign in required'; end if;
 insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
 select * into a from public.cw_accounts where user_id=u for update;
 if _free then
  if a.free_spins<=0 then raise exception 'No free spins left'; end if;
  update public.cw_accounts set free_spins=free_spins-1 where user_id=u;
  r:=random();
  cat:=case when r<.50 then 'road' when r<.80 then 'race' when r<.88 then 'gtlm' when r<.96 then 'tt' when r<.98 then 'f1' else 'motogp' end;
  select id into card from public.cw_catalog c where c.category=cat and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1;
  if card is null then select id into card from public.cw_catalog c where c.category in('road','race') and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1; end if;
  if card is null then update public.cw_accounts set balance=balance+50 where user_id=u; kind:='rpm'; amount:=50;
  else insert into public.cw_owned(user_id,card_id) values(u,card); kind:='card'; end if;
 else
  if cat not in('road','race','gtlm','tt','f1','motogp') then raise exception 'Invalid category'; end if;
  cost:=public.cw_cat_cost(cat,true);
  select count into bonus from public.cw_spins where user_id=u and category=cat for update;
  if coalesce(bonus,0)>0 then update public.cw_spins set count=count-1 where user_id=u and category=cat;
  else
   if a.balance<cost then raise exception 'Not enough RPM'; end if;
   update public.cw_accounts set balance=balance-cost where user_id=u;
  end if;
  r:=random();
  if r<.20 then
   select id into card from public.cw_catalog where category=cat order by random() limit 1;
   if exists(select 1 from public.cw_owned where user_id=u and card_id=card) then kind:='duplicate'; amount:=cost; update public.cw_accounts set balance=balance+amount where user_id=u;
   else insert into public.cw_owned(user_id,card_id) values(u,card); kind:='card'; end if;
  elsif r<.75 then
   kind:='rpm'; amount:=greatest(1,round(cost*(.3+random()*1.2))::integer); update public.cw_accounts set balance=balance+amount where user_id=u;
  else
   kind:='spins'; extra:=case when random()<.25 then 2 else 1 end;
   insert into public.cw_spins(user_id,category,count) values(u,cat,extra) on conflict(user_id,category) do update set count=public.cw_spins.count+extra;
  end if;
 end if;
 return jsonb_build_object('kind',kind,'card',card,'category',cat,'rpm',amount,'spins',extra) || public.cw_shop();
end $$;

create or replace function public.cw_reward_offline(_result text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); a public.cw_accounts%rowtype; amount integer;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if _result not in('win','draw','loss') then raise exception 'Invalid result'; end if;
 insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
 select * into a from public.cw_accounts where user_id=u for update;
 if a.last_offline_reward>now()-interval '90 seconds' then return jsonb_build_object('rpm',0,'balance',a.balance); end if;
 amount:=case _result when 'win' then 10 when 'draw' then 4 else 2 end;
 update public.cw_accounts set balance=balance+amount,last_offline_reward=now() where user_id=u returning balance into a.balance;
 return jsonb_build_object('rpm',amount,'balance',a.balance);
end $$;

revoke all on function public.cw_spin(text,boolean) from public, anon; grant execute on function public.cw_spin(text,boolean) to authenticated;
revoke all on function public.cw_reward_offline(text) from public, anon; grant execute on function public.cw_reward_offline(text) to authenticated;
revoke all on function public.cw_shop() from public, anon; grant execute on function public.cw_shop() to authenticated;

do $$ declare d text; begin
 select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer)'::regprocedure) into d;
 if position('then 20 else 0' in d)=0 then raise exception 'cw_action shape changed'; end if;
 d:=replace(d,'then 20 else 0','then 70 else 0');
 execute d;
end $$;