alter table public.cw_catalog add column if not exists price integer not null default 0 check (price >= 0);
insert into public.cw_catalog(id,vehicle,ratings,price) values ('911','car','{80,30,51,62,86}',0),('gt3r','car','{74,30,60,58,92}',0),('m3','car','{70,30,44,80,72}',0),('m4gt3','car','{74,30,60,56,88}',0),('296gtb','car','{85,30,68,58,86}',0),('296gt3','car','{74,30,62,55,91}',0),('750s','car','{85,30,66,55,85}',0),('720sgt3','car','{74,30,59,55,89}',0),('amggtbs','car','{83,30,62,57,84}',0),('amggt3','car','{74,30,58,58,88}',0),('gryaris','car','{49,30,31,72,82}',0),('suprag4','car','{60,30,47,62,80}',0),('civic','car','{65,30,35,76,80}',0),('nsxgt3','car','{70,30,58,56,87}',0),('mustangdh','car','{63,30,43,74,66}',0),('rally','car','{38,30,36,60,90}',0),('mx5','car','{45,30,25,82,78}',0),('mx5cup','car','{42,30,25,64,84}',0),('gti','car','{56,30,25,84,70}',0),('gtitcr','car','{56,30,42,62,82}',0),('mt07','bike','{42,50,55,72,70}',0),('r6','bike','{61,79,77,40,90}',0),('ninja','bike','{34,53,41,70,80}',0),('zx10rr','bike','{81,92,99,34,90}',0),('sv650','bike','{42,46,54,78,68}',0),('gsxr','bike','{76,86,95,36,86}',0),('fireblade','bike','{74,73,91,46,84}',0),('firebladesbk','bike','{81,92,99,34,90}',0),('panigale','bike','{74,73,92,44,86}',0),('v4rsbk','bike','{83,96,99,34,93}',0),('gs','bike','{45,36,67,96,58}',0),('s1000','bike','{81,92,99,36,90}',0),('rs660f','bike','{49,63,67,64,82}',0),('rs660','bike','{52,79,72,42,90}',0),('890duke','bike','{52,60,73,62,82}',0),('rc8c','bike','{60,83,85,38,92}',0),('striple','bike','{56,60,75,64,84}',0),('moto2','bike','{72,89,82,36,90}',0),('f3rr','bike','{63,66,83,52,84}',0),('f3ss','bike','{68,83,85,38,88}',0),('c8r','car','{74,30,56,82,88}',150),('c7r','car','{73,30,55,82,86}',150),('rsr19','car','{74,30,57,80,92}',150),('rsr17','car','{73,30,56,80,90}',150),('488gte','car','{74,30,56,80,90}',150),('m8gte','car','{74,30,56,78,86}',150),('m6gtlm','car','{73,30,56,76,84}',150),('fordgt','car','{76,30,55,82,90}',150),('vantagegte','car','{74,30,56,80,88}',150),('lexusrcf','car','{72,30,54,76,84}',150),('rb19','car','{92,30,97,40,99}',300),('w11','car','{92,30,99,40,99}',300),('f2004','car','{99,30,99,38,96}',300),('mp44','car','{85,30,95,34,88}',300),('fw14b','car','{88,30,99,36,94}',300),('w07','car','{94,30,99,40,95}',300),('rb9','car','{85,30,94,38,95}',300),('lotus79','car','{70,30,82,32,86}',300),('mcl38','car','{92,30,97,40,98}',300),('bgp001','car','{85,30,96,38,93}',300),('m1000tt','bike','{85,79,98,64,86}',150),('firebladett','bike','{83,76,97,62,85}',150),('zx10tt','bike','{81,76,97,62,84}',150),('gsxrtt','bike','{79,76,96,62,84}',150),('r1tt','bike','{79,76,95,62,84}',150),('norton','bike','{81,73,97,60,82}',150),('shinden','bike','{63,66,73,24,76}',150),('rc30','bike','{56,60,70,58,78}',150),('ow01','bike','{58,60,73,58,78}',150),('striplett','bike','{68,76,82,58,86}',150),('gp23','bike','{98,99,99,30,96}',300),('rc213v','bike','{92,99,99,30,97}',300),('m1_15','bike','{92,99,99,32,98}',300),('gsxrr','bike','{90,99,99,32,97}',300),('rc16','bike','{95,99,99,30,95}',300),('rsgp','bike','{95,99,99,30,96}',300),('rc211v','bike','{86,92,99,30,94}',300),('gp7','bike','{85,92,99,30,90}',300),('m1_04','bike','{85,92,99,30,95}',300),('nsr500','bike','{81,86,99,28,93}',300)
on conflict (id) do update set vehicle=excluded.vehicle, ratings=excluded.ratings, price=excluded.price;
create table public.cw_owned(user_id uuid not null references auth.users(id) on delete cascade, card_id text not null references public.cw_catalog(id), bought_at timestamptz not null default now(), primary key(user_id, card_id));
grant select on public.cw_owned to authenticated; grant all on public.cw_owned to service_role;
alter table public.cw_owned enable row level security;
create policy "Own bought cards" on public.cw_owned for select to authenticated using (auth.uid() = user_id);
create or replace function public.cw_buy(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); p integer; b integer;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select price into p from public.cw_catalog where id=_card;
 if p is null or p<=0 then raise exception 'Card not for sale'; end if;
 insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
 select balance into b from public.cw_accounts where user_id=u for update;
 if exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then raise exception 'Already owned'; end if;
 if b<p then raise exception 'Not enough RPM'; end if;
 update public.cw_accounts set balance=balance-p where user_id=u returning balance into b;
 insert into public.cw_owned(user_id,card_id) values(u,_card);
 return jsonb_build_object('balance',b,'card',_card);
end $$;
revoke all on function public.cw_buy(text) from public, anon; grant execute on function public.cw_buy(text) to authenticated;
create or replace function public.cw_shop() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('balance',coalesce((select balance from public.cw_accounts where user_id=auth.uid()),100),'owned',coalesce((select jsonb_agg(card_id) from public.cw_owned where user_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function public.cw_shop() from public, anon; grant execute on function public.cw_shop() to authenticated;
do $$ declare d text; begin
 select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer)'::regprocedure) into d;
 if position('(select count(*) from public.cw_catalog where id=any(_deck))<>5 then' in d)=0 then raise exception 'cw_action shape changed'; end if;
 d:=replace(d,'(select count(*) from public.cw_catalog where id=any(_deck))<>5 then','(select count(*) from public.cw_catalog where id=any(_deck))<>5 or exists(select 1 from public.cw_catalog c where c.id=any(_deck) and c.price>0 and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id)) then');
 execute d;
end $$;