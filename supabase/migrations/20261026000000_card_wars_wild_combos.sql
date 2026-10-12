-- Card Wars: combo Wildcards. Needs 20261025000000_card_wars_one_power_redline_lift.sql.
--
-- Every Wildcard spin counts now (this replaces "never a 0 / a win is a full hit / a loss costs nothing"):
--   the category is drawn first; Lean only when both played cards are bikes, and then only the wheel's bike
--     Redlines are on the dial (a wheel with no bike has the category drawn again);
--   the dial can stop on any of the five, a 0 included;
--   a Redline that wins hits the rival's card for the tag's damage (80);
--   a Redline that loses blows up on its own player's card (10).
-- The Britten V1000 goes to 100 Lean.
--
-- A combo is a Wildcard crossed with one of the four powers, in a car and a bike version. On a deck card of
-- its kind the best Redline for the category takes half the dial and the combo's effect applies; on the other
-- kind it plays as a plain Wildcard.
--   Pit medic:     80; the played card heals to full, every other card standing heals 15 / blows up for 20
--   Second chance: 100; a loss spins again in another category and lands on the best Redline left / 20
--   Coin flip:     heads (75 %) the best Redline: 100, and 30 to their next card; tails the worst: 80 if it still wins / 25
--   Overdrive:     100, and 60 to their next card / 30
-- A deck still carries one Wildcard-family tag (they are all the power "wild"), and a combo doesn't take its
-- partner power's slot: Wildcard x Overdrive rides with an ordinary Overdrive.
--
-- Unlocking: five wins in a row with a Wildcard tag in the deck (hard computer battles that paid, and player
-- battles, one win a rival a day) unlock a combo the player doesn't have, picked at random; they choose its
-- car or bike version. A loss resets the run, a draw neither counts nor resets.
--
-- The app's probe is cw_wild_rules.

update public.cw_redline_cards set ratings = array[55, 100, 100, 0, 85] where id = 'britten';

-- ── What a player holds ──────────────────────────────────────────────────────
create table if not exists public.cw_wild_tags(
  user_id uuid not null references auth.users(id) on delete cascade,
  combo text not null check (combo in ('heal','reroll','flip','boost')),
  vehicle text not null check (vehicle in ('car','bike')),
  won_at timestamptz not null default now(),
  primary key (user_id, combo, vehicle));
alter table public.cw_wild_tags enable row level security;

-- A player battle win counts once a rival a day.
create table if not exists public.cw_wild_wins(
  user_id uuid not null references auth.users(id) on delete cascade,
  rival uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  primary key (user_id, rival, day));
alter table public.cw_wild_wins enable row level security;

alter table public.cw_accounts add column if not exists wild_streak integer not null default 0;
alter table public.cw_accounts add column if not exists wild_pending text;

-- ── Rules and state ──────────────────────────────────────────────────────────
create or replace function public.cw_wild_rules() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object('streak', 5, 'heads', 75, 'healDeck', 15, 'tailsWin', 80,
    'win', jsonb_build_object('plain', 80, 'heal', 80, 'reroll', 100, 'flip', 100, 'boost', 100),
    'blow', jsonb_build_object('plain', 10, 'heal', 20, 'reroll', 20, 'flip', 25, 'boost', 30),
    'splash', jsonb_build_object('flip', 30, 'boost', 60))
$$;

-- Damage a Redline does when it wins, or to its own player's card when it loses.
create or replace function public.cw_wild_hit(_kind text, _heads boolean, _won boolean) returns integer
language sql immutable as $$
  select case when _won then
      case _kind when 'reroll' then 100 when 'boost' then 100 when 'flip' then (case when _heads then 100 else 80 end) else 80 end
    else
      case _kind when 'heal' then 20 when 'reroll' then 20 when 'flip' then 25 when 'boost' then 30 else 10 end
    end
$$;

create or replace function public.cw_wild_state(_u uuid) returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'streak', coalesce((select wild_streak from public.cw_accounts where user_id = _u), 0),
    'need', 5,
    'pending', (select wild_pending from public.cw_accounts where user_id = _u),
    'owned', coalesce((select jsonb_agg(combo || '.' || vehicle order by won_at, combo, vehicle) from public.cw_wild_tags where user_id = _u), '[]'::jsonb))
$$;

create or replace function public.cw_redline_state() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'wildcard', coalesce((select wildcard from public.cw_accounts where user_id = auth.uid()), false),
    'pity', coalesce((select wild_pity from public.cw_accounts where user_id = auth.uid()), 0),
    'wheel', coalesce((select to_jsonb(redline_wheel) from public.cw_accounts where user_id = auth.uid()), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(card_id order by won_at, card_id) from public.cw_redline_owned where user_id = auth.uid()), '[]'::jsonb),
    'combos', public.cw_wild_state(auth.uid()))
$$;

-- One result with a Wildcard tag in the deck: a win adds to the run, a loss ends it, a draw (null) does neither.
-- The fifth win in a row puts a combo the player doesn't have up for them to choose its version.
create or replace function public.cw_wild_count(_u uuid, _won boolean) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare a public.cw_accounts%rowtype; pick text;
begin
  if _won is null then return; end if;
  select * into a from public.cw_accounts where user_id = _u for update;
  if not found or not a.wildcard then return; end if;
  if not _won then
    update public.cw_accounts set wild_streak = 0 where user_id = _u;
    return;
  end if;
  a.wild_streak := least(5, a.wild_streak + 1);
  if a.wild_streak >= 5 and a.wild_pending is null then
    -- A combo not held at all first; once all four are, one whose other version is still missing.
    select c.combo into pick
    from (values ('heal'), ('reroll'), ('flip'), ('boost')) c(combo)
    cross join lateral (select count(*) n from public.cw_wild_tags t where t.user_id = _u and t.combo = c.combo) h
    where h.n < 2
    order by h.n, random() limit 1;
    if pick is not null then a.wild_pending := pick; a.wild_streak := 0; end if;
  end if;
  update public.cw_accounts set wild_streak = a.wild_streak, wild_pending = a.wild_pending where user_id = _u;
end $function$;

-- The player chooses the car or the bike version of the combo they unlocked.
create or replace function public.cw_wild_pick(_vehicle text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _vehicle is null or _vehicle not in ('car','bike') then raise exception 'Invalid version'; end if;
  select * into a from public.cw_accounts where user_id = u for update;
  if not found or a.wild_pending is null then raise exception 'Nothing to unlock'; end if;
  if exists(select 1 from public.cw_wild_tags where user_id = u and combo = a.wild_pending and vehicle = _vehicle) then raise exception 'Version already held'; end if;
  insert into public.cw_wild_tags(user_id, combo, vehicle) values(u, a.wild_pending, _vehicle);
  update public.cw_accounts set wild_pending = null where user_id = u;
  return public.cw_redline_state();
end $function$;

-- Where the rev counter stops. The Redlines that can fight the category (Lean is for bikes; `_not` has just
-- lost) are the dial: a coin picks the best or the worst of them, `_sure` the best, a combo gives the best
-- half the dial, and a plain Wildcard any of them alike.
create or replace function public.cw_wild_spin(_wheel text[], _cat integer, _kind text, _not text, _sure boolean, out id text, out heads boolean)
language plpgsql volatile security definer set search_path to 'public','pg_temp' as $function$
declare best text; worst text; n integer;
begin
  select
    (select c.id from unnest(_wheel) with ordinality t(w,o) join public.cw_redline_cards c on c.id=t.w where c.id is distinct from _not and (_cat<>2 or c.vehicle='bike') order by c.ratings[_cat] desc, t.o limit 1),
    (select c.id from unnest(_wheel) with ordinality t(w,o) join public.cw_redline_cards c on c.id=t.w where c.id is distinct from _not and (_cat<>2 or c.vehicle='bike') order by c.ratings[_cat], t.o desc limit 1),
    (select count(*) from unnest(_wheel) with ordinality t(w,o) join public.cw_redline_cards c on c.id=t.w where c.id is distinct from _not and (_cat<>2 or c.vehicle='bike'))
  into best, worst, n;
  if n = 0 then
    select w into id from unnest(_wheel) w where w is distinct from _not order by random() limit 1;
    return;
  end if;
  if _sure then id := best; return; end if;
  if _kind = 'flip' then
    heads := random()*100 < 75;
    id := case when heads then best else worst end;
    return;
  end if;
  select c.id into id
  from unnest(_wheel) with ordinality t(w,o) join public.cw_redline_cards c on c.id=t.w
  where c.id is distinct from _not and (_cat<>2 or c.vehicle='bike')
  order by -ln(1 - random()) / (case when _kind <> 'plain' and c.id = best then greatest(1, n - 1) else 1 end) limit 1;
end $function$;

-- ── Dog tag slots: a combo Wildcard is "wild:combo.vehicle", and has to be held ──
create or replace function public.cw_check_slots(_user uuid, _tags text[]) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare t text; pw text; ref text; powers text[] := '{}'::text[];
begin
  if _tags is null or cardinality(_tags) <> 3 then raise exception 'Invalid dog tag'; end if;
  foreach t in array _tags loop
    continue when t = '-';
    if t is null or position(':' in t) = 0 then raise exception 'Invalid dog tag'; end if;
    pw := split_part(t, ':', 1); ref := substr(t, length(pw) + 2);
    if pw not in('reroll','heal','boost','flip','wild') then raise exception 'Invalid dog tag'; end if;
    if pw = any(powers) then raise exception 'One dog tag of each power'; end if;
    powers := array_append(powers, pw);
    if pw = 'wild' then
      if ref <> '' and not exists(select 1 from public.cw_wild_tags w where w.user_id=_user and w.combo || '.' || w.vehicle = ref) then raise exception 'Dog tag not owned'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and a.wildcard) then raise exception 'Dog tag not owned'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and cardinality(a.redline_wheel) = 5) then raise exception 'Pick five Redline cards for your wheel'; end if;
      continue;
    end if;
    continue when ref in('~car','~bike','~all');
    if ref <> '' and not exists(select 1 from public.cw_tags g where g.user_id=_user and g.power=pw and g.card_id=ref) then raise exception 'Dog tag not owned'; end if;
  end loop;
end $function$;

-- ── Player battles: a finished battle counts towards each side's run ─────────
create or replace function public.cw_wild_match_done() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare n integer;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.p2 is not null and new.winner is not null then
    if exists(select 1 from unnest(new.tags1) x where x like 'wild:%') then
      if new.winner = new.p1 then
        insert into public.cw_wild_wins(user_id, rival) values(new.p1, new.p2) on conflict do nothing;
        get diagnostics n = row_count;
        if n = 1 then perform public.cw_wild_count(new.p1, true); end if;
      else
        perform public.cw_wild_count(new.p1, false);
      end if;
    end if;
    if exists(select 1 from unnest(new.tags2) x where x like 'wild:%') then
      if new.winner = new.p2 then
        insert into public.cw_wild_wins(user_id, rival) values(new.p2, new.p1) on conflict do nothing;
        get diagnostics n = row_count;
        if n = 1 then perform public.cw_wild_count(new.p2, true); end if;
      else
        perform public.cw_wild_count(new.p2, false);
      end if;
    end if;
    delete from public.cw_wild_wins where day < current_date - 1 and user_id in (new.p1, new.p2);
  end if;
  return new;
end $function$;
drop trigger if exists cw_wild_match_done on public.cw_matches;
create trigger cw_wild_match_done after update on public.cw_matches for each row execute function public.cw_wild_match_done();

-- ── Computer battles: the app says whether the deck carried a Wildcard ───────
-- One function, so an app that hasn't updated (two arguments) still reaches it.
drop function if exists public.cw_reward_battle(text, text);
CREATE OR REPLACE FUNCTION public.cw_reward_battle(_result text, _level text, _wild boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; amount integer; bonus integer := 0; used integer; r jsonb; streak integer; extra integer := 0;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _result is null or _result not in('win','draw','loss') then raise exception 'Invalid result'; end if;
  if _level is null or _level not in('easy','medium','hard') then raise exception 'Invalid level'; end if;
  if _level = 'hard' then
    insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
    r := public.cw_reward_offline(_result);
    select * into a from public.cw_accounts where user_id=u for update;
    streak := a.hard_streak;
    if _result <> 'win' then
      streak := 0;
    elsif (r->>'rpm')::integer > 0 then
      streak := streak + 1;
      extra := least(10, 2 * (streak - 1));
    end if;
    update public.cw_accounts set hard_streak = streak, balance = balance + extra where user_id=u returning balance into a.balance;
    -- A battle that paid (so within the day's twenty, half a minute apart) counts towards the next combo Wildcard.
    if _wild and (r->>'rpm')::integer > 0 then
      perform public.cw_wild_count(u, case _result when 'win' then true when 'loss' then false else null end);
    end if;
    return r || jsonb_build_object('rpm', (r->>'rpm')::integer + extra, 'balance', a.balance, 'streak', streak, 'streakBonus', extra, 'wild', public.cw_wild_state(u));
  end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  perform public.cw_daily_topup(u);
  select * into a from public.cw_accounts where user_id=u for update;
  used := case when a.reward_day = current_date then a.reward_count else 0 end;
  if _level = 'easy' or a.last_offline_reward > now() - interval '30 seconds' or used >= 20 then
    return jsonb_build_object('rpm',0,'bonus',0,'balance',a.balance,'left',greatest(0,20-used),'streak',a.hard_streak,'streakBonus',0);
  end if;
  amount := case _result when 'win' then 8 when 'draw' then 4 else 3 end;
  update public.cw_accounts set
    balance = balance + amount,
    last_offline_reward = now(),
    reward_day = current_date,
    reward_count = used + 1
  where user_id=u returning balance into a.balance;
  return jsonb_build_object('rpm',amount,'bonus',bonus,'balance',a.balance,'left',20-used-1,'streak',a.hard_streak,'streakBonus',0);
end $function$;

-- ── The owner's unlock code gives every combo, both versions ─────────────────
create or replace function public.cw_unlock_all(_code text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  u uuid := auth.uid(); a public.cw_accounts%rowtype;
  h text := encode(sha256(convert_to(upper(btrim(coalesce(_code, ''))), 'UTF8')), 'hex');
  want constant text := '05c27b89038d8a238fb852e8983153c450a5a382957a2ff2736064a13d0ba610';
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(493817062);
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id = u for update;
  -- The same ten tries a day as build codes.
  if a.redeem_day = current_date and a.redeem_tries >= 10 then raise exception 'Too many tries today'; end if;
  update public.cw_accounts set redeem_day = current_date, redeem_tries = case when redeem_day = current_date then redeem_tries + 1 else 1 end where user_id = u;
  if h <> want then return jsonb_build_object('ok', false); end if;
  if exists(select 1 from public.cw_unlock_used where user_id <> u) then raise exception 'Code already used'; end if;
  insert into public.cw_unlock_used(code_hash, user_id) values(h, u) on conflict do nothing;
  -- The right code doesn't use up a try.
  update public.cw_accounts set redeem_tries = greatest(0, redeem_tries - 1), balance = greatest(balance, 100000) where user_id = u;

  insert into public.cw_owned(user_id, card_id)
  select u, c.id from public.cw_catalog c where c.category is not null
  on conflict do nothing;

  insert into public.cw_redline_owned(user_id, card_id) select u, id from public.cw_redline_cards on conflict do nothing;
  update public.cw_accounts set wildcard = true, wild_pity = 0,
    redline_wheel = case when redline_wheel is null or cardinality(redline_wheel) <> 5
      then array(select card_id from public.cw_redline_owned where user_id = u order by won_at, card_id limit 5) else redline_wheel end
  where user_id = u;

  insert into public.cw_tags(user_id, power, card_id)
  select u, p.power, c.id
  from (values ('boost'), ('heal'), ('reroll'), ('flip')) p(power)
  cross join public.cw_catalog c
  where c.category is not null
  on conflict do nothing;

  insert into public.cw_wild_tags(user_id, combo, vehicle)
  select u, c.combo, v.vehicle from (values ('heal'), ('reroll'), ('flip'), ('boost')) c(combo) cross join (values ('car'), ('bike')) v(vehicle)
  on conflict do nothing;
  update public.cw_accounts set wild_pending = null where user_id = u;

  return jsonb_build_object('ok', true) || public.cw_shop();
end $function$;

-- ── Player battles ───────────────────────────────────────────────────────────
-- cw_action as it stood after 20261025000000, with the Wildcard's round rewritten.
CREATE OR REPLACE FUNCTION public.cw_action(_action text, _code uuid DEFAULT NULL::uuid, _deck text[] DEFAULT NULL::text[], _card integer DEFAULT NULL::integer, _tag integer DEFAULT NULL::integer, _round integer DEFAULT NULL::integer, _tags text[] DEFAULT NULL::text[], _own jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  u uuid := auth.uid();
  m public.cw_matches%rowtype;
  a public.cw_accounts%rowtype;
  side integer; cat integer; first_cat integer; n integer;
  s1 numeric; s2 numeric; b1 numeric := 1; b2 numeric := 1; r1 numeric := 1; r2 numeric := 1;
  damage integer; v1 text; v2 text; c1 text; c2 text; rat1 integer[]; rat2 integer[];
  victor uuid; h1 integer; h2 integer; lean_ok boolean; changed boolean := false;
  tags text[]; slots boolean; pw1 integer; pw2 integer; tr1 text; tr2 text; hd1 boolean; hd2 boolean; fc1 integer; fc2 integer;
  rt jsonb; base integer[]; cand integer[]; cap_mean numeric; held integer[]; ow jsonb;
  wl1 text; wl2 text; wc1 text; wc2 text; wheel text[];
  wk1 text; wk2 text; wh1 boolean; wh2 boolean; wf1 text; wf2 text; sp1 jsonb; sp2 jsonb; wfix boolean := false; nx integer; spl integer;
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
    tags := coalesce(_tags, array['','','','-']); slots := cardinality(tags)=3 and exists(select 1 from unnest(tags) x where x='-' or position(':' in coalesce(x,''))>0); if slots then perform public.cw_check_slots(u, tags); elsif cardinality(tags)=3 then tags := tags || '-'::text; end if;
    if not slots and cardinality(tags)<>4 then raise exception 'Invalid dog tag'; end if; if (select count(*) from unnest(tags) x where x is distinct from '-')>3 then raise exception 'Three dog tags a deck'; end if;
    for i in 1..(case when slots then 0 else 4 end) loop
      tags[i] := coalesce(tags[i],'');
      if tags[i] not in('','~car','~bike','-') and not exists(select 1 from public.cw_tags t where t.user_id=u and t.power=(array['reroll','heal','boost','flip'])[i] and t.card_id=tags[i])
      then raise exception 'Dog tag not owned'; end if;
    end loop;
    if slots and exists(select 1 from unnest(tags) x where x like 'wild:%') then select redline_wheel into wheel from public.cw_accounts where user_id=u; end if;
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
            if cand[k]<base[k] or cand[k]>least(base[k]+12,(select max(ratings[k]) from public.cw_catalog)) then raise exception 'Invalid own card'; end if;
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
    insert into public.cw_matches(p1,d1,tags1,rt1,wild1,stake,categories,penalty)
    values(u,_deck,tags,rt,wheel,20,array(select x from generate_series(1,5) x order by random()),case when random()<.125 then 2+floor(random()*4)::integer else -1 end)
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
        m.p2 := u; m.d2 := _deck; m.tags2 := tags; m.rt2 := rt; m.wild2 := wheel; m.status := 'playing'; m.deadline := now()+interval '120 seconds';
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
        if _tag is not null and (_tag<0 or _tag>3) then raise exception 'Invalid dog tag'; end if; if _tag is not null and coalesce((case when side=1 then m.tags1 else m.tags2 end)[_tag+1],'-')='-' then raise exception 'Invalid dog tag'; end if;
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
          pw1 := public.cw_armed_power(m.tags1,m.tag1); tr1 := public.cw_armed_ref(m.tags1,m.tag1);
          pw2 := public.cw_armed_power(m.tags2,m.tag2); tr2 := public.cw_armed_ref(m.tags2,m.tag2);
          wc1 := c1; wc2 := c2;
          -- What each armed Wildcard plays as: its combo on a deck card of its kind, a plain Wildcard otherwise.
          if pw1=4 and cardinality(m.wild1)>0 then wk1 := case when tr1<>'' and split_part(tr1,'.',2)=v1 then split_part(tr1,'.',1) else 'plain' end; end if;
          if pw2=4 and cardinality(m.wild2)>0 then wk2 := case when tr2<>'' and split_part(tr2,'.',2)=v2 then split_part(tr2,'.',1) else 'plain' end; end if;
          -- Lean is fought only by a bike Redline: a wheel without one has the category drawn again.
          if cat=2 and ((wk1 is not null and not exists(select 1 from public.cw_redline_cards r where r.id=any(m.wild1) and r.vehicle='bike'))
                     or (wk2 is not null and not exists(select 1 from public.cw_redline_cards r where r.id=any(m.wild2) and r.vehicle='bike'))) then
            cat := (array[1,3,4,5])[1+floor(random()*4)::integer];
          end if;
          if wk1 is not null then
            select s.id, s.heads into wl1, wh1 from public.cw_wild_spin(m.wild1, cat, wk1, null, false) s;
            select ratings into rat1 from public.cw_redline_cards where id=wl1; wc1 := '~redline';
          end if;
          if wk2 is not null then
            select s.id, s.heads into wl2, wh2 from public.cw_wild_spin(m.wild2, cat, wk2, null, false) s;
            select ratings into rat2 from public.cw_redline_cards where id=wl2; wc2 := '~redline';
          end if;
          -- A replay never moves a Redline into Lean.
          if wl1 is not null or wl2 is not null then lean_ok := false; end if;
          if ev=3 then
            select t.i into low from unnest(m.hp1) with ordinality t(hp,i) where t.hp>0 order by t.hp, t.i limit 1;
            if low is not null then m.hp1[low] := least(100,m.hp1[low]+15); end if;
            low := null;
            select t.i into low from unnest(m.hp2) with ordinality t(hp,i) where t.hp>0 order by t.hp, t.i limit 1;
            if low is not null then m.hp2[low] := least(100,m.hp2[low]+15); end if;
          end if;
          if pw1=1 then m.hp1[m.move1+1] := least(100,m.hp1[m.move1+1]+public.cw_tag_value(1,tr1,v1)); end if;
          if pw2=1 then m.hp2[m.move2+1] := least(100,m.hp2[m.move2+1]+public.cw_tag_value(1,tr2,v2)); end if;
          if pw1=2 then b1 := public.cw_tag_value(2,tr1,v1)/100.0; end if;
          if pw2=2 then b2 := public.cw_tag_value(2,tr2,v2)/100.0; end if;
          if pw1=3 then
            hd1 := random()*100 < public.cw_tag_value(3,tr1,v1);
            select t.k into fc1 from unnest(array[1,3,4,5]) with ordinality t(k,o)
              order by (round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,wc1,t.k) end)-round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,wc2,t.k) end))*case when hd1 then -1 else 1 end, t.o limit 1;
          end if;
          if pw2=3 then
            hd2 := random()*100 < public.cw_tag_value(3,tr2,v2);
            select t.k into fc2 from unnest(array[1,3,4,5]) with ordinality t(k,o)
              order by (round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,wc2,t.k) end)-round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,wc1,t.k) end))*case when hd2 then -1 else 1 end, t.o limit 1;
          end if;
          if fc1 is not null or fc2 is not null then
            cat := case when fc1 is not null and fc2 is not null and fc1<>fc2 then (case when random()<.5 then fc1 else fc2 end) else coalesce(fc1,fc2) end;
          end if;
          if ev=9 then
            if exists(select 1 from jsonb_array_elements(m.log) e where e->>'winner'='1' and e->>'card1'=c1) then cr1 := 1.08; end if;
            if exists(select 1 from jsonb_array_elements(m.log) e where e->>'winner'='2' and e->>'card2'=c2) then cr2 := 1.08; end if;
          end if;
          w1 := case when ev=6 then 1 else public.cw_wear_mult(m.p1,wc1,cat) end;
          w2 := case when ev=6 then 1 else public.cw_wear_mult(m.p2,wc2,cat) end;
          s1 := round(rat1[cat]*w1)*b1*cr1;
          s2 := round(rat2[cat]*w2)*b2*cr2;
          if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
          if (s1<s2 and (pw1=0 or (wk1='reroll' and cardinality(m.wild1)>1))) or (s2<s1 and (pw2=0 or (wk2='reroll' and cardinality(m.wild2)>1))) then
            if s1<s2 and pw1=0 then r1 := public.cw_tag_value(0,tr1,v1)/100.0; elsif s2<s1 and pw2=0 then r2 := public.cw_tag_value(0,tr2,v2)/100.0; end if;
            first_cat := cat;
            loop
              cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
              exit when cat<>first_cat;
            end loop;
            -- A Second chance combo spins again, and lands on the best Redline left for the new category.
            if s1<s2 and wk1='reroll' then
              wf1 := wl1;
              select s.id into wl1 from public.cw_wild_spin(m.wild1, cat, wk1, wf1, true) s;
              select ratings into rat1 from public.cw_redline_cards where id=wl1;
            elsif s2<s1 and wk2='reroll' then
              wf2 := wl2;
              select s.id into wl2 from public.cw_wild_spin(m.wild2, cat, wk2, wf2, true) s;
              select ratings into rat2 from public.cw_redline_cards where id=wl2;
            end if;
            w1 := case when ev=6 then 1 else public.cw_wear_mult(m.p1,wc1,cat) end;
            w2 := case when ev=6 then 1 else public.cw_wear_mult(m.p2,wc2,cat) end;
            s1 := round(rat1[cat]*w1)*b1*r1*cr1;
            s2 := round(rat2[cat]*w2)*b2*r2*cr2;
            if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
          end if;
          if ev=1 then mid := (s1+s2)/2; s1 := mid+(s1-mid)*.5; s2 := mid+(s2-mid)*.5; end if;
          if ev=8 then floor_hp := 1; end if;
          wn := case when s1=s2 then null when s1>s2 then 1 else 2 end;
          damage := case when s1=s2 then 0 else least(80,35+round(abs(s1-s2)*.8)::integer) end;
          -- A Redline that wins hits for its tag's damage. One that loses to an ordinary card blows up on its own
          -- player's card; one that loses to another Redline just takes that Redline's hit.
          if wn=1 and wl1 is not null then damage := public.cw_wild_hit(wk1, wh1, true); wfix := true;
          elsif wn=2 and wl2 is not null then damage := public.cw_wild_hit(wk2, wh2, true); wfix := true;
          elsif wn=2 and wl1 is not null then damage := public.cw_wild_hit(wk1, wh1, false); wfix := true;
          elsif wn=1 and wl2 is not null then damage := public.cw_wild_hit(wk2, wh2, false); wfix := true;
          end if;
          if ev=4 then
            wn := null; damage := 0;
          elsif ev=7 and s1<>s2 and abs(s1-s2)<=greatest(s1,s2)*.05 then
            wn := null; damage := 10;
            m.hp1[m.move1+1] := greatest(case when m.hp1[m.move1+1]>0 then floor_hp else 0 end, m.hp1[m.move1+1]-10);
            m.hp2[m.move2+1] := greatest(case when m.hp2[m.move2+1]>0 then floor_hp else 0 end, m.hp2[m.move2+1]-10);
          else
            if ev=2 and damage>0 and not wfix then damage := least(95,damage+15); end if;
            if ev=5 and cat=5 and damage>0 and not wfix then damage := least(100,damage*2); end if;
            if wn=1 then m.hp2[m.move2+1] := greatest(floor_hp,m.hp2[m.move2+1]-damage);
            elsif wn=2 then m.hp1[m.move1+1] := greatest(floor_hp,m.hp1[m.move1+1]-damage); end if;
            -- The winning combo's own effect: the hit spills onto their next card standing, or the deck heals.
            if wn=1 and wl1 is not null then
              spl := case when wk1='boost' then 60 when wk1='flip' and wh1 then 30 else 0 end;
              if spl>0 then
                select t.i into nx from unnest(m.hp2) with ordinality t(hp,i) where t.hp>0 and t.i<>m.move2+1 order by t.i limit 1;
                if nx is not null then m.hp2[nx] := greatest(floor_hp,m.hp2[nx]-spl); sp1 := jsonb_build_object('c',m.d2[nx],'d',spl); end if;
              end if;
              if wk1='heal' then
                m.hp1 := array(select case when t.i=m.move1+1 then 100 when t.hp>0 then least(100,t.hp+15) else t.hp end from unnest(m.hp1) with ordinality t(hp,i) order by t.i);
              end if;
            elsif wn=2 and wl2 is not null then
              spl := case when wk2='boost' then 60 when wk2='flip' and wh2 then 30 else 0 end;
              if spl>0 then
                select t.i into nx from unnest(m.hp1) with ordinality t(hp,i) where t.hp>0 and t.i<>m.move1+1 order by t.i limit 1;
                if nx is not null then m.hp1[nx] := greatest(floor_hp,m.hp1[nx]-spl); sp2 := jsonb_build_object('c',m.d1[nx],'d',spl); end if;
              end if;
              if wk2='heal' then
                m.hp2 := array(select case when t.i=m.move2+1 then 100 when t.hp>0 then least(100,t.hp+15) else t.hp end from unnest(m.hp2) with ordinality t(hp,i) order by t.i);
              end if;
            end if;
          end if;
          m.log := m.log || jsonb_build_array(jsonb_build_object(
            'round',m.round,'category',cat,'first',first_cat,'card1',c1,'card2',c2,'damage',damage,
            'winner',wn,'s1',round(s1,1),'s2',round(s2,1),'t1',pw1,'t2',pw2,'event',ev,'w1',wl1,'w2',wl2,'wk1',wk1,'wk2',wk2,'wh1',wh1,'wh2',wh2,'wf1',wf1,'wf2',wf2,'sp1',sp1,'sp2',sp2,
            'f1',case when fc1 is not null then jsonb_build_object('h',hd1,'c',fc1) end,
            'f2',case when fc2 is not null then jsonb_build_object('h',hd2,'c',fc2) end));
        end if;
        m.round := m.round+1; m.move1 := null; m.move2 := null; m.tag1 := null; m.tag2 := null; m.deadline := now()+interval '120 seconds';
        changed := true;
        if not exists(select 1 from unnest(m.hp1) x where x>0) or not exists(select 1 from unnest(m.hp2) x where x>0) then
          select sum(x) into h1 from unnest(m.hp1) x; select sum(x) into h2 from unnest(m.hp2) x;
          m.winner := case when h1=h2 then null when h1>h2 then m.p1 else m.p2 end; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,m.winner,m.stake,m.d1,m.d2,m.log);
        elsif not public.cw_boost_left(m.tags1,m.used1) and not public.cw_boost_left(m.tags2,m.used2) and not exists(
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
      update public.cw_matches set p2=m.p2,d2=m.d2,tags2=m.tags2,rt2=m.rt2,wild2=m.wild2,hp1=m.hp1,hp2=m.hp2,used1=m.used1,used2=m.used2,move1=m.move1,move2=m.move2,tag1=m.tag1,tag2=m.tag2,round=m.round,status=m.status,winner=m.winner,log=m.log,deadline=m.deadline where code=m.code;
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

revoke all on function public.cw_wild_count(uuid, boolean), public.cw_wild_spin(text[], integer, text, text, boolean), public.cw_wild_match_done(), public.cw_wild_state(uuid), public.cw_wild_hit(text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.cw_wild_rules(), public.cw_wild_pick(text), public.cw_reward_battle(text, text, boolean), public.cw_redline_state() from public, anon;
grant execute on function public.cw_wild_rules(), public.cw_wild_pick(text), public.cw_reward_battle(text, text, boolean), public.cw_redline_state() to authenticated;
