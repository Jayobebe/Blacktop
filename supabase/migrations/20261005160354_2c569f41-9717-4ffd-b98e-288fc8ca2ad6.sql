-- Card Wars: round events (incl. rapture), 75% duplicate refunds on paid card spins, and player-to-player card sales by code.

alter table public.cw_accounts add column if not exists last_rapture date;

-- ── Card sales ──
create table public.cw_trades (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  seller uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cw_catalog(id),
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.cw_offers (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.cw_trades(id) on delete cascade,
  buyer uuid not null references auth.users(id) on delete cascade,
  rpm integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant all on public.cw_trades to service_role;
grant all on public.cw_offers to service_role;
alter table public.cw_trades enable row level security;
alter table public.cw_offers enable row level security;
create index on public.cw_trades(seller);
create index on public.cw_offers(trade_id);
create index on public.cw_offers(buyer);

-- A pending offer's RPM is held; it goes back whenever the offer goes away (a burned seller included).
create or replace function public.cw_offer_refund() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if old.status='pending' then
    update public.cw_accounts set balance=balance+old.rpm where user_id=old.buyer;
  end if;
  return old;
end $$;
create trigger cw_offer_refund before delete on public.cw_offers for each row execute function public.cw_offer_refund();

create or replace function public.cw_trade_sweep() returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  with gone as (
    update public.cw_offers o set status='expired' from public.cw_trades t
    where o.trade_id=t.id and o.status='pending' and t.status='open' and t.expires_at<now()
    returning o.buyer, o.rpm)
  update public.cw_accounts a set balance=a.balance+g.total
  from (select buyer, sum(rpm) total from gone group by buyer) g where a.user_id=g.buyer;
  update public.cw_trades set status='expired' where status='open' and expires_at<now();
end $$;

create or replace function public.cw_trade_list(_card text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); t public.cw_trades%rowtype; c text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform public.cw_trade_sweep();
  if not exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then raise exception 'Card not owned'; end if;
  select * into t from public.cw_trades where seller=u and card_id=_card and status='open';
  if found then return jsonb_build_object('id',t.id,'code',t.code); end if;
  if (select count(*) from public.cw_trades where seller=u and status='open')>=5 then raise exception 'Too many cards for sale'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text),1,6));
    exit when not exists(select 1 from public.cw_trades where code=c);
  end loop;
  insert into public.cw_trades(code,seller,card_id) values(c,u,_card) returning * into t;
  return jsonb_build_object('id',t.id,'code',t.code);
end $$;

create or replace function public.cw_trade_view(_code text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); t public.cw_trades%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform public.cw_trade_sweep();
  select * into t from public.cw_trades where code=upper(trim(_code));
  if not found then raise exception 'Sale not found'; end if;
  return jsonb_build_object('id',t.id,'code',t.code,'card',t.card_id,'status',t.status,'mine',t.seller=u,
    'owned',exists(select 1 from public.cw_owned where user_id=u and card_id=t.card_id),
    'myOffer',(select rpm from public.cw_offers where trade_id=t.id and buyer=u and status='pending'));
end $$;

create or replace function public.cw_trade_offer(_code text, _rpm integer) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); t public.cw_trades%rowtype; old_rpm integer; bal integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _rpm is null or _rpm<1 or _rpm>100000 then raise exception 'Invalid offer'; end if;
  perform public.cw_trade_sweep();
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into t from public.cw_trades where code=upper(trim(_code)) for update;
  if not found or t.status<>'open' then raise exception 'Sale not found'; end if;
  if t.seller=u then raise exception 'Your own card'; end if;
  if exists(select 1 from public.cw_owned where user_id=u and card_id=t.card_id) then raise exception 'Already owned'; end if;
  select balance into bal from public.cw_accounts where user_id=u for update;
  select rpm into old_rpm from public.cw_offers where trade_id=t.id and buyer=u and status='pending' for update;
  if old_rpm is null and (select count(*) from public.cw_offers where buyer=u and status='pending')>=10 then raise exception 'Too many offers'; end if;
  if bal+coalesce(old_rpm,0)<_rpm then raise exception 'Not enough RPM'; end if;
  if old_rpm is not null then
    update public.cw_offers set rpm=_rpm, created_at=now() where trade_id=t.id and buyer=u and status='pending';
  else
    insert into public.cw_offers(trade_id,buyer,rpm) values(t.id,u,_rpm);
  end if;
  update public.cw_accounts set balance=balance+coalesce(old_rpm,0)-_rpm where user_id=u returning balance into bal;
  return jsonb_build_object('balance',bal);
end $$;

create or replace function public.cw_trade_withdraw(_offer uuid) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); o public.cw_offers%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into o from public.cw_offers where id=_offer and buyer=u and status='pending' for update;
  if found then
    update public.cw_offers set status='withdrawn' where id=o.id;
    update public.cw_accounts set balance=balance+o.rpm where user_id=u;
  end if;
  return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
end $$;

create or replace function public.cw_trade_cancel(_trade uuid) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform 1 from public.cw_trades where id=_trade and seller=u and status='open' for update;
  if found then
    with gone as (update public.cw_offers set status='declined' where trade_id=_trade and status='pending' returning buyer,rpm)
    update public.cw_accounts a set balance=a.balance+g.total from (select buyer,sum(rpm) total from gone group by buyer) g where a.user_id=g.buyer;
    update public.cw_trades set status='cancelled' where id=_trade;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.cw_trade_respond(_offer uuid, _accept boolean) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid(); o public.cw_offers%rowtype; t public.cw_trades%rowtype; busy uuid;
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform public.cw_trade_sweep();
  select * into o from public.cw_offers where id=_offer and status='pending' for update;
  if not found then raise exception 'Offer gone'; end if;
  select * into t from public.cw_trades where id=o.trade_id for update;
  if t.seller<>u or t.status<>'open' then raise exception 'Offer gone'; end if;
  if not _accept then
    update public.cw_offers set status='declined' where id=o.id;
    update public.cw_accounts set balance=balance+o.rpm where user_id=o.buyer;
    return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
  end if;
  select active_code into busy from public.cw_accounts where user_id=u;
  if busy is not null then raise exception 'Finish your current battle first'; end if;
  if not exists(select 1 from public.cw_owned where user_id=u and card_id=t.card_id) then raise exception 'Card not owned'; end if;
  if exists(select 1 from public.cw_owned where user_id=o.buyer and card_id=t.card_id) then
    update public.cw_offers set status='declined' where id=o.id;
    update public.cw_accounts set balance=balance+o.rpm where user_id=o.buyer;
    raise exception 'Buyer already owns it';
  end if;
  delete from public.cw_owned where user_id=u and card_id=t.card_id;
  delete from public.cw_wear where user_id=u and card_id=t.card_id;
  insert into public.cw_owned(user_id,card_id) values(o.buyer,t.card_id);
  update public.cw_offers set status='accepted' where id=o.id;
  update public.cw_accounts set balance=balance+o.rpm where user_id=u;
  with gone as (update public.cw_offers set status='declined' where trade_id=t.id and status='pending' returning buyer,rpm)
  update public.cw_accounts a set balance=a.balance+g.total from (select buyer,sum(rpm) total from gone group by buyer) g where a.user_id=g.buyer;
  update public.cw_trades set status='sold' where id=t.id;
  return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u),'card',t.card_id);
end $$;

create or replace function public.cw_trades_mine() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform public.cw_trade_sweep();
  return jsonb_build_object(
    'selling', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'card',t.card_id,'expires',t.expires_at,
        'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'rpm',o.rpm,'from',coalesce(p.display_name,'Rider')) order by o.rpm desc)
          from public.cw_offers o left join public.profiles p on p.id=o.buyer where o.trade_id=t.id and o.status='pending'),'[]'::jsonb)) order by t.created_at)
      from public.cw_trades t where t.seller=u and t.status='open'),'[]'::jsonb),
    'buying', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'rpm',o.rpm,'status',o.status,'card',t.card_id,'code',t.code) order by o.created_at desc)
      from (select * from public.cw_offers where buyer=u and (status='pending' or created_at>now()-interval '3 days') order by created_at desc limit 20) o
      join public.cw_trades t on t.id=o.trade_id),'[]'::jsonb));
end $$;

revoke all on function public.cw_trade_sweep() from public, anon, authenticated;
revoke all on function public.cw_offer_refund() from public, anon, authenticated;
revoke all on function public.cw_trade_list(text), public.cw_trade_view(text), public.cw_trade_offer(text,integer), public.cw_trade_withdraw(uuid), public.cw_trade_cancel(uuid), public.cw_trade_respond(uuid,boolean), public.cw_trades_mine() from public, anon;
grant execute on function public.cw_trade_list(text), public.cw_trade_view(text), public.cw_trade_offer(text,integer), public.cw_trade_withdraw(uuid), public.cw_trade_cancel(uuid), public.cw_trade_respond(uuid,boolean), public.cw_trades_mine() to authenticated;

-- ── Raptured cards come home at full condition ──
create or replace function public.cw_apply_wear(_p1 uuid, _p2 uuid, _d1 text[], _d2 text[], _log jsonb)
 returns void language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  perform public.cw_wear_for(_p1, (select coalesce(array_agg(distinct e->>'card1'), '{}') from jsonb_array_elements(coalesce(_log,'[]')) e));
  perform public.cw_wear_for(_p2, (select coalesce(array_agg(distinct e->>'card2'), '{}') from jsonb_array_elements(coalesce(_log,'[]')) e));
  delete from public.cw_wear where user_id=_p1 and card_id in (select e->>'r1' from jsonb_array_elements(coalesce(_log,'[]')) e where e ? 'r1');
  delete from public.cw_wear where user_id=_p2 and card_id in (select e->>'r2' from jsonb_array_elements(coalesce(_log,'[]')) e where e ? 'r2');
end $function$;

-- Computer battles report a rapture with their wear; at most one restore a day, so a forged report gains little.
create or replace function public.cw_save_wear(_run uuid, _deck text[], _fought text[], _raptured text)
 returns table(card_id text, condition integer) language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid:=auth.uid(); previous uuid; last_r date;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if _run is null then raise exception 'Battle required'; end if;
 perform public.cw_daily_topup(u);
 select a.last_wear_run, a.last_rapture into previous, last_r from public.cw_accounts a where a.user_id=u for update;
 if previous is distinct from _run then
   perform * from public.cw_wear_offline(_deck,_fought);
   update public.cw_accounts a set last_wear_run=_run where a.user_id=u;
   if _raptured is not null and _raptured=any(_deck) and last_r is distinct from current_date then
     delete from public.cw_wear w where w.user_id=u and w.card_id=_raptured;
     update public.cw_accounts a set last_rapture=current_date where a.user_id=u;
   end if;
 end if;
 return query select w.card_id,w.condition from public.cw_wear w where w.user_id=u;
end $function$;
revoke all on function public.cw_save_wear(uuid,text[],text[],text) from public, anon;
grant execute on function public.cw_save_wear(uuid,text[],text[],text) to authenticated;

-- ── Paid spins: a duplicate card pays 75% of its shop price ──
CREATE OR REPLACE FUNCTION public.cw_spin(_cat text, _free boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; cost integer; r double precision; card text; amount integer := 0; extra integer := 0; kind text; bonus integer; cat text := _cat; pw text; tied text; won text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if _free then
    if a.free_spins<=0 then raise exception 'No free spins left'; end if;
    update public.cw_accounts set free_spins=free_spins-1 where user_id=u;
    r := random();
    cat := case when r<.55 then 'road' when r<.85 then 'race' when r<.91 then 'gtlm' when r<.97 then 'tt' when r<.985 then 'f1' else 'motogp' end;
    select id into card from public.cw_catalog c where c.category=cat and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1;
    if card is null then
      select id into card from public.cw_catalog c where c.category in('road','race') and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1;
    end if;
    if card is null then
      update public.cw_accounts set balance=balance+50 where user_id=u; kind := 'rpm'; amount := 50;
    else
      insert into public.cw_owned(user_id,card_id) values(u,card); kind := 'card';
    end if;
  else
    cost := public.cw_spin_cost(cat);
    if cost is null then raise exception 'Invalid category'; end if;
    select count into bonus from public.cw_spins where user_id=u and category=cat for update;
    if coalesce(bonus,0)>0 then
      update public.cw_spins set count=count-1 where user_id=u and category=cat;
    else
      if a.balance<cost then raise exception 'Not enough RPM'; end if;
      update public.cw_accounts set balance=balance-cost where user_id=u;
    end if;
    r := random();
    if r<.16 then
      select id into card from public.cw_catalog where category=cat order by random() limit 1;
      if exists(select 1 from public.cw_owned where user_id=u and card_id=card) then
        kind := 'duplicate';
        amount := greatest(1, round((select price from public.cw_catalog where id=card)*0.75)::integer);
        update public.cw_accounts set balance=balance+amount where user_id=u;
      else
        insert into public.cw_owned(user_id,card_id) values(u,card); kind := 'card';
      end if;
    elsif r<.28 then
      pw := (array['reroll','heal','boost'])[1+floor(random()*3)::integer];
      select id into tied from public.cw_catalog where category=cat order by random() limit 1;
      won := pw || ':' || tied;
      if exists(select 1 from public.cw_tags t where t.user_id=u and t.power=pw and t.card_id=tied) then
        kind := 'duplicate'; amount := cost/2; update public.cw_accounts set balance=balance+amount where user_id=u;
      else
        insert into public.cw_tags(user_id,power,card_id) values(u,pw,tied); kind := 'tag';
      end if;
    elsif r<.48 then
      kind := 'spins'; extra := 1;
      insert into public.cw_spins(user_id,category,count) values(u,cat,extra) on conflict(user_id,category) do update set count=public.cw_spins.count+extra;
    else
      kind := 'rpm'; amount := greatest(1,round(cost*(.2+random()))::integer); update public.cw_accounts set balance=balance+amount where user_id=u;
    end if;
  end if;
  return jsonb_build_object('kind',kind,'card',card,'tag',won,'category',cat,'rpm',amount,'spins',extra) || public.cw_shop();
end $function$;

-- ── Player battles: a round event drawn once both cards are in, before the category ──
-- Events, in order: 1 rain, 2 tailwind, 3 pit stop, 4 red flag, 5 oil, 6 fresh tyres,
-- 7 photo finish, 8 safety car, 9 home crowd, 10 gremlin, 11 rapture.
CREATE OR REPLACE FUNCTION public.cw_action(_action text, _code uuid DEFAULT NULL::uuid, _deck text[] DEFAULT NULL::text[], _card integer DEFAULT NULL::integer, _tag integer DEFAULT NULL::integer, _round integer DEFAULT NULL::integer, _tags text[] DEFAULT NULL::text[])
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
  ev integer; rr double precision; cr1 numeric := 1; cr2 numeric := 1; w1 numeric; w2 numeric; mid numeric; w integer; floor_hp integer := 0; k1 integer; k2 integer; low integer;
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
  end if;

  if _action='create' then
    select * into a from public.cw_accounts where user_id=u for update;
    if a.active_code is not null then raise exception 'Finish your current battle first'; end if;
    if a.balance<20 then raise exception 'Not enough RPM'; end if;
    if a.last_created_at>now()-interval '5 seconds' then raise exception 'Wait before inviting again'; end if;
    insert into public.cw_matches(p1,d1,tags1,stake,categories,penalty)
    values(u,_deck,tags,20,array(select x from generate_series(1,5) x order by random()),case when random()<.125 then 2+floor(random()*4)::integer else -1 end)
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
        m.p2 := u; m.d2 := _deck; m.tags2 := tags; m.status := 'playing'; m.deadline := now()+interval '120 seconds';
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
        select vehicle, ratings into v1, rat1 from public.cw_catalog where id=c1;
        select vehicle, ratings into v2, rat2 from public.cw_catalog where id=c2;
        lean_ok := v1='bike' and v2='bike';
        cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
        rr := random();
        ev := case when rr<.004 then 11 when rr<1.0/6 then 1+floor(random()*10)::integer else null end;

        if ev=11 then
          -- Rapture: each side's strongest card still standing is beamed away. No round is fought.
          select t.i into k1 from unnest(m.d1,m.hp1) with ordinality t(card,hp,i) join public.cw_catalog c on c.id=t.card where t.hp>0 order by (c.ratings[1]+c.ratings[3]+c.ratings[4]+c.ratings[5]) desc limit 1;
          select t.i into k2 from unnest(m.d2,m.hp2) with ordinality t(card,hp,i) join public.cw_catalog c on c.id=t.card where t.hp>0 order by (c.ratings[1]+c.ratings[3]+c.ratings[4]+c.ratings[5]) desc limit 1;
          m.hp1[k1] := 0; m.hp2[k2] := 0;
          m.log := m.log || jsonb_build_array(jsonb_build_object(
            'round',m.round,'category',cat,'card1',c1,'card2',c2,'damage',0,'winner',null,'event',ev,'r1',m.d1[k1],'r2',m.d2[k2]));
        else
          -- Gremlin: armed dog tags jam (no effect, not used up).
          if ev=10 then m.tag1 := null; m.tag2 := null; end if;
          if m.tag1 is not null then m.used1 := array_append(m.used1,m.tag1); end if;
          if m.tag2 is not null then m.used2 := array_append(m.used2,m.tag2); end if;
          -- Pit stop: each side's most damaged card still standing gets 15 back.
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
          -- Home crowd: a card that has already won a round this battle gets 8% more.
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
          -- Rain: ratings pulled halfway together.
          if ev=1 then mid := (s1+s2)/2; s1 := mid+(s1-mid)*.5; s2 := mid+(s2-mid)*.5; end if;
          if ev=8 then floor_hp := 1; end if;
          w := case when s1=s2 then null when s1>s2 then 1 else 2 end;
          damage := case when s1=s2 then 0 else least(65,20+round(abs(s1-s2)*.7)::integer) end;
          if ev=4 then
            -- Red flag: no damage.
            w := null; damage := 0;
          elsif ev=7 and s1<>s2 and abs(s1-s2)<=greatest(s1,s2)*.05 then
            -- Photo finish: too close to call, both cards take 10.
            w := null; damage := 10;
            m.hp1[m.move1+1] := greatest(case when m.hp1[m.move1+1]>0 then floor_hp else 0 end, m.hp1[m.move1+1]-10);
            m.hp2[m.move2+1] := greatest(case when m.hp2[m.move2+1]>0 then floor_hp else 0 end, m.hp2[m.move2+1]-10);
          else
            if ev=2 and damage>0 then damage := least(80,damage+15); end if;
            if ev=5 and cat=5 and damage>0 then damage := least(100,damage*2); end if;
            if w=1 then m.hp2[m.move2+1] := greatest(floor_hp,m.hp2[m.move2+1]-damage);
            elsif w=2 then m.hp1[m.move1+1] := greatest(floor_hp,m.hp1[m.move1+1]-damage); end if;
          end if;
          m.log := m.log || jsonb_build_array(jsonb_build_object(
            'round',m.round,'category',cat,'first',first_cat,'card1',c1,'card2',c2,'damage',damage,
            'winner',w,'s1',round(s1,1),'s2',round(s2,1),'t1',m.tag1,'t2',m.tag2,'event',ev));
        end if;
        m.round := m.round+1; m.move1 := null; m.move2 := null; m.tag1 := null; m.tag2 := null; m.deadline := now()+interval '120 seconds';
        changed := true;
        if not exists(select 1 from unnest(m.hp1) x where x>0) or not exists(select 1 from unnest(m.hp2) x where x>0) then
          select sum(x) into h1 from unnest(m.hp1) x; select sum(x) into h2 from unnest(m.hp2) x;
          m.winner := case when h1=h2 then null when h1>h2 then m.p1 else m.p2 end; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,m.winner,m.stake,m.d1,m.d2,m.log);
        elsif 2=any(m.used1) and 2=any(m.used2) and not exists(
          select 1
          from unnest(m.d1,m.hp1) mine(card,hp)
          join public.cw_catalog ca on ca.id=mine.card
          cross join unnest(m.d2,m.hp2) theirs(card,hp)
          join public.cw_catalog cb on cb.id=theirs.card
          cross join generate_series(1,5) k(c)
          where mine.hp>0 and theirs.hp>0 and (k.c<>2 or (ca.vehicle='bike' and cb.vehicle='bike'))
            and round(ca.ratings[k.c]*public.cw_wear_mult(m.p1,mine.card,k.c)) <> round(cb.ratings[k.c]*public.cw_wear_mult(m.p2,theirs.card,k.c)))
        then
          m.winner := null; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,null,m.stake,m.d1,m.d2,m.log);
        end if;
      end if;
    end if;

    if changed then
      update public.cw_matches set p2=m.p2,d2=m.d2,tags2=m.tags2,hp1=m.hp1,hp2=m.hp2,used1=m.used1,used2=m.used2,move1=m.move1,move2=m.move2,tag1=m.tag1,tag2=m.tag2,round=m.round,status=m.status,winner=m.winner,log=m.log,deadline=m.deadline where code=m.code;
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
      'balance',(select balance from public.cw_accounts where user_id=u));
  end if;
  return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
end $function$;