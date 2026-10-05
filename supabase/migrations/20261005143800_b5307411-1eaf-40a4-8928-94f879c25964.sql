-- Card Wars: a stable economy, dog tags tied to vehicles, and battle wear that saves.
--
-- 1. Fix. cw_wear_offline called check_rate_limit with four arguments (it takes
--    three), so no computer battle's wear was ever saved. It now saves; race
--    builds are told from road cards by their shelf, not by a list of six ids
--    from the first catalogue; and a card resting in the garage gets its 10 %
--    back like the app says (only cards in the deck that didn't fight did).
-- 2. Ratings and prices follow strength. Every card's ratings are re-worked and
--    its price is set by how often it wins a round against the rest of the
--    catalogue (npm run cardwars:balance prints these rows; the app holds the
--    same numbers in src/features/card-wars/lib/catalog.ts, BALANCE).
-- 3. Rewards. A computer battle pays 15 / 8 / 5 RPM (win / draw / loss), the
--    day's first win 20 more, for up to 20 battles a day. The prize card a win
--    picks is recorded here, so it's owned on every phone; one already owned
--    pays 10 RPM.
-- 4. Spins. A fifth of a shelf's average price: 16 % a card, 12 % a dog tag,
--    20 % another spin, 52 % RPM (0.2 to 1.2 times the cost). A duplicate
--    gives half the spin back, so spinning never pays more than it costs once a
--    shelf is owned.
-- 5. Dog tags. Won on spins (three free ones to start), each tied to a vehicle
--    that sets its strength; held in cw_tags. Second chance now replays a lost
--    round instead of redrawing a category nobody had seen.
-- 6. Player battles. Both put in 20 RPM, the winner takes 36 (what was there
--    before paid out 70 on 20, which two phones could farm). The log now says
--    what was compared, so the app can show why a round went the way it did,
--    and two identical last cards with no Overdrive left end in a draw.
-- 7. Repairs cost more for dearer cards; the daily top-up is to 20 RPM; new
--    players start with 60.
--
-- The app reads cw_rules() to know all of this is live (lib/serverCaps.ts,
-- cardWars2) and keeps to the old numbers until it is.

-- ── Catalogue ────────────────────────────────────────────────────────────────
insert into public.cw_catalog(id, vehicle, ratings, price, category) values
 ('911','car','{80,30,45,62,76}',75,'road'),('gt3r','car','{74,30,52,70,92}',195,'race'),('m3','car','{70,30,39,80,62}',65,'road'),
 ('m4gt3','car','{74,30,52,68,88}',145,'race'),('296gtb','car','{85,30,58,58,76}',120,'road'),('296gt3','car','{74,30,54,68,91}',185,'race'),
 ('750s','car','{85,30,57,55,75}',105,'road'),('720sgt3','car','{74,30,51,67,89}',150,'race'),('amggtbs','car','{83,30,54,57,74}',90,'road'),
 ('amggt3','car','{74,30,50,70,88}',145,'race'),('gryaris','car','{49,30,29,72,72}',40,'road'),('suprag4','car','{60,30,42,66,80}',55,'race'),
 ('civic','car','{65,30,32,76,70}',50,'road'),('nsxgt3','car','{70,30,50,68,87}',105,'race'),('mustangdh','car','{63,30,39,74,56}',45,'road'),
 ('rally','car','{38,30,33,64,90}',60,'race'),('mx5','car','{45,30,24,82,68}',45,'road'),('mx5cup','car','{42,30,24,60,84}',35,'race'),
 ('gti','car','{56,30,24,84,60}',50,'road'),('gtitcr','car','{56,30,38,58,82}',40,'race'),('mt07','bike','{42,50,48,72,60}',35,'road'),
 ('r6','bike','{61,79,66,40,90}',100,'race'),('ninja','bike','{34,53,37,70,70}',30,'road'),('zx10rr','bike','{81,92,84,36,89}',205,'race'),
 ('sv650','bike','{42,46,47,78,58}',40,'road'),('gsxr','bike','{76,86,80,36,86}',125,'race'),('fireblade','bike','{74,73,77,46,74}',85,'road'),
 ('firebladesbk','bike','{81,92,84,34,91}',225,'race'),('panigale','bike','{74,73,78,44,76}',90,'road'),('v4rsbk','bike','{83,96,85,34,93}',275,'race'),
 ('gs','bike','{45,36,57,92,48}',60,'road'),('s1000','bike','{81,92,83,38,88}',200,'race'),('rs660f','bike','{49,63,57,64,72}',50,'road'),
 ('rs660','bike','{52,79,62,42,90}',90,'race'),('890duke','bike','{52,60,62,62,72}',50,'road'),('rc8c','bike','{60,83,72,38,92}',110,'race'),
 ('striple','bike','{56,60,64,64,74}',60,'road'),('moto2','bike','{72,89,70,36,90}',110,'race'),('f3rr','bike','{63,66,70,52,74}',60,'road'),
 ('f3ss','bike','{68,83,72,38,88}',95,'race'),('c8r','car','{74,30,48,84,88}',170,'gtlm'),('c7r','car','{73,30,48,82,86}',130,'gtlm'),
 ('rsr19','car','{74,30,49,78,93}',215,'gtlm'),('rsr17','car','{73,30,49,80,90}',170,'gtlm'),('488gte','car','{74,30,49,78,91}',195,'gtlm'),
 ('m8gte','car','{74,30,49,80,85}',140,'gtlm'),('m6gtlm','car','{73,30,48,76,84}',100,'gtlm'),('fordgt','car','{76,30,48,80,90}',200,'gtlm'),
 ('vantagegte','car','{74,30,49,82,88}',175,'gtlm'),('lexusrcf','car','{72,30,47,76,84}',90,'gtlm'),('rb19','car','{92,30,81,40,99}',415,'f1'),
 ('w11','car','{92,30,83,40,99}',465,'f1'),('f2004','car','{99,30,86,38,96}',475,'f1'),('mp44','car','{85,30,80,34,88}',160,'f1'),
 ('fw14b','car','{88,30,87,36,94}',350,'f1'),('w07','car','{94,30,83,40,95}',415,'f1'),('rb9','car','{85,30,79,38,95}',260,'f1'),
 ('lotus79','car','{70,30,70,32,86}',65,'f1'),('mcl38','car','{92,30,81,40,98}',405,'f1'),('bgp001','car','{85,30,81,38,93}',260,'f1'),
 ('m1000tt','bike','{85,79,83,64,86}',275,'tt'),('firebladett','bike','{83,76,82,62,85}',205,'tt'),('zx10tt','bike','{81,76,82,62,84}',185,'tt'),
 ('gsxrtt','bike','{79,76,81,63,83}',165,'tt'),('r1tt','bike','{79,76,80,60,85}',155,'tt'),('norton','bike','{81,73,82,60,82}',155,'tt'),
 ('shinden','bike','{63,66,62,24,76}',40,'tt'),('rc30','bike','{56,60,60,58,78}',55,'tt'),('ow01','bike','{58,60,62,58,78}',60,'tt'),
 ('striplett','bike','{68,76,70,58,86}',100,'tt'),('gp23','bike','{98,99,93,30,96}',460,'motogp'),('rc213v','bike','{92,99,89,30,97}',420,'motogp'),
 ('m1_15','bike','{92,99,87,32,98}',435,'motogp'),('gsxrr','bike','{90,99,87,32,97}',405,'motogp'),('rc16','bike','{95,99,91,29,95}',410,'motogp'),
 ('rsgp','bike','{95,99,91,32,96}',470,'motogp'),('rc211v','bike','{86,92,89,30,94}',315,'motogp'),('gp7','bike','{85,92,87,30,90}',235,'motogp'),
 ('m1_04','bike','{85,92,89,30,95}',310,'motogp'),('nsr500','bike','{81,86,85,28,93}',200,'motogp')
on conflict (id) do update set vehicle=excluded.vehicle, ratings=excluded.ratings, price=excluded.price, category=excluded.category;

-- ── Accounts, battles, dog tags ──────────────────────────────────────────────
alter table public.cw_accounts
  alter column balance set default 60,
  add column if not exists free_tag_spins integer not null default 3 check (free_tag_spins >= 0),
  add column if not exists reward_day date,
  add column if not exists reward_count integer not null default 0,
  add column if not exists first_win_day date,
  add column if not exists prize_due boolean not null default false;

-- Battles already under way keep the 10 RPM they were staked at.
alter table public.cw_matches
  add column if not exists stake integer not null default 10,
  add column if not exists tags1 text[],
  add column if not exists tags2 text[];
alter table public.cw_matches alter column stake set default 20;

create table if not exists public.cw_tags(
  user_id uuid not null references auth.users(id) on delete cascade,
  power text not null check (power in ('reroll','heal','boost')),
  card_id text not null references public.cw_catalog(id),
  won_at timestamptz not null default now(),
  primary key (user_id, power, card_id));
grant select on public.cw_tags to authenticated;
grant all on public.cw_tags to service_role;
alter table public.cw_tags enable row level security;
drop policy if exists "Own dog tags" on public.cw_tags;
create policy "Own dog tags" on public.cw_tags for select to authenticated using (auth.uid() = user_id);

-- ── The rules, for the app to read ───────────────────────────────────────────
create or replace function public.cw_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'version', 2,
    'reward', jsonb_build_object('win', 15, 'draw', 8, 'loss', 5, 'firstWin', 20, 'daily', 20, 'duplicate', 10),
    'stake', 20, 'pot', 36,
    'spin', jsonb_build_object('card', 16, 'tag', 12, 'spin', 20, 'rpm', 52),
    'freeTagSpins', 3)
$$;
revoke all on function public.cw_rules() from public, anon;
grant execute on function public.cw_rules() to authenticated;

create or replace function public.cw_spin_cost(_cat text) returns integer language sql immutable set search_path=public as $$
  select case _cat when 'road' then 10 when 'race' then 25 when 'gtlm' then 30 when 'tt' then 30 when 'f1' then 65 when 'motogp' then 75 end
$$;
revoke all on function public.cw_spin_cost(text) from public, anon, authenticated;

-- ── Wear ─────────────────────────────────────────────────────────────────────
create or replace function public.cw_is_race(_card text) returns boolean language sql stable set search_path=public as $$
  select coalesce((select category is not null and category <> 'road' from public.cw_catalog where id = _card), false)
$$;
revoke all on function public.cw_is_race(text) from public, anon, authenticated;

-- A battle's wear for one player: the cards that fought lose condition (race
-- builds more), and every other worn card they have rests and gets 10 back,
-- in the deck or not.
create or replace function public.cw_wear_for(_user uuid, _fought text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare card text; rate integer;
begin
  if _user is null or _fought is null then return; end if;
  foreach card in array _fought loop
    rate := case when public.cw_is_race(card) then 15 else 8 end;
    insert into public.cw_wear(user_id,card_id,condition) values(_user,left(card,120),100-rate)
    on conflict(user_id,card_id) do update set condition=greatest(0,cw_wear.condition-rate);
  end loop;
  update public.cw_wear w set condition=least(100,w.condition+10) where w.user_id=_user and w.condition<100 and not (w.card_id = any(_fought));
end $$;
revoke all on function public.cw_wear_for(uuid,text[]) from public, anon, authenticated;

create or replace function public.cw_apply_wear(_p1 uuid, _p2 uuid, _d1 text[], _d2 text[], _log jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.cw_wear_for(_p1, (select coalesce(array_agg(distinct e->>'card1'), '{}') from jsonb_array_elements(coalesce(_log,'[]')) e));
  perform public.cw_wear_for(_p2, (select coalesce(array_agg(distinct e->>'card2'), '{}') from jsonb_array_elements(coalesce(_log,'[]')) e));
end $$;
revoke all on function public.cw_apply_wear(uuid,uuid,text[],text[],jsonb) from public, anon, authenticated;

create or replace function public.cw_wear_offline(_deck text[], _fought text[]) returns table(card_id text, condition integer)
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _deck is null or cardinality(_deck)<>5 or (select count(distinct x) from unnest(_deck) x)<>5 then raise exception 'Deck needs five unique cards'; end if;
  if _fought is null or cardinality(_fought)<1 or not (_fought <@ _deck) then raise exception 'Invalid battle'; end if;
  if not public.check_rate_limit('cw_wear_offline', 6, 60) then raise exception 'Too many battles'; end if;
  perform public.cw_wear_for(u, _fought);
  return query select w.card_id,w.condition from public.cw_wear w where w.user_id=u;
end $$;
revoke all on function public.cw_wear_offline(text[],text[]) from public, anon;
grant execute on function public.cw_wear_offline(text[],text[]) to authenticated;

-- ── Daily top-up and the shop ────────────────────────────────────────────────
create or replace function public.cw_daily_topup(_u uuid) returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.cw_accounts(user_id) values(_u) on conflict do nothing;
  update public.cw_accounts set balance=greatest(balance,20), last_topup=current_date where user_id=_u and (last_topup is null or last_topup<current_date);
$$;
revoke all on function public.cw_daily_topup(uuid) from public, anon, authenticated;

create or replace function public.cw_shop() returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype;
begin
  if u is not null then perform public.cw_daily_topup(u); end if;
  select * into a from public.cw_accounts where user_id=u;
  return jsonb_build_object(
    'balance', coalesce(a.balance, 60),
    'freeSpins', coalesce(a.free_spins, 5),
    'freeTagSpins', coalesce(a.free_tag_spins, 3),
    'owned', coalesce((select jsonb_agg(card_id) from public.cw_owned where user_id=u), '[]'::jsonb),
    'spins', coalesce((select jsonb_object_agg(category, count) from public.cw_spins where user_id=u and count>0), '{}'::jsonb),
    'tags', coalesce((select jsonb_agg(power || ':' || card_id order by won_at, power, card_id) from public.cw_tags where user_id=u), '[]'::jsonb),
    'rewardsLeft', greatest(0, 20 - case when a.reward_day = current_date then a.reward_count else 0 end),
    'firstWin', a.first_win_day is distinct from current_date);
end $$;
revoke all on function public.cw_shop() from public, anon;
grant execute on function public.cw_shop() to authenticated;

create or replace function public.cw_buy(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); p integer; b integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select price into p from public.cw_catalog where id=_card and category is not null;
  if p is null or p<=0 then raise exception 'Card not for sale'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select balance into b from public.cw_accounts where user_id=u for update;
  if exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then raise exception 'Already owned'; end if;
  if b<p then raise exception 'Not enough RPM'; end if;
  update public.cw_accounts set balance=balance-p where user_id=u returning balance into b;
  insert into public.cw_owned(user_id,card_id) values(u,_card);
  return jsonb_build_object('balance',b,'card',_card);
end $$;
revoke all on function public.cw_buy(text) from public, anon;
grant execute on function public.cw_buy(text) to authenticated;

-- ── Spins ────────────────────────────────────────────────────────────────────
-- _free: one of the starter spins, which always lands a card the player doesn't
-- have. Otherwise a bonus spin for the shelf if there is one, or its cost in RPM.
create or replace function public.cw_spin(_cat text, _free boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
        kind := 'duplicate'; amount := cost/2; update public.cw_accounts set balance=balance+amount where user_id=u;
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
end $$;
revoke all on function public.cw_spin(text,boolean) from public, anon;
grant execute on function public.cw_spin(text,boolean) to authenticated;

-- One of the free dog tag spins: a tag of a power the player has none of yet
-- (while there is one), tied to a vehicle drawn like a free card.
create or replace function public.cw_spin_tag() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; r double precision; cat text; pw text; card text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if a.free_tag_spins<=0 then raise exception 'No free spins left'; end if;
  update public.cw_accounts set free_tag_spins=free_tag_spins-1 where user_id=u;
  select p into pw from unnest(array['boost','heal','reroll']) p where not exists(select 1 from public.cw_tags t where t.user_id=u and t.power=p) order by random() limit 1;
  if pw is null then pw := (array['reroll','heal','boost'])[1+floor(random()*3)::integer]; end if;
  r := random();
  cat := case when r<.55 then 'road' when r<.85 then 'race' when r<.91 then 'gtlm' when r<.97 then 'tt' when r<.985 then 'f1' else 'motogp' end;
  select id into card from public.cw_catalog c where c.category=cat and not exists(select 1 from public.cw_tags t where t.user_id=u and t.power=pw and t.card_id=c.id) order by random() limit 1;
  if card is null then
    select id, category into card, cat from public.cw_catalog c where c.category is not null and not exists(select 1 from public.cw_tags t where t.user_id=u and t.power=pw and t.card_id=c.id) order by random() limit 1;
  end if;
  if card is null then raise exception 'No dog tags left to win'; end if;
  insert into public.cw_tags(user_id,power,card_id) values(u,pw,card);
  return jsonb_build_object('kind','tag','card',null,'tag',pw || ':' || card,'category',cat,'rpm',0,'spins',0) || public.cw_shop();
end $$;
revoke all on function public.cw_spin_tag() from public, anon;
grant execute on function public.cw_spin_tag() to authenticated;

-- ── Computer battles: RPM and the prize ──────────────────────────────────────
-- The battle is settled on the phone, so this trusts the result it's told and
-- bounds what that's worth: half a minute apart, twenty a day.
create or replace function public.cw_reward_offline(_result text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; amount integer; bonus integer := 0; used integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _result is null or _result not in('win','draw','loss') then raise exception 'Invalid result'; end if;
  perform public.cw_daily_topup(u);
  select * into a from public.cw_accounts where user_id=u for update;
  used := case when a.reward_day = current_date then a.reward_count else 0 end;
  if a.last_offline_reward > now() - interval '30 seconds' or used >= 20 then
    return jsonb_build_object('rpm',0,'bonus',0,'balance',a.balance,'left',greatest(0,20-used));
  end if;
  amount := case _result when 'win' then 15 when 'draw' then 8 else 5 end;
  if _result='win' and a.first_win_day is distinct from current_date then bonus := 20; end if;
  update public.cw_accounts set
    balance = balance + amount + bonus,
    last_offline_reward = now(),
    reward_day = current_date,
    reward_count = used + 1,
    first_win_day = case when bonus>0 then current_date else first_win_day end,
    prize_due = prize_due or _result='win'
  where user_id=u returning balance into a.balance;
  return jsonb_build_object('rpm',amount+bonus,'bonus',bonus,'balance',a.balance,'left',20-used-1);
end $$;
revoke all on function public.cw_reward_offline(text) from public, anon;
grant execute on function public.cw_reward_offline(text) to authenticated;

-- The prize picked after a paid win: a Road or Race card (the other shelves are
-- only ever bought or spun for). One already owned pays 10 RPM.
create or replace function public.cw_claim_prize(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; kind text; amount integer := 0;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into a from public.cw_accounts where user_id=u for update;
  if not found or not a.prize_due then raise exception 'No prize due'; end if;
  if not exists(select 1 from public.cw_catalog where id=_card and category in('road','race')) then raise exception 'Not a prize card'; end if;
  if exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then
    kind := 'duplicate'; amount := 10;
    update public.cw_accounts set balance=balance+amount, prize_due=false where user_id=u;
  else
    kind := 'card';
    insert into public.cw_owned(user_id,card_id) values(u,_card);
    update public.cw_accounts set prize_due=false where user_id=u;
  end if;
  return jsonb_build_object('kind',kind,'card',_card,'rpm',amount) || public.cw_shop();
end $$;
revoke all on function public.cw_claim_prize(text) from public, anon;
grant execute on function public.cw_claim_prize(text) to authenticated;

-- ── Repairs: dearer cards cost more to run ───────────────────────────────────
create or replace function public.cw_repair(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); c integer; b integer; cost integer; p integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  perform public.cw_daily_topup(u);
  select condition into c from public.cw_wear where user_id=u and card_id=_card for update;
  if c is null or c>=100 then raise exception 'Card is not worn'; end if;
  -- A rider's own card isn't in the catalogue: it's priced as a middling one.
  select price into p from public.cw_catalog where id=_card and category is not null;
  cost := greatest(1, ceil((100-c) * coalesce(p,100) / 200.0)::integer);
  select balance into b from public.cw_accounts where user_id=u for update;
  if b<cost then raise exception 'Not enough RPM'; end if;
  update public.cw_accounts set balance=balance-cost where user_id=u returning balance into b;
  update public.cw_wear set condition=100 where user_id=u and card_id=_card;
  return jsonb_build_object('balance',b,'card',_card,'cost',cost);
end $$;
revoke all on function public.cw_repair(text) from public, anon;
grant execute on function public.cw_repair(text) to authenticated;

-- ── Dog tags in a battle ─────────────────────────────────────────────────────
-- A tag's strength with a card of kind _kind (src/features/card-wars/lib/tagRules.ts
-- does the same sums). _power: 0 Second chance, 1 Pit medic, 2 Overdrive. _ref:
-- '' a standard tag, '~car' / '~bike' one taken from a rider on a track, or the
-- vehicle a won tag is tied to. Hundredths for 0 and 2, HP for 1.
create or replace function public.cw_tag_value(_power integer, _ref text, _kind text) returns integer language plpgsql stable set search_path=public as $$
declare r integer[]; tied text; base integer := case _power when 2 then 135 when 1 then 20 else 100 end;
begin
  if _ref is null or _ref = '' then return base; end if;
  if left(_ref,1) = '~' then
    tied := substr(_ref,2);
  else
    select ratings, vehicle into r, tied from public.cw_catalog where id=_ref;
    if r is null then return base; end if;
    base := case _power when 2 then 125 + r[3]/2 when 1 then 14 + (r[4]*32)/100 else 100 + greatest(0,(r[5]-40)/4) end;
  end if;
  return base + case when tied = _kind then case _power when 2 then 10 when 1 then 6 else 5 end else 0 end;
end $$;
revoke all on function public.cw_tag_value(integer,text,text) from public, anon, authenticated;

-- ── Player battles ───────────────────────────────────────────────────────────
-- Ends a battle: wear for the cards that fought, the pot to the winner (a draw
-- hands both stakes back). Battles staked at 10 RPM before this migration keep
-- the 70 they were promised.
create or replace function public.cw_pay_out(_p1 uuid, _p2 uuid, _winner uuid, _stake integer, _d1 text[], _d2 text[], _log jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.cw_apply_wear(_p1,_p2,_d1,_d2,_log);
  update public.cw_accounts set
    balance = balance + case
      when _winner is null then _stake
      when user_id = _winner then case when _stake = 10 then 70 else _stake*2 - ceil(_stake*0.2)::integer end
      else 0 end,
    active_code = null
  where user_id in (_p1,_p2);
end $$;
revoke all on function public.cw_pay_out(uuid,uuid,uuid,integer,text[],text[],jsonb) from public, anon, authenticated;

drop function if exists public.cw_action(text,uuid,text[],integer,integer,integer);
create or replace function public.cw_action(_action text, _code uuid default null, _deck text[] default null, _card integer default null, _tag integer default null, _round integer default null, _tags text[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  u uuid := auth.uid();
  m public.cw_matches%rowtype;
  a public.cw_accounts%rowtype;
  side integer; cat integer; first_cat integer; n integer;
  s1 numeric; s2 numeric; b1 numeric := 1; b2 numeric := 1; r1 numeric := 1; r2 numeric := 1;
  damage integer; v1 text; v2 text; c1 text; c2 text; rat1 integer[]; rat2 integer[];
  victor uuid; h1 integer; h2 integer; lean_ok boolean; changed boolean := false;
  tags text[];
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _action is null or _action not in('status','create','join','play','leave') then raise exception 'Invalid action'; end if;
  perform pg_advisory_xact_lock(493817061);
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;

  if _action in('create','join') then
    -- Five different catalogue cards; the shop-only series must be owned (Road
    -- and Race cards are also won, and riders' own cards battle as one).
    if _deck is null or cardinality(_deck)<>5 or (select count(distinct x) from unnest(_deck) x)<>5
       or (select count(*) from public.cw_catalog where id=any(_deck))<>5
       or exists(select 1 from public.cw_catalog c where c.id=any(_deck) and c.category in('gtlm','tt','f1','motogp')
                 and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id))
    then raise exception 'Select five unique catalog cards'; end if;
    -- The deck's dog tags, one per power (reroll, heal, boost). An app that
    -- doesn't send them plays the three standard tags.
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
    -- Out of time: an invitation nobody took is refunded; a battle goes to
    -- whoever had played this round, or else to whoever has more HP left.
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

      -- Both cards are in: settle the round.
      if m.move1 is not null and m.move2 is not null then
        c1 := m.d1[m.move1+1]; c2 := m.d2[m.move2+1];
        select vehicle, ratings into v1, rat1 from public.cw_catalog where id=c1;
        select vehicle, ratings into v2, rat2 from public.cw_catalog where id=c2;
        -- Lean (2) only comes up between two bikes.
        lean_ok := v1='bike' and v2='bike';
        cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
        if m.tag1 is not null then m.used1 := array_append(m.used1,m.tag1); end if;
        if m.tag2 is not null then m.used2 := array_append(m.used2,m.tag2); end if;
        -- Pit medic first, then Overdrive on the rating.
        if m.tag1=1 then m.hp1[m.move1+1] := least(100,m.hp1[m.move1+1]+public.cw_tag_value(1,m.tags1[2],v1)); end if;
        if m.tag2=1 then m.hp2[m.move2+1] := least(100,m.hp2[m.move2+1]+public.cw_tag_value(1,m.tags2[2],v2)); end if;
        if m.tag1=2 then b1 := public.cw_tag_value(2,m.tags1[3],v1)/100.0; end if;
        if m.tag2=2 then b2 := public.cw_tag_value(2,m.tags2[3],v2)/100.0; end if;
        s1 := round(rat1[cat]*public.cw_wear_mult(m.p1,c1,cat))*b1;
        s2 := round(rat2[cat]*public.cw_wear_mult(m.p2,c2,cat))*b2;
        if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
        -- Second chance: whoever armed it and lost gets the round again, once,
        -- in another category, with their tag's bonus on the rating.
        if (s1<s2 and m.tag1=0) or (s2<s1 and m.tag2=0) then
          if s1<s2 then r1 := public.cw_tag_value(0,m.tags1[1],v1)/100.0; else r2 := public.cw_tag_value(0,m.tags2[1],v2)/100.0; end if;
          first_cat := cat;
          loop
            cat := case when lean_ok then 1+floor(random()*5)::integer else (array[1,3,4,5])[1+floor(random()*4)::integer] end;
            exit when cat<>first_cat;
          end loop;
          s1 := round(rat1[cat]*public.cw_wear_mult(m.p1,c1,cat))*b1*r1;
          s2 := round(rat2[cat]*public.cw_wear_mult(m.p2,c2,cat))*b2*r2;
          if m.penalty=m.round and cat=2 then s1 := s1*.8; s2 := s2*.8; end if;
        end if;
        damage := case when s1=s2 then 0 else least(65,20+round(abs(s1-s2)*.7)::integer) end;
        if s1>s2 then m.hp2[m.move2+1] := greatest(0,m.hp2[m.move2+1]-damage);
        elsif s2>s1 then m.hp1[m.move1+1] := greatest(0,m.hp1[m.move1+1]-damage); end if;
        m.log := m.log || jsonb_build_array(jsonb_build_object(
          'round',m.round,'category',cat,'first',first_cat,'card1',c1,'card2',c2,'damage',damage,
          'winner',case when s1=s2 then null when s1>s2 then 1 else 2 end,
          's1',round(s1,1),'s2',round(s2,1),'t1',m.tag1,'t2',m.tag2));
        m.round := m.round+1; m.move1 := null; m.move2 := null; m.tag1 := null; m.tag2 := null; m.deadline := now()+interval '120 seconds';
        changed := true;
        -- A battle runs until one side has no card standing.
        if not exists(select 1 from unnest(m.hp1) x where x>0) or not exists(select 1 from unnest(m.hp2) x where x>0) then
          select sum(x) into h1 from unnest(m.hp1) x; select sum(x) into h2 from unnest(m.hp2) x;
          m.winner := case when h1=h2 then null when h1>h2 then m.p1 else m.p2 end; m.status := 'finished';
          perform public.cw_pay_out(m.p1,m.p2,m.winner,m.stake,m.d1,m.d2,m.log);
        -- Stalemate: every card left ties with every card it can meet (two copies
        -- of one card, usually) and both Overdrives are spent, so nobody can land
        -- a hit. A draw, rather than rounds without end.
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
      -- Each side's card condition, so the app shows the ratings being compared.
      'wear',(select coalesce(jsonb_agg(coalesce((select w.condition from public.cw_wear w where w.user_id=case when side=1 then m.p1 else m.p2 end and w.card_id=t.d),100) order by t.o),'[]'::jsonb) from unnest(case when side=1 then m.d1 else m.d2 end) with ordinality t(d,o)),
      'rivalWear',(select coalesce(jsonb_agg(coalesce((select w.condition from public.cw_wear w where w.user_id=case when side=1 then m.p2 else m.p1 end and w.card_id=t.d),100) order by t.o),'[]'::jsonb) from unnest(case when side=1 then m.d2 else m.d1 end) with ordinality t(d,o)),
      'balance',(select balance from public.cw_accounts where user_id=u));
  end if;
  return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
end $$;
revoke all on function public.cw_action(text,uuid,text[],integer,integer,integer,text[]) from public, anon;
grant execute on function public.cw_action(text,uuid,text[],integer,integer,integer,text[]) to authenticated;
comment on function public.cw_action(text,uuid,text[],integer,integer,integer,text[]) is 'Intentional authenticated SECURITY DEFINER: auth.uid membership validation, fixed search path, bounded inputs, authoritative catalog scores, serialized settlement. Guest identities are the established Blacktop account model; no unauthenticated execution.';

drop function if exists public.cw_cat_cost(text, boolean);