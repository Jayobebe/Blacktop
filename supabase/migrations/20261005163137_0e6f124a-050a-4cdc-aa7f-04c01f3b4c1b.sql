alter table public.cw_catalog add column if not exists maker text;
alter table public.cw_matches add column if not exists rt1 jsonb, add column if not exists rt2 jsonb;

create table public.cw_own_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_key text not null,
  ratings integer[] not null,
  set_at timestamptz not null default now(),
  primary key (user_id, card_key)
);
grant all on public.cw_own_cards to service_role;
alter table public.cw_own_cards enable row level security;

create or replace function public.cw_slot_ratings(_rt jsonb, _idx integer, _base integer[]) returns integer[]
language sql immutable set search_path to 'public','pg_temp' as $$
  select case when _rt is null or jsonb_typeof(_rt->_idx) is distinct from 'array' then _base
    else array(select x::integer from jsonb_array_elements_text(_rt->_idx) with ordinality t(x,o) order by o) end
$$;

create table public.cw_swaps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  a uuid not null references auth.users(id) on delete cascade,
  b uuid references auth.users(id) on delete cascade,
  a_ready boolean not null default false,
  b_ready boolean not null default false,
  a_rpm integer not null default 0,
  b_rpm integer not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create table public.cw_swap_items (
  swap_id uuid not null references public.cw_swaps(id) on delete cascade,
  side smallint not null,
  card_id text not null references public.cw_catalog(id),
  primary key (swap_id, side, card_id)
);
grant all on public.cw_swaps to service_role;
grant all on public.cw_swap_items to service_role;
alter table public.cw_swaps enable row level security;
alter table public.cw_swap_items enable row level security;
create index on public.cw_swaps(a);
create index on public.cw_swaps(b);

create or replace function public.cw_swap_view(_swap uuid) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype; me smallint;
begin
  if u is null then raise exception 'Sign in required'; end if;
  update public.cw_swaps set status='expired' where id=_swap and status='open' and expires_at<now();
  select * into s from public.cw_swaps where id=_swap;
  if not found or u not in (s.a, coalesce(s.b, s.a)) then raise exception 'Swap not found'; end if;
  me := case when u=s.a then 1 else 2 end;
  return jsonb_build_object('id',s.id,'code',s.code,'status',s.status,'joined',s.b is not null,'expires',s.expires_at,
    'mine',jsonb_build_object('cards',coalesce((select jsonb_agg(i.card_id order by i.card_id) from public.cw_swap_items i where i.swap_id=s.id and i.side=me),'[]'::jsonb),
      'rpm',case when me=1 then s.a_rpm else s.b_rpm end,'ready',case when me=1 then s.a_ready else s.b_ready end),
    'theirs',jsonb_build_object('cards',coalesce((select jsonb_agg(i.card_id order by i.card_id) from public.cw_swap_items i where i.swap_id=s.id and i.side=3-me),'[]'::jsonb),
      'rpm',case when me=1 then s.b_rpm else s.a_rpm end,'ready',case when me=1 then s.b_ready else s.a_ready end,
      'name',(select display_name from public.profiles where id=case when me=1 then s.b else s.a end)),
    'balance',(select balance from public.cw_accounts where user_id=u));
end $$;

create or replace function public.cw_swap_open() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); c text; s public.cw_swaps%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  update public.cw_swaps set status='expired' where status='open' and expires_at<now() and (a=u or b=u);
  if (select count(*) from public.cw_swaps where status='open' and (a=u or b=u))>=3 then raise exception 'Too many open swaps'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text),1,6));
    exit when not exists(select 1 from public.cw_swaps where code=c);
  end loop;
  insert into public.cw_swaps(code,a) values(c,u) returning * into s;
  return public.cw_swap_view(s.id);
end $$;

create or replace function public.cw_swap_join(_code text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into s from public.cw_swaps where code=upper(trim(_code)) for update;
  if not found or s.status<>'open' or s.expires_at<now() then raise exception 'Swap not found'; end if;
  if s.a<>u then
    if s.b is not null and s.b<>u then raise exception 'Swap full'; end if;
    update public.cw_swaps set b=u where id=s.id;
  end if;
  return public.cw_swap_view(s.id);
end $$;

create or replace function public.cw_swap_set(_swap uuid, _cards text[], _rpm integer) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype; me smallint; bal integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into s from public.cw_swaps where id=_swap for update;
  if not found or u not in (s.a, coalesce(s.b,s.a)) or s.status<>'open' or s.expires_at<now() then raise exception 'Swap not found'; end if;
  me := case when u=s.a then 1 else 2 end;
  _cards := coalesce(_cards,'{}');
  if cardinality(_cards)>5 or (select count(distinct x) from unnest(_cards) x)<>cardinality(_cards) then raise exception 'Up to five cards'; end if;
  if exists(select 1 from unnest(_cards) x where not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=x)) then raise exception 'Card not owned'; end if;
  select balance into bal from public.cw_accounts where user_id=u;
  if _rpm is null or _rpm<0 or _rpm>coalesce(bal,0) then raise exception 'Not enough RPM'; end if;
  delete from public.cw_swap_items where swap_id=s.id and side=me;
  insert into public.cw_swap_items(swap_id,side,card_id) select s.id,me,x from unnest(_cards) x;
  update public.cw_swaps set a_ready=false,b_ready=false,
    a_rpm=case when me=1 then _rpm else a_rpm end, b_rpm=case when me=2 then _rpm else b_rpm end,
    expires_at=greatest(expires_at, now()+interval '10 minutes') where id=s.id;
  return public.cw_swap_view(s.id);
end $$;

create or replace function public.cw_swap_ready(_swap uuid, _ready boolean) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype; me smallint; ba integer; bb integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into s from public.cw_swaps where id=_swap for update;
  if not found or u not in (s.a, coalesce(s.b,s.a)) or s.status<>'open' or s.expires_at<now() then raise exception 'Swap not found'; end if;
  me := case when u=s.a then 1 else 2 end;
  if me=1 then s.a_ready := coalesce(_ready,false); else s.b_ready := coalesce(_ready,false); end if;
  update public.cw_swaps set a_ready=s.a_ready, b_ready=s.b_ready where id=s.id;
  if s.a_ready and s.b_ready and s.b is not null then
    if not exists(select 1 from public.cw_swap_items where swap_id=s.id) and s.a_rpm=0 and s.b_rpm=0 then raise exception 'Nothing to swap'; end if;
    insert into public.cw_accounts(user_id) values(s.a),(s.b) on conflict do nothing;
    perform 1 from public.cw_accounts where user_id in (s.a,s.b) order by user_id for update;
    select balance into ba from public.cw_accounts where user_id=s.a;
    select balance into bb from public.cw_accounts where user_id=s.b;
    if exists(select 1 from public.cw_accounts where user_id in (s.a,s.b) and active_code is not null) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Finish your current battle first'; end if;
    if ba<s.a_rpm or bb<s.b_rpm then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Not enough RPM'; end if;
    if exists(select 1 from public.cw_swap_items i where i.swap_id=s.id and not exists(select 1 from public.cw_owned o where o.user_id=case when i.side=1 then s.a else s.b end and o.card_id=i.card_id)) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Card not owned'; end if;
    if exists(select 1 from public.cw_swap_items i where i.swap_id=s.id and exists(select 1 from public.cw_owned o where o.user_id=case when i.side=1 then s.b else s.a end and o.card_id=i.card_id)) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Already owned'; end if;
    delete from public.cw_owned o using public.cw_swap_items i where i.swap_id=s.id and o.card_id=i.card_id and o.user_id=case when i.side=1 then s.a else s.b end;
    delete from public.cw_wear w using public.cw_swap_items i where i.swap_id=s.id and w.card_id=i.card_id and w.user_id=case when i.side=1 then s.a else s.b end;
    insert into public.cw_owned(user_id,card_id) select case when i.side=1 then s.b else s.a end, i.card_id from public.cw_swap_items i where i.swap_id=s.id;
    update public.cw_accounts set balance=balance-s.a_rpm+s.b_rpm where user_id=s.a;
    update public.cw_accounts set balance=balance-s.b_rpm+s.a_rpm where user_id=s.b;
    update public.cw_trades t set status='cancelled' from public.cw_swap_items i where i.swap_id=s.id and t.card_id=i.card_id and t.status='open' and t.seller=case when i.side=1 then s.a else s.b end;
    update public.cw_swaps set status='done' where id=s.id;
  end if;
  return public.cw_swap_view(s.id);
end $$;

create or replace function public.cw_swap_cancel(_swap uuid) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  update public.cw_swaps set status='cancelled' where id=_swap and status='open' and (a=u or b=u);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.cw_swap_mine() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  update public.cw_swaps set status='expired' where status='open' and expires_at<now() and (a=u or b=u);
  return coalesce((select jsonb_agg(id order by created_at desc) from public.cw_swaps where status='open' and (a=u or b=u)),'[]'::jsonb);
end $$;

create or replace function public.cw_trade_refund_on_close() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if old.status='open' and new.status<>'open' and new.status<>'sold' then
    with gone as (update public.cw_offers set status='declined' where trade_id=new.id and status='pending' returning buyer,rpm)
    update public.cw_accounts a set balance=a.balance+g.total from (select buyer,sum(rpm) total from gone group by buyer) g where a.user_id=g.buyer;
  end if;
  return new;
end $$;
drop trigger if exists cw_trade_refund_on_close on public.cw_trades;
create trigger cw_trade_refund_on_close after update of status on public.cw_trades for each row execute function public.cw_trade_refund_on_close();

create table public.cw_sets_claimed (
  user_id uuid not null references auth.users(id) on delete cascade,
  maker text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, maker)
);
grant all on public.cw_sets_claimed to service_role;
alter table public.cw_sets_claimed enable row level security;

create or replace function public.cw_sets() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('maker',c.maker,'total',count(*),
      'owned',count(o.card_id),'claimed',exists(select 1 from public.cw_sets_claimed s where s.user_id=u and s.maker=c.maker),
      'rpm',least(150,greatest(50,round(sum(c.price)*0.15)::integer))) order by c.maker)
    from public.cw_catalog c left join public.cw_owned o on o.card_id=c.id and o.user_id=u
    where c.category in ('road','race') and c.maker is not null group by c.maker),'[]'::jsonb);
end $$;

create or replace function public.cw_set_claim(_maker text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); pay integer; best text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.cw_catalog where maker=_maker and category in ('road','race')) then raise exception 'Unknown set'; end if;
  if exists(select 1 from public.cw_catalog c where c.maker=_maker and c.category in ('road','race') and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id)) then raise exception 'Set not complete'; end if;
  insert into public.cw_sets_claimed(user_id,maker) values(u,_maker) on conflict do nothing;
  if not found then raise exception 'Already claimed'; end if;
  select least(150,greatest(50,round(sum(price)*0.15)::integer)) into pay from public.cw_catalog where maker=_maker and category in ('road','race');
  select id into best from public.cw_catalog where maker=_maker and category in ('road','race') order by ratings[3] desc, price desc limit 1;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  update public.cw_accounts set balance=balance+pay where user_id=u;
  insert into public.cw_tags(user_id,power,card_id) values(u,'boost',best) on conflict do nothing;
  return jsonb_build_object('rpm',pay,'tag','boost:'||best) || public.cw_shop();
end $$;

create table public.cw_contracts (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  ids text[] not null,
  progress integer[] not null,
  paid boolean[] not null,
  primary key (user_id, day)
);
create table public.cw_contract_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  run text not null,
  at timestamptz not null default now(),
  primary key (user_id, run)
);
grant all on public.cw_contracts to service_role;
grant all on public.cw_contract_runs to service_role;
alter table public.cw_contracts enable row level security;
alter table public.cw_contract_runs enable row level security;

create or replace function public.cw_contract_defs() returns table(id text, target integer, rpm integer)
language sql immutable set search_path to 'public','pg_temp' as $$
  values ('win2',2,15),('play3',3,10),('corners_bike',1,10),('ko3',3,15),('f1_ko',1,25),
         ('second_win',1,15),('full_deck',1,10),('event_win',1,15),('player_win',1,25)
$$;

create or replace function public.cw_contracts_today() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); c public.cw_contracts%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into c from public.cw_contracts where user_id=u and day=current_date;
  if not found then
    insert into public.cw_contracts(user_id,day,ids,progress,paid)
    values(u,current_date,array(select d.id from public.cw_contract_defs() d order by random() limit 3),array[0,0,0],array[false,false,false])
    on conflict do nothing;
    delete from public.cw_contracts where user_id=u and day<current_date-7;
    delete from public.cw_contract_runs where user_id=u and at<now()-interval '3 days';
    select * into c from public.cw_contracts where user_id=u and day=current_date;
  end if;
  return jsonb_build_object('day',c.day,'contracts',(select jsonb_agg(jsonb_build_object('id',d.id,'target',d.target,'rpm',d.rpm,'progress',c.progress[k],'paid',c.paid[k]) order by k)
    from generate_series(1,3) k join public.cw_contract_defs() d on d.id=c.ids[k]));
end $$;

create or replace function public.cw_contract_report(_run text, _facts jsonb) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); c public.cw_contracts%rowtype; d record; f integer; earned integer := 0;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _run is null or length(_run) not between 1 and 80 or jsonb_typeof(_facts) is distinct from 'object' then raise exception 'Invalid report'; end if;
  perform public.cw_contracts_today();
  if (select count(*) from public.cw_contract_runs where user_id=u and at>current_date::timestamptz)>=40 then
    return public.cw_contracts_today() || jsonb_build_object('earned',0);
  end if;
  insert into public.cw_contract_runs(user_id,run) values(u,_run) on conflict do nothing;
  if not found then return public.cw_contracts_today() || jsonb_build_object('earned',0); end if;
  select * into c from public.cw_contracts where user_id=u and day=current_date for update;
  for k in 1..3 loop
    select * into d from public.cw_contract_defs() x where x.id=c.ids[k];
    f := least(5, greatest(0, coalesce((_facts->>d.id)::integer, 0)));
    c.progress[k] := least(d.target, c.progress[k]+f);
    if c.progress[k]>=d.target and not c.paid[k] then
      c.paid[k] := true; earned := earned + d.rpm;
    end if;
  end loop;
  update public.cw_contracts set progress=c.progress, paid=c.paid where user_id=u and day=current_date;
  if earned>0 then
    insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
    update public.cw_accounts set balance=balance+earned where user_id=u;
  end if;
  return public.cw_contracts_today() || jsonb_build_object('earned',earned,'balance',(select balance from public.cw_accounts where user_id=u));
end $$;

revoke all on function public.cw_trade_refund_on_close() from public, anon, authenticated;
revoke all on function public.cw_swap_view(uuid), public.cw_swap_open(), public.cw_swap_join(text), public.cw_swap_set(uuid,text[],integer), public.cw_swap_ready(uuid,boolean), public.cw_swap_cancel(uuid), public.cw_swap_mine(), public.cw_sets(), public.cw_set_claim(text), public.cw_contracts_today(), public.cw_contract_report(text,jsonb) from public, anon;
grant execute on function public.cw_swap_view(uuid), public.cw_swap_open(), public.cw_swap_join(text), public.cw_swap_set(uuid,text[],integer), public.cw_swap_ready(uuid,boolean), public.cw_swap_cancel(uuid), public.cw_swap_mine(), public.cw_sets(), public.cw_set_claim(text), public.cw_contracts_today(), public.cw_contract_report(text,jsonb) to authenticated;

drop function if exists public.cw_action(text, uuid, text[], integer, integer, integer, text[]);

CREATE OR REPLACE FUNCTION public.cw_action(_action text, _code uuid DEFAULT NULL::uuid, _deck text[] DEFAULT NULL::text[], _card integer DEFAULT NULL::integer, _tag integer DEFAULT NULL::integer, _round integer DEFAULT NULL::integer, _tags text[] DEFAULT NULL::text[], _own jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  u uuid := auth.uid();
  m public.cw_matches%rowtype;
  a public.cw_accounts%rowtype;
  side integer; cat integer; first_cat integer; n integer;
  s1 numeric; s2 numeric; b1 numeric := 1; b2 numeric := 1; r1 numeric := 1; r2 numeric := 1;
  damage integer; v1 text; v2 text; c1 text; c2 text; rat1 integer[]; rat2 integer[];
  victor uuid; h1 integer; h2 integer; lean_ok boolean; changed boolean := false;
  tags text[];
  rt jsonb; base integer[]; cand integer[]; cap_mean numeric; held integer[]; ow jsonb;
  ev integer; rr double precision; cr1 numeric := 1; cr2 numeric := 1; w1 numeric; w2 numeric; mid numeric; wn integer; floor_hp integer := 0; k1 integer; k2 integer; low integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _action is null or _action not in('status','create','join','play','leave') then raise exception 'Invalid action'; end if;
  perform pg_advisory_xact_lock(493817061);
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;

  if _action in('create','join') then
    if _deck is null or cardinality(_deck)<>5 or (select count(distinct x) from unnest(_deck) x)<>5
       or (select count(*) from public.cw_catalog where id=any(_deck))<>5
       or exists(select 1 from public.cw_catalog c where c.id=any(_deck) and c.category in('gtlm','tt','f1','motogp')
                 and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id))
    then raise exception 'Select five unique catalog cards'; end if;
    tags := coalesce(_tags, array['','','']);
    if cardinality(tags)<>3 then raise exception 'Invalid dog tag'; end if;
    for i in 1..3 loop
      tags[i] := coalesce(tags[i],'');
      if tags[i] not in('','~car','~bike') and not exists(select 1 from public.cw_tags t where t.user_id=u and t.power=(array['reroll','heal','boost'])[i] and t.card_id=tags[i])
      then raise exception 'Dog tag not owned'; end if;
    end loop;
    rt := '[null,null,null,null,null]'::jsonb;
    if _own is not null then
      if jsonb_typeof(_own)<>'array' or jsonb_array_length(_own)<>5 then raise exception 'Invalid own card'; end if;
      select max((ratings[1]+ratings[3]+ratings[4]+ratings[5])/4.0) into cap_mean from public.cw_catalog;
      for i in 0..4 loop
        ow := _own->i;
        continue when ow is null or jsonb_typeof(ow)<>'object';
        if coalesce(length(ow->>'key'),0) not between 1 and 120 then raise exception 'Invalid own card'; end if;
        select ratings into base from public.cw_catalog where id=_deck[i+1];
        select ratings into held from public.cw_own_cards where user_id=u and card_key=ow->>'key' and set_at>now()-interval '7 days';
        if held is null then
          cand := array(select (x)::integer from jsonb_array_elements_text(ow->'r') x);
          if cardinality(cand)<>5 then raise exception 'Invalid own card'; end if;
          for k in 1..5 loop
            if cand[k]<base[k] or cand[k]>(select max(ratings[k]) from public.cw_catalog) then raise exception 'Invalid own card'; end if;
          end loop;
          if (cand[1]+cand[3]+cand[4]+cand[5])/4.0>cap_mean then raise exception 'Invalid own card'; end if;
          insert into public.cw_own_cards(user_id,card_key,ratings,set_at) values(u,ow->>'key',cand,now())
          on conflict(user_id,card_key) do update set ratings=excluded.ratings,set_at=now();
          held := cand;
        end if;
        rt := jsonb_set(rt, array[i::text], to_jsonb(held));
      end loop;
    end if;
  end if;

  if _action='create' then
    select * into a from public.cw_accounts where user_id=u for update;
    if a.active_code is not null then raise exception 'Finish your current battle first'; end if;
    if a.balance<20 then raise exception 'Not enough RPM'; end if;
    if a.last_created_at>now()-interval '5 seconds' then raise exception 'Wait before inviting again'; end if;
    insert into public.cw_matches(p1,d1,tags1,rt1,stake,categories,penalty)
    values(u,_deck,tags,rt,20,array(select x from generate_series(1,5) x order by random()),case when random()<.125 then 2+floor(random()*4)::integer else -1 end)
    returning * into m;
    update public.cw_accounts set balance=balance-20,active_code=m.code,last_created_at=now() where user_id=u;
    changed := true;
  else
    if _code is null then select active_code into _code from public.cw_accounts where user_id=u; end if;
    if _code is null and _action<>'status' then raise exception 'Battle code required'; end if;
    if _code is not null then
      select * into m from public.cw_matches where code=_code for update;
      if not found then
        if _action='status' then update public.cw_accounts set balance=balance+20,active_code=null where user_id=u and active_code=_code;
        else raise exception 'Battle not found'; end if;
      elsif u not in(m.p1,coalesce(m.p2,m.p1)) and _action<>'join' then raise exception 'Private battle';
      end if;
    end if;
  end if;

  if m.code is not null then
    if m.deadline<now() and m.status in('waiting','playing') then
      if _action='join' and u<>m.p1 then raise exception 'Invitation expired'; end if;
      if m.status='waiting' then
        update public.cw_accounts set balance=balance+m.stake,active_code=null where user_id=m.p1;
        m.status := 'cancelled';
      else
        select sum(x) into h1 from unnest(m.hp1) x; select sum(x) into h2 from unnest(m.hp2) x;
        victor := case when m.move1 is not null and m.move2 is null then m.p1 when m.move2 is not null and m.move1 is null then m.p2 when h1>h2 then m.p1 when h2>h1 then m.p2 else null end;
        m.status := 'finished'; m.winner := victor;
        perform public.cw_pay_out(m.p1,m.p2,victor,m.stake,m.d1,m.d2,m.log);
      end if;
      changed := true;
    end if;

    if _action='join' and u<>m.p1 then
      if m.status<>'waiting' then
        if u is distinct from m.p2 then raise exception 'Battle unavailable'; end if;
      else
        update public.cw_accounts set balance=balance-m.stake,active_code=m.code where user_id=u and balance>=m.stake and active_code is null;
        get diagnostics n = row_count;
        if n<>1 then raise exception 'Insufficient points or already battling'; end if;
        m.p2 := u; m.d2 := _deck; m.tags2 := tags; m.rt2 := rt; m.status := 'playing'; m.deadline := now()+interval '120 seconds';
        changed := true;
      end if;
    end if;

    side := case when u=m.p1 then 1 else 2 end;

    if _action='leave' and m.status in('waiting','playing') then
      if m.status='waiting' then
        m.status := 'cancelled';
        update public.cw_accounts set balance=balance+m.stake,active_code=null where user_id=m.p1;
      else
        m.status := 'finished'; m.winner := case when side=1 then m.p2 else m.p1 end;
        perform public.cw_pay_out(m.p1,m.p2,m.winner,m.stake,m.d1,m.d2,m.log);
      end if;
      changed := true;
    end if;

    if _action='play' and m.status='playing' then
      if _round is null or _round>m.round then raise exception 'Invalid round'; end if;
      if _round=m.round then
        if _card is null or _card<0 or _card>4 then raise exception 'Invalid card'; end if;
        if (side=1 and m.hp1[_card+1]<=0) or (side=2 and m.hp2[_card+1]<=0) then raise exception 'Card knocked out'; end if;
        if _tag is not null and (_tag<0 or _tag>2) then raise exception 'Invalid dog tag'; end if;
        if (side=1 and m.move1 is null) or (side=2 and m.move2 is null) then
          if _tag is not null and ((side=1 and _tag=any(m.used1)) or (side=2 and _tag=any(m.used2))) then raise exception 'Dog tag already used'; end if;
          if side=1 then m.move1 := _card; m.tag1 := _tag; else m.move2 := _card; m.tag2 := _tag; end if;
          changed := true;
        end if;
      end if;

      if m.move1 is not null and m.move2 is not null then
        c1 := m.d1[m.move1+1]; c2 := m.d2[m.move2+1];
        select vehicle, public.cw_slot_ratings(m.rt1,m.move1,ratings) into v1, rat1 from public.cw_catalog where id=c1;
        select vehicle, public.cw_slot_ratings(m.rt2,m.move2,ratings) into v2, rat2 from public.cw_catalog where id=c2;
        lean_ok := v1='bike' and v2='bike';
        cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
        rr := random();
        ev := case when rr<.004 then 11 when rr<1.0/6 then 1+floor(random()*10)::integer else null end;

        if ev=11 then
          select t.i into k1 from unnest(m.d1,m.hp1) with ordinality t(card,hp,i) join public.cw_catalog c on c.id=t.card cross join lateral (select public.cw_slot_ratings(m.rt1,(t.i-1)::integer,c.ratings) r) q where t.hp>0 order by (q.r[1]+q.r[3]+q.r[4]+q.r[5]) desc limit 1;
          select t.i into k2 from unnest(m.d2,m.hp2) with ordinality t(card,hp,i) join public.cw_catalog c on c.id=t.card cross join lateral (select public.cw_slot_ratings(m.rt2,(t.i-1)::integer,c.ratings) r) q where t.hp>0 order by (q.r[1]+q.r[3]+q.r[4]+q.r[5]) desc limit 1;
          m.hp1[k1] := 0; m.hp2[k2] := 0;
          m.log := m.log || jsonb_build_array(jsonb_build_object(
            'round',m.round,'category',cat,'card1',c1,'card2',c2,'damage',0,'winner',null,'event',ev,'r1',m.d1[k1],'r2',m.d2[k2]));
        else
          if ev=10 then m.tag1 := null; m.tag2 := null; end if;
          if m.tag1 is not null then m.used1 := array_append(m.used1,m.tag1); end if;
          if m.tag2 is not null then m.used2 := array_append(m.used2,m.tag2); end if;
          if ev=3 then
            select t.i into low from unnest(m.hp1) with ordinality t(hp,i) where t.hp>0 order by t.hp, t.i limit 1;
            if low is not null then m.hp1[low] := least(100,m.hp1[low]+15); end if;
            low := null;
            select t.i into low from unnest(m.hp2) with ordinality t(hp,i) where t.hp>0 order by t.hp, t.i limit 1;
            if low is not null then m.hp2[low] := least(100,m.hp2[low]+15); end if;
          end if;
          if m.tag1=1 then m.hp1[m.move1+1] := least(100,m.hp1[m.move1+1]+public.cw_tag_value(1,m.tags1[2],v1)); end if;
          if m.tag2=1 then m.hp2[m.move2+1] := least(100,m.hp2[m.move2+1]+public.cw_tag_value(1,m.tags2[2],v2)); end if;
          if m.tag1=2 then b1 := public.cw_tag_value(2,m.tags1[3],v1)/100.0; end if;
          if m.tag2=2 then b2 := public.cw_tag_value(2,m.tags2[3],v2)/100.0; end if;
          if ev=9 then
            if exists(select 1 from jsonb_array_elements(m.log) e where e->>'winner'='1' and e->>'card1'=c1) then cr1 := 1.08; end if;
            if exists(select 1 from jsonb_array_elements(m.log) e where e->>'winner'='2' and e->>'card2'=c2) then cr2 := 1.08; end if;
          end if;
          w1 := case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,cat) end;
          w2 := case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,cat) end;
          s1 := round(rat1[cat]*w1)*b1*cr1;
          s2 := round(rat2[cat]*w2)*b2*cr2;
          if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
          if (s1<s2 and m.tag1=0) or (s2<s1 and m.tag2=0) then
            if s1<s2 then r1 := public.cw_tag_value(0,m.tags1[1],v1)/100.0; else r2 := public.cw_tag_value(0,m.tags2[1],v2)/100.0; end if;
            first_cat := cat;
            loop
              cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
              exit when cat<>first_cat;
            end loop;
            w1 := case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,cat) end;
            w2 := case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,cat) end;
            s1 := round(rat1[cat]*w1)*b1*r1*cr1;
            s2 := round(rat2[cat]*w2)*b2*r2*cr2;
            if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
          end if;
          if ev=1 then mid := (s1+s2)/2; s1 := mid+(s1-mid)*.5; s2 := mid+(s2-mid)*.5; end if;
          if ev=8 then floor_hp := 1; end if;
          wn := case when s1=s2 then null when s1>s2 then 1 else 2 end;
          damage := case when s1=s2 then 0 else least(65,20+round(abs(s1-s2)*.7)::integer) end;
          if ev=4 then
            wn := null; damage := 0;
          elsif ev=7 and s1<>s2 and abs(s1-s2)<=greatest(s1,s2)*.05 then
            wn := null; damage := 10;
            m.hp1[m.move1+1] := greatest(case when m.hp1[m.move1+1]>0 then floor_hp else 0 end, m.hp1[m.move1+1]-10);
            m.hp2[m.move2+1] := greatest(case when m.hp2[m.move2+1]>0 then floor_hp else 0 end, m.hp2[m.move2+1]-10);
          else
            if ev=2 and damage>0 then damage := least(80,damage+15); end if;
            if ev=5 and cat=5 and damage>0 then damage := least(100,damage*2); end if;
            if wn=1 then m.hp2[m.move2+1] := greatest(floor_hp,m.hp2[m.move2+1]-damage);
            elsif wn=2 then m.hp1[m.move1+1] := greatest(floor_hp,m.hp1[m.move1+1]-damage); end if;
          end if;
          m.log := m.log || jsonb_build_array(jsonb_build_object(
            'round',m.round,'category',cat,'first',first_cat,'card1',c1,'card2',c2,'damage',damage,
            'winner',wn,'s1',round(s1,1),'s2',round(s2,1),'t1',m.tag1,'t2',m.tag2,'event',ev));
        end if;
        m.round := m.round+1; m.move1 := null; m.move2 := null; m.tag1 := null; m.tag2 := null; m.deadline := now()+interval '120 seconds';
        changed := true;
        if not exists(select 1 from unnest(m.hp1) x where x>0) or not exists(select 1 from unnest(m.hp2) x where x>0) then
          select sum(x) into h1 from unnest(m.hp1) x; select sum(x) into h2 from unnest(m.hp2) x;
          m.winner := case when h1=h2 then null when h1>h2 then m.p1 else m.p2 end; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,m.winner,m.stake,m.d1,m.d2,m.log);
        elsif 2=any(m.used1) and 2=any(m.used2) and not exists(
          select 1
          from unnest(m.d1,m.hp1) with ordinality mine(card,hp,i)
          join public.cw_catalog ca on ca.id=mine.card
          cross join unnest(m.d2,m.hp2) with ordinality theirs(card,hp,i)
          join public.cw_catalog cb on cb.id=theirs.card
          cross join generate_series(1,5) k(c)
          where mine.hp>0 and theirs.hp>0 and (k.c<>2 or (ca.vehicle='bike' and cb.vehicle='bike'))
            and round((public.cw_slot_ratings(m.rt1,(mine.i-1)::integer,ca.ratings))[k.c]*public.cw_wear_mult(m.p1,mine.card,k.c)) <> round((public.cw_slot_ratings(m.rt2,(theirs.i-1)::integer,cb.ratings))[k.c]*public.cw_wear_mult(m.p2,theirs.card,k.c)))
        then
          m.winner := null; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,null,m.stake,m.d1,m.d2,m.log);
        end if;
      end if;
    end if;

    if changed then
      update public.cw_matches set p2=m.p2,d2=m.d2,tags2=m.tags2,rt2=m.rt2,hp1=m.hp1,hp2=m.hp2,used1=m.used1,used2=m.used2,move1=m.move1,move2=m.move2,tag1=m.tag1,tag2=m.tag2,round=m.round,status=m.status,winner=m.winner,log=m.log,deadline=m.deadline where code=m.code;
    end if;
    return jsonb_build_object(
      'code',m.code,'status',m.status,'round',m.round,'category',null,'stake',m.stake,
      'selected',case when side=1 then m.move1 else m.move2 end,
      'penalty',m.penalty=m.round,
      'deck',case when side=1 then m.d1 else m.d2 end,
      'rivalDeck',case when side=1 then m.d2 else m.d1 end,
      'hp',case when side=1 then m.hp1 else m.hp2 end,
      'rivalHp',case when side=1 then m.hp2 else m.hp1 end,
      'used',case when side=1 then m.used1 else m.used2 end,
      'rivalUsed',case when side=1 then m.used2 else m.used1 end,
      'submitted',case when side=1 then m.move1 is not null else m.move2 is not null end,
      'rivalSubmitted',case when side=1 then m.move2 is not null else m.move1 is not null end,
      'side',side,
      'result',case when m.status<>'finished' then null when m.winner is null then 'draw' when m.winner=u then 'win' else 'loss' end,
      'deadline',m.deadline,'log',m.log,
      'wear',(select coalesce(jsonb_agg(coalesce((select w.condition from public.cw_wear w where w.user_id=case when side=1 then m.p1 else m.p2 end and w.card_id=t.d),100) order by t.o),'[]'::jsonb) from unnest(case when side=1 then m.d1 else m.d2 end) with ordinality t(d,o)),
      'rivalWear',(select coalesce(jsonb_agg(coalesce((select w.condition from public.cw_wear w where w.user_id=case when side=1 then m.p2 else m.p1 end and w.card_id=t.d),100) order by t.o),'[]'::jsonb) from unnest(case when side=1 then m.d2 else m.d1 end) with ordinality t(d,o)),
      'ratings',case when side=1 then m.rt1 else m.rt2 end,
      'rivalRatings',case when side=1 then m.rt2 else m.rt1 end,
      'balance',(select balance from public.cw_accounts where user_id=u));
  end if;
  return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
end $function$;

revoke all on function public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb) from public, anon;
grant execute on function public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb) to authenticated;