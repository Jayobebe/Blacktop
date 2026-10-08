-- Card Wars: Redline cards and the Wildcard dog tag.
create table if not exists public.cw_redline_cards(
  id text primary key,
  name text not null,
  maker text not null,
  vehicle text not null check (vehicle in ('car','bike')),
  ratings integer[] not null check (
    cardinality(ratings) = 5
    and ratings[1] + ratings[3] + ratings[4] + ratings[5] = 240
    and 100 in (ratings[1], ratings[3], ratings[4], ratings[5])
    and 0 in (ratings[1], ratings[3], ratings[4], ratings[5])));
alter table public.cw_redline_cards enable row level security;

insert into public.cw_redline_cards(id, name, maker, vehicle, ratings) values
  ('thrustssc',   'Thrust SSC',           'Thrust',          'car',  array[100, 30,  90,  50,   0]),
  ('chaparral2j', '2J',                   'Chaparral',       'car',  array[ 55, 30,  85,   0, 100]),
  ('p91730',      '917/30',               'Porsche',         'car',  array[ 90, 30, 100,   0,  50]),
  ('escudo',      'Escudo Pikes Peak',    'Suzuki',          'car',  array[  0, 30,  90,  50, 100]),
  ('tatra815',    '815 Dakar',            'Tatra',           'car',  array[  0, 30,  70, 100,  70]),
  ('britten',     'V1000',                'Britten',         'bike', array[ 55, 95, 100,   0,  85]),
  ('rc166',       'RC166',                'Honda',           'bike', array[ 60, 90,   0,  80, 100]),
  ('busa311',     'Hayabusa Turbo 311',   'Suzuki',          'bike', array[100, 35,  95,  45,   0]),
  ('xr750',       'XR750',                'Harley-Davidson', 'bike', array[  0, 70,  60, 100,  80]),
  ('tz750',       'TZ750 Flat Tracker',   'Yamaha',          'bike', array[ 85, 50, 100,  55,   0])
on conflict (id) do update set name = excluded.name, maker = excluded.maker, vehicle = excluded.vehicle, ratings = excluded.ratings;

create table if not exists public.cw_redline_owned(
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cw_redline_cards(id),
  won_at timestamptz not null default now(),
  primary key (user_id, card_id));
alter table public.cw_redline_owned enable row level security;

alter table public.cw_accounts add column if not exists wildcard boolean not null default false;
alter table public.cw_accounts add column if not exists wild_pity integer not null default 0;
alter table public.cw_accounts add column if not exists redline_wheel text[];
alter table public.cw_accounts add column if not exists redeem_day date;
alter table public.cw_accounts add column if not exists redeem_tries integer not null default 0;

create table if not exists public.cw_redline_codes(
  code text primary key,
  card_id text not null references public.cw_redline_cards(id),
  expires_at timestamptz);
alter table public.cw_redline_codes enable row level security;

alter table public.cw_matches add column if not exists wild1 text[];
alter table public.cw_matches add column if not exists wild2 text[];

create or replace function public.cw_redline_rules() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object('odds', 2, 'pity', 40, 'wheel', 5, 'starter', 5, 'dailyOneIn', 3,
    'cards', (select jsonb_agg(jsonb_build_object('id', id, 'vehicle', vehicle, 'ratings', ratings) order by id) from public.cw_redline_cards))
$$;

create or replace function public.cw_redline_state() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'wildcard', coalesce((select wildcard from public.cw_accounts where user_id = auth.uid()), false),
    'pity', coalesce((select wild_pity from public.cw_accounts where user_id = auth.uid()), 0),
    'wheel', coalesce((select to_jsonb(redline_wheel) from public.cw_accounts where user_id = auth.uid()), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(card_id order by won_at, card_id) from public.cw_redline_owned where user_id = auth.uid()), '[]'::jsonb))
$$;

create or replace function public.cw_redline_grant(_u uuid) returns text
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare c text;
begin
  select id into c from public.cw_redline_cards r
  where not exists(select 1 from public.cw_redline_owned o where o.user_id = _u and o.card_id = r.id)
  order by random() limit 1;
  if c is not null then insert into public.cw_redline_owned(user_id, card_id) values(_u, c) on conflict do nothing; end if;
  return c;
end $function$;

create or replace function public.cw_wildcard_grant(_u uuid) returns text[]
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare got text[] := '{}'::text[]; c text; wheel text[];
begin
  for i in 1..5 loop
    c := public.cw_redline_grant(_u);
    exit when c is null;
    got := array_append(got, c);
  end loop;
  select array(select card_id from public.cw_redline_owned where user_id = _u order by won_at, card_id limit 5) into wheel;
  update public.cw_accounts set wildcard = true, wild_pity = 0,
    redline_wheel = case when redline_wheel is null or cardinality(redline_wheel) <> 5 then wheel else redline_wheel end
  where user_id = _u;
  return got;
end $function$;

create or replace function public.cw_redline_wheel_set(_cards text[]) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _cards is null or cardinality(_cards) <> 5 or (select count(distinct x) from unnest(_cards) x) <> 5 then raise exception 'Pick five different Redline cards'; end if;
  if (select count(*) from public.cw_redline_owned where user_id = u and card_id = any(_cards)) <> 5 then raise exception 'Redline card not owned'; end if;
  if exists(select 1 from public.cw_accounts where user_id = u and active_code is not null) then raise exception 'Finish your current battle first'; end if;
  update public.cw_accounts set redline_wheel = _cards where user_id = u;
  return public.cw_redline_state();
end $function$;

create or replace function public.cw_redline_redeem(_code text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; c text; n integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id = u for update;
  if a.redeem_day = current_date and a.redeem_tries >= 10 then raise exception 'Too many tries today'; end if;
  update public.cw_accounts set redeem_day = current_date, redeem_tries = case when redeem_day = current_date then redeem_tries + 1 else 1 end where user_id = u;
  select card_id into c from public.cw_redline_codes where code = upper(btrim(coalesce(_code, ''))) and (expires_at is null or expires_at > now());
  if c is null then return jsonb_build_object('card', null) || public.cw_redline_state(); end if;
  insert into public.cw_redline_owned(user_id, card_id) values(u, c) on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('card', c, 'fresh', n = 1) || public.cw_redline_state();
end $function$;

revoke all on function public.cw_redline_grant(uuid), public.cw_wildcard_grant(uuid) from public, anon, authenticated;
revoke all on function public.cw_redline_rules(), public.cw_redline_state(), public.cw_redline_wheel_set(text[]), public.cw_redline_redeem(text) from public, anon;
grant execute on function public.cw_redline_rules(), public.cw_redline_state(), public.cw_redline_wheel_set(text[]), public.cw_redline_redeem(text) to authenticated;

create or replace function public.cw_spin(_cat text, _free boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; cost integer; r double precision; card text; amount integer := 0; extra integer := 0; kind text; bonus integer; cat text := _cat; pw text; tied text; won text; paid boolean := false; reds text[];
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
      paid := true;
    end if;
    if paid and cat in('f1','motogp') and not a.wildcard and (random()<.02 or a.wild_pity>=39) then
      reds := public.cw_wildcard_grant(u);
      kind := 'wildcard';
    else
      if paid and cat in('f1','motogp') and not a.wildcard then update public.cw_accounts set wild_pity=wild_pity+1 where user_id=u; end if;
      r := random();
      if r<.16 then
        select id into card from public.cw_catalog where category=cat order by random() limit 1;
        if public.cw_grant_card(u, card) then
          kind := 'card';
        else
          kind := 'duplicate';
          amount := greatest(1, round((select price from public.cw_catalog where id=card)*0.25)::integer);
          update public.cw_accounts set balance=balance+amount where user_id=u;
        end if;
      elsif r<.28 then
        pw := (array['reroll','heal','boost','flip'])[1+floor(random()*4)::integer];
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
  end if;
  return jsonb_build_object('kind',kind,'card',card,'tag',won,'category',cat,'rpm',amount,'spins',extra,'redlines',to_jsonb(reds)) || public.cw_shop();
end $function$;

create or replace function public.cw_daily_claim() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; red text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if a.daily_day = current_date then
    return jsonb_build_object('rpm',0,'balance',a.balance);
  end if;
  update public.cw_accounts set balance = balance + 30, daily_day = current_date where user_id=u returning balance into a.balance;
  if a.wildcard and random() < 1.0/3 then red := public.cw_redline_grant(u); end if;
  return jsonb_build_object('rpm',30,'balance',a.balance,'redline',red);
end $function$;

create or replace function public.cw_check_slots(_user uuid, _tags text[]) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare t text; pw text; ref text; seen text[] := '{}'::text[];
begin
  if _tags is null or cardinality(_tags) <> 3 then raise exception 'Invalid dog tag'; end if;
  foreach t in array _tags loop
    continue when t = '-';
    if t is null or position(':' in t) = 0 then raise exception 'Invalid dog tag'; end if;
    pw := split_part(t, ':', 1); ref := substr(t, length(pw) + 2);
    if pw = 'wild' then
      if ref <> '' then raise exception 'Invalid dog tag'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and a.wildcard) then raise exception 'Dog tag not owned'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and cardinality(a.redline_wheel) = 5) then raise exception 'Pick five Redline cards for your wheel'; end if;
      if t = any(seen) then raise exception 'The same dog tag twice'; end if;
      seen := array_append(seen, t);
      continue;
    end if;
    if pw not in('reroll','heal','boost','flip') then raise exception 'Invalid dog tag'; end if;
    continue when ref in('~car','~bike','~all');
    if ref <> '' and not exists(select 1 from public.cw_tags g where g.user_id=_user and g.power=pw and g.card_id=ref) then raise exception 'Dog tag not owned'; end if;
    if t = any(seen) then raise exception 'The same dog tag twice'; end if;
    seen := array_append(seen, t);
  end loop;
end $function$;

create or replace function public.cw_armed_power(_tags text[], _tag integer) returns integer
language sql immutable as $function$
  select case when _tag is null then null
    when cardinality(_tags) = 3 then array_position(array['reroll','heal','boost','flip','wild'], split_part(_tags[_tag+1], ':', 1)) - 1
    else _tag end
$function$;

do $migration$
declare
  d text;
  pieces text[][] := array[
    array[$a$  ev integer; rr double precision;$a$,
          $b$  wl1 text; wl2 text; wc1 text; wc2 text; wheel text[];
  ev integer; rr double precision;$b$],
    array[$a$    rt := '[null,null,null,null,null]'::jsonb;$a$,
          $b$    if slots and 'wild:' = any(tags) then select redline_wheel into wheel from public.cw_accounts where user_id=u; end if;
    rt := '[null,null,null,null,null]'::jsonb;$b$],
    array[$a$insert into public.cw_matches(p1,d1,tags1,rt1,stake,categories,penalty)$a$,
          $b$insert into public.cw_matches(p1,d1,tags1,rt1,wild1,stake,categories,penalty)$b$],
    array[$a$values(u,_deck,tags,rt,20,$a$, $b$values(u,_deck,tags,rt,wheel,20,$b$],
    array[$a$m.tags2 := tags; m.rt2 := rt;$a$, $b$m.tags2 := tags; m.rt2 := rt; m.wild2 := wheel;$b$],
    array[$a$update public.cw_matches set p2=m.p2,d2=m.d2,tags2=m.tags2,rt2=m.rt2,$a$,
          $b$update public.cw_matches set p2=m.p2,d2=m.d2,tags2=m.tags2,rt2=m.rt2,wild2=m.wild2,$b$],
    array[$a$pw2 := public.cw_armed_power(m.tags2,m.tag2); tr2 := public.cw_armed_ref(m.tags2,m.tag2);$a$,
          $b$pw2 := public.cw_armed_power(m.tags2,m.tag2); tr2 := public.cw_armed_ref(m.tags2,m.tag2);
          wc1 := c1; wc2 := c2;
          if pw1=4 and cardinality(m.wild1)>0 then
            wl1 := m.wild1[1+floor(random()*cardinality(m.wild1))::integer];
            select vehicle, ratings into v1, rat1 from public.cw_redline_cards where id=wl1; wc1 := '~redline';
          end if;
          if pw2=4 and cardinality(m.wild2)>0 then
            wl2 := m.wild2[1+floor(random()*cardinality(m.wild2))::integer];
            select vehicle, ratings into v2, rat2 from public.cw_redline_cards where id=wl2; wc2 := '~redline';
          end if;
          if wl1 is not null or wl2 is not null then
            lean_ok := false;
            if cat=2 then cat := (array[1,3,4,5])[1+floor(random()*4)::integer]; end if;
          end if;$b$],
    array[$a$'t1',pw1,'t2',pw2,'event',ev,$a$, $b$'t1',pw1,'t2',pw2,'event',ev,'w1',wl1,'w2',wl2,$b$]
  ];
  loose text := $a$or exists\(select 1 from unnest\(_deck\) x group by x having count\(\*\)>2\).*?or \(select count\(\*\) from unnest\(_deck\) x join public\.cw_catalog c on c\.id=x\)<>5$a$;
  tight text := $b$or (select count(distinct x) from unnest(_deck) x)<>5
       or (select count(*) from public.cw_catalog where id=any(_deck))<>5$b$;
  n integer;
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position('wl1 text' in d) = 0 then
    for i in 1..array_length(pieces, 1) loop
      n := (length(d) - length(replace(d, pieces[i][1], ''))) / length(pieces[i][1]);
      if n <> 1 then raise exception 'cw_action has changed: piece % found % times', i, n; end if;
      d := replace(d, pieces[i][1], pieces[i][2]);
    end loop;
    if position('public.cw_wear_mult(m.p1,c1,' in d) = 0 or position('public.cw_wear_mult(m.p2,c2,' in d) = 0 then raise exception 'cw_action has changed: the wear reads no longer fit'; end if;
    d := replace(replace(d, 'public.cw_wear_mult(m.p1,c1,', 'public.cw_wear_mult(m.p1,wc1,'), 'public.cw_wear_mult(m.p2,c2,', 'public.cw_wear_mult(m.p2,wc2,');
    if d ~ loose then d := regexp_replace(d, loose, tight);
    elsif position('count(distinct x) from unnest(_deck) x)<>5' in d) = 0 then raise exception 'cw_action has changed: the deck check no longer fits';
    end if;
    execute d;
  end if;
end $migration$;