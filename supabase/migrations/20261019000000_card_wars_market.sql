-- Card Wars: the economy closed to second accounts.
--
-- What was open: RPM could change hands (card sales by code, RPM in swaps, and
-- a player battle lost on purpose), so the RPM every new account starts with
-- could be gathered into one; and a paid spin that landed on a card already
-- owned paid 75 % of that card's price for a spin costing a fifth of the
-- shelf's average, so spins paid for themselves once a shelf was owned.
--
-- What this brings:
--   * RPM never leaves an account. Card sales by code are closed (open ones are
--     cancelled and every held offer refunded); a swap is cards only, one for
--     one, each for a card of the same tier, so a second account can't give
--     more than it gets.
--   * Copies: up to five of a card (cw_owned.copies). A card won or spun that's
--     already held is another copy; with five, it pays 25 % of its price (a
--     prize pays 10 as before). Two of the same card at most in a deck.
--   * Trade-up: five cards of one tier for a spin: a card of the next tier up
--     (25 %), a dog tag (20 %), a spin on that shelf (15 %) or RPM (40 %). The
--     top tier has no card to win, so its shares go 35 / 20 / 45.
--   * Blacktop Marketplace: sell a card to the house on a coin flip, 10 % or
--     50 % of its price, three sales a day.
--   * A player battle's winnings from the same rival count once a day; after
--     that both stakes go back.
--
-- Nothing anyone holds is taken away. cw_market_rules() is the app's probe.

-- ── Copies ────────────────────────────────────────────────────────────────
alter table public.cw_owned add column if not exists copies integer not null default 1;
do $$ begin
  alter table public.cw_owned add constraint cw_owned_copies_range check (copies between 1 and 5);
exception when duplicate_object then null; end $$;

alter table public.cw_accounts add column if not exists market_day date;
alter table public.cw_accounts add column if not exists market_count integer not null default 0;

-- Who has already paid whom today (a battle's winnings from one rival count once a day).
create table if not exists public.cw_stake_wins (
  winner uuid not null references auth.users(id) on delete cascade,
  loser uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  primary key (winner, loser, day)
);
grant all on public.cw_stake_wins to service_role;
alter table public.cw_stake_wins enable row level security;

create or replace function public.cw_market_rules() returns jsonb
language sql stable set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'copies', 5, 'deckCopies', 2, 'duplicate', 25,
    'market', jsonb_build_object('low', 10, 'high', 50, 'daily', 3, 'keep', 5),
    'tradeUp', jsonb_build_object('cards', 5, 'card', 25, 'tag', 20, 'spin', 15, 'rpm', 40, 'topTag', 35, 'topSpin', 20, 'topRpm', 45, 'keep', 5))
$$;
revoke all on function public.cw_market_rules() from public, anon;
grant execute on function public.cw_market_rules() to authenticated;

-- One more of a card: a first copy, or another up to five. False when five are held already.
create or replace function public.cw_grant_card(_u uuid, _card text) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare n integer;
begin
  select copies into n from public.cw_owned where user_id=_u and card_id=_card for update;
  if not found then insert into public.cw_owned(user_id,card_id) values(_u,_card); return true; end if;
  if n >= 5 then return false; end if;
  update public.cw_owned set copies=copies+1 where user_id=_u and card_id=_card;
  return true;
end $$;

-- One fewer: the last copy takes the card's wear with it. False when none is held.
create or replace function public.cw_take_card(_u uuid, _card text) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare n integer;
begin
  select copies into n from public.cw_owned where user_id=_u and card_id=_card for update;
  if not found then return false; end if;
  if n > 1 then update public.cw_owned set copies=copies-1 where user_id=_u and card_id=_card;
  else
    delete from public.cw_owned where user_id=_u and card_id=_card;
    delete from public.cw_wear where user_id=_u and card_id=_card;
  end if;
  return true;
end $$;
revoke all on function public.cw_grant_card(uuid,text) from public, anon, authenticated;
revoke all on function public.cw_take_card(uuid,text) from public, anon, authenticated;

-- How many cards a player holds, copies counted.
create or replace function public.cw_card_count(_u uuid) returns integer
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(sum(copies),0)::integer from public.cw_owned where user_id=_u
$$;
revoke all on function public.cw_card_count(uuid) from public, anon, authenticated;

-- ── What the shop answers: copies, and the day's Marketplace sales left ──────
create or replace function public.cw_shop() returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype;
begin
  if u is not null then perform public.cw_daily_topup(u); end if;
  select * into a from public.cw_accounts where user_id=u;
  return jsonb_build_object(
    'balance', coalesce(a.balance, 60),
    'freeSpins', coalesce(a.free_spins, 5),
    'freeTagSpins', coalesce(a.free_tag_spins, 4),
    'owned', coalesce((select jsonb_agg(card_id) from public.cw_owned where user_id=u), '[]'::jsonb),
    'copies', coalesce((select jsonb_object_agg(card_id, copies) from public.cw_owned where user_id=u and copies>1), '{}'::jsonb),
    'marketLeft', greatest(0, 3 - case when a.market_day = current_date then a.market_count else 0 end),
    'spins', coalesce((select jsonb_object_agg(category, count) from public.cw_spins where user_id=u and count>0), '{}'::jsonb),
    'tags', coalesce((select jsonb_agg(power || ':' || card_id order by won_at, power, card_id) from public.cw_tags where user_id=u), '[]'::jsonb),
    'rewardsLeft', greatest(0, 20 - case when a.reward_day = current_date then a.reward_count else 0 end),
    'firstWin', a.first_win_day is distinct from current_date);
end $function$;

-- ── Buying: another copy can be bought too ───────────────────────────────────
create or replace function public.cw_buy(_card text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); p integer; b integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select price into p from public.cw_catalog where id=_card and category is not null;
  if p is null or p<=0 then raise exception 'Card not for sale'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select balance into b from public.cw_accounts where user_id=u for update;
  if coalesce((select copies from public.cw_owned where user_id=u and card_id=_card),0) >= 5 then raise exception 'Already owned'; end if;
  if b<p then raise exception 'Not enough RPM'; end if;
  update public.cw_accounts set balance=balance-p where user_id=u returning balance into b;
  perform public.cw_grant_card(u,_card);
  return jsonb_build_object('balance',b,'card',_card);
end $function$;

-- ── Spins: a card already held is another copy; with five, 25 % of its price ──
create or replace function public.cw_spin(_cat text, _free boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
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
  return jsonb_build_object('kind',kind,'card',card,'tag',won,'category',cat,'rpm',amount,'spins',extra) || public.cw_shop();
end $function$;

-- ── Prizes: a card already held is another copy; with five, 10 RPM as before ──
create or replace function public.cw_claim_prize(_card text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; kind text; amount integer := 0; cat text; cost integer; best integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into a from public.cw_accounts where user_id=u for update;
  if not found or not a.prize_due then raise exception 'No prize due'; end if;
  select c.category, c.price into cat, cost from public.cw_catalog c where c.id=_card and c.category is not null;
  if cat is null then raise exception 'Not a prize card'; end if;
  if cat not in('road','race') then
    select coalesce(max(c.price),0) into best from public.cw_owned o join public.cw_catalog c on c.id=o.card_id where o.user_id=u;
    if cost > 2*best then raise exception 'Not a prize card'; end if;
  end if;
  if public.cw_grant_card(u,_card) then
    kind := 'card';
    update public.cw_accounts set prize_due=false where user_id=u;
  else
    kind := 'duplicate'; amount := 10;
    update public.cw_accounts set balance=balance+amount, prize_due=false where user_id=u;
  end if;
  return jsonb_build_object('kind',kind,'card',_card,'rpm',amount) || public.cw_shop();
end $function$;

-- ── Card sales by code: closed ───────────────────────────────────────────────
-- Cancelling a listing refunds every offer held on it (cw_trade_refund_on_close).
update public.cw_trades set status='cancelled' where status='open';

create or replace function public.cw_trade_list(_card text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  raise exception 'Card sales have closed';
end $function$;

create or replace function public.cw_trade_offer(_code text, _rpm integer) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  raise exception 'Card sales have closed';
end $function$;

-- ── Swaps: cards only, one for one, tier for tier ────────────────────────────
update public.cw_swaps set a_rpm=0, b_rpm=0, a_ready=false, b_ready=false where status='open' and (a_rpm<>0 or b_rpm<>0);

create or replace function public.cw_swap_set(_swap uuid, _cards text[], _rpm integer) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype; me smallint;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into s from public.cw_swaps where id=_swap for update;
  if not found or u not in (s.a, coalesce(s.b,s.a)) or s.status<>'open' or s.expires_at<now() then raise exception 'Swap not found'; end if;
  me := case when u=s.a then 1 else 2 end;
  _cards := coalesce(_cards,'{}');
  if coalesce(_rpm,0)<>0 then raise exception 'Swaps are cards only'; end if;
  if cardinality(_cards)>5 or (select count(distinct x) from unnest(_cards) x)<>cardinality(_cards) then raise exception 'Up to five cards'; end if;
  if exists(select 1 from unnest(_cards) x where not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=x)) then raise exception 'Card not owned'; end if;
  delete from public.cw_swap_items where swap_id=s.id and side=me;
  insert into public.cw_swap_items(swap_id,side,card_id) select s.id,me,x from unnest(_cards) x;
  update public.cw_swaps set a_ready=false,b_ready=false,a_rpm=0,b_rpm=0,
    expires_at=greatest(expires_at, now()+interval '10 minutes') where id=s.id;
  return public.cw_swap_view(s.id);
end $function$;

create or replace function public.cw_swap_ready(_swap uuid, _ready boolean) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); s public.cw_swaps%rowtype; me smallint; i record;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into s from public.cw_swaps where id=_swap for update;
  if not found or u not in (s.a, coalesce(s.b,s.a)) or s.status<>'open' or s.expires_at<now() then raise exception 'Swap not found'; end if;
  me := case when u=s.a then 1 else 2 end;
  if me=1 then s.a_ready := coalesce(_ready,false); else s.b_ready := coalesce(_ready,false); end if;
  update public.cw_swaps set a_ready=s.a_ready, b_ready=s.b_ready where id=s.id;
  if s.a_ready and s.b_ready and s.b is not null then
    if not exists(select 1 from public.cw_swap_items where swap_id=s.id) then raise exception 'Nothing to swap'; end if;
    -- One for one, each for a card of the same tier: the tiers on one side are the tiers on the other.
    if exists(
      select 1 from (
        select c.category, count(*) filter (where i2.side=1) a, count(*) filter (where i2.side=2) b
        from public.cw_swap_items i2 join public.cw_catalog c on c.id=i2.card_id where i2.swap_id=s.id group by c.category) t
      where t.a<>t.b or t.category is null)
    then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Swap card for card of the same tier'; end if;
    insert into public.cw_accounts(user_id) values(s.a),(s.b) on conflict do nothing;
    perform 1 from public.cw_accounts where user_id in (s.a,s.b) order by user_id for update;
    if exists(select 1 from public.cw_accounts where user_id in (s.a,s.b) and active_code is not null) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Finish your current battle first'; end if;
    if exists(select 1 from public.cw_swap_items i2 where i2.swap_id=s.id and not exists(select 1 from public.cw_owned o where o.user_id=case when i2.side=1 then s.a else s.b end and o.card_id=i2.card_id)) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Card not owned'; end if;
    -- Nobody is handed a sixth copy.
    if exists(select 1 from public.cw_swap_items i2 where i2.swap_id=s.id
        and coalesce((select o.copies from public.cw_owned o where o.user_id=case when i2.side=1 then s.b else s.a end and o.card_id=i2.card_id),0)
          - (select count(*) from public.cw_swap_items j where j.swap_id=s.id and j.side<>i2.side and j.card_id=i2.card_id) >= 5) then
      update public.cw_swaps set a_ready=false,b_ready=false where id=s.id; raise exception 'Already owned'; end if;
    for i in select side, card_id from public.cw_swap_items where swap_id=s.id order by side, card_id loop
      perform public.cw_take_card(case when i.side=1 then s.a else s.b end, i.card_id);
    end loop;
    for i in select side, card_id from public.cw_swap_items where swap_id=s.id order by side, card_id loop
      perform public.cw_grant_card(case when i.side=1 then s.b else s.a end, i.card_id);
    end loop;
    update public.cw_swaps set status='done' where id=s.id;
  end if;
  return public.cw_swap_view(s.id);
end $function$;

-- ── Trade-up ────────────────────────────────────────────────────────────────
create or replace function public.cw_trade_up(_cards text[]) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; cat text; nxt text; cars integer; r double precision;
  kind text; card text; won text; amount integer := 0; extra integer := 0; avg_price integer; pw text; tied text; x text; top boolean; t_tag double precision; t_spin double precision;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _cards is null or cardinality(_cards)<>5 then raise exception 'Five cards to trade up'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if a.active_code is not null then raise exception 'Finish your current battle first'; end if;
  if (select count(distinct c.category) from unnest(_cards) t(id) join public.cw_catalog c on c.id=t.id where c.category is not null)<>1
     or (select count(*) from unnest(_cards) t(id) join public.cw_catalog c on c.id=t.id where c.category is not null)<>5
  then raise exception 'Five cards of one tier'; end if;
  -- Each named as many times as it's given, and held at least that many times.
  if exists(select 1 from (select t.id, count(*) n from unnest(_cards) t(id) group by t.id) g
            where coalesce((select o.copies from public.cw_owned o where o.user_id=u and o.card_id=g.id),0) < g.n)
  then raise exception 'Card not owned'; end if;
  if public.cw_card_count(u) - 5 < 5 then raise exception 'Keep five cards for a deck'; end if;
  select c.category, round(avg(c.price))::integer, count(*) filter (where c.vehicle='car')
    into cat, avg_price, cars from unnest(_cards) t(id) join public.cw_catalog c on c.id=t.id group by c.category;
  nxt := case cat when 'road' then 'race' when 'race' then (case when cars>=3 then 'gtlm' else 'tt' end) when 'gtlm' then 'f1' when 'tt' then 'motogp' end;
  top := nxt is null;
  -- Where the dog tag and the spin end on the wheel (the top tier has no card on it).
  if top then t_tag := .35; t_spin := .55; else t_tag := .45; t_spin := .60; end if;
  foreach x in array _cards loop perform public.cw_take_card(u, x); end loop;
  r := random();
  if not top and r < .25 then
    select id into card from public.cw_catalog where category=nxt order by random() limit 1;
    if public.cw_grant_card(u, card) then kind := 'card';
    else
      kind := 'duplicate';
      amount := greatest(1, round((select price from public.cw_catalog where id=card)*0.25)::integer);
      update public.cw_accounts set balance=balance+amount where user_id=u;
    end if;
  elsif r < t_tag then
    pw := (array['reroll','heal','boost','flip'])[1+floor(random()*4)::integer];
    select id into tied from public.cw_catalog where category=cat order by random() limit 1;
    won := pw || ':' || tied;
    if exists(select 1 from public.cw_tags t where t.user_id=u and t.power=pw and t.card_id=tied) then
      kind := 'duplicate'; won := null; amount := greatest(1, avg_price/4); update public.cw_accounts set balance=balance+amount where user_id=u;
    else
      insert into public.cw_tags(user_id,power,card_id) values(u,pw,tied); kind := 'tag';
    end if;
  elsif r < t_spin then
    kind := 'spins'; extra := 1;
    insert into public.cw_spins(user_id,category,count) values(u,cat,extra) on conflict(user_id,category) do update set count=public.cw_spins.count+extra;
  else
    -- Between 30 % and 90 % of one of the five cards' price.
    kind := 'rpm'; amount := greatest(1, round(avg_price*(.3+random()*.6))::integer);
    update public.cw_accounts set balance=balance+amount where user_id=u;
  end if;
  return jsonb_build_object('kind',kind,'card',card,'tag',won,'category',coalesce(nxt,cat),'from',cat,'rpm',amount,'spins',extra) || public.cw_shop();
end $function$;
revoke all on function public.cw_trade_up(text[]) from public, anon;
grant execute on function public.cw_trade_up(text[]) to authenticated;

-- ── Blacktop Marketplace ────────────────────────────────────────────────────
create or replace function public.cw_market_sell(_card text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; p integer; heads boolean; amount integer; sold integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if a.active_code is not null then raise exception 'Finish your current battle first'; end if;
  select price into p from public.cw_catalog where id=_card and category is not null;
  if p is null or p<=0 then raise exception 'Card not for sale'; end if;
  if not exists(select 1 from public.cw_owned where user_id=u and card_id=_card) then raise exception 'Card not owned'; end if;
  sold := case when a.market_day = current_date then a.market_count else 0 end;
  if sold >= 3 then raise exception 'Marketplace closed for today'; end if;
  if public.cw_card_count(u) - 1 < 5 then raise exception 'Keep five cards for a deck'; end if;
  heads := random() < .5;
  amount := greatest(1, round(p * case when heads then .5 else .1 end)::integer);
  perform public.cw_take_card(u,_card);
  update public.cw_accounts set balance=balance+amount, market_day=current_date, market_count=sold+1 where user_id=u;
  return jsonb_build_object('heads',heads,'rpm',amount,'card',_card) || public.cw_shop();
end $function$;
revoke all on function public.cw_market_sell(text) from public, anon;
grant execute on function public.cw_market_sell(text) to authenticated;

-- ── Player battles ──────────────────────────────────────────────────────────
-- Winnings from the same rival count once a day: after that both stakes go back,
-- so a second account can't be beaten over and over to move RPM across.
create or replace function public.cw_pay_out(_p1 uuid, _p2 uuid, _winner uuid, _stake integer, _d1 text[], _d2 text[], _log jsonb) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare loser uuid; paid boolean := true;
begin
  perform public.cw_apply_wear(_p1,_p2,_d1,_d2,_log);
  if _winner is not null then
    loser := case when _winner=_p1 then _p2 else _p1 end;
    insert into public.cw_stake_wins(winner,loser) values(_winner,loser) on conflict do nothing;
    paid := found;
  end if;
  update public.cw_accounts set
    balance = balance + case
      when _winner is null or not paid then _stake
      when user_id = _winner then case when _stake = 10 then 70 else _stake*2 - ceil(_stake*0.2)::integer end
      else 0 end,
    active_code = null
  where user_id in (_p1,_p2);
  delete from public.cw_stake_wins where day < current_date - 7;
end $function$;

-- A deck may carry a card twice (never three times), and a second copy has to be held.
do $migration$
declare
  d text;
  -- Matched whatever the line ending between the two lines is.
  old text := $a$or \(select count\(distinct x\) from unnest\(_deck\) x\)<>5\s+or \(select count\(\*\) from public\.cw_catalog where id=any\(_deck\)\)<>5$a$;
  new text := $b$or exists(select 1 from unnest(_deck) x group by x having count(*)>2)
       or exists(select 1 from (select x, count(*) n from unnest(_deck) x group by x having count(*)>1) g
                 where coalesce((select o.copies from public.cw_owned o where o.user_id=u and o.card_id=g.x),0) < g.n)
       or (select count(*) from unnest(_deck) x join public.cw_catalog c on c.id=x)<>5$b$;
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position($c$group by x having count(*)>2$c$ in d) = 0 then
    if d !~ old then raise exception 'cw_action has changed: the deck check no longer fits'; end if;
    d := regexp_replace(d, old, new);
    execute d;
  end if;
end $migration$;
