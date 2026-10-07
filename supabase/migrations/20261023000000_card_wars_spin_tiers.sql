-- Card Wars: a spin's card depends on its tier, not just on being on the shelf.
--
-- When a spin lands a card, the tier is drawn first and then a card of that
-- tier. The tiers a shelf has are weighted by rank: the top one counts 1, the
-- next 2, and so on down, so the lowest tier on a shelf is the likeliest and
-- the highest the least (F1: Silver 40 %, Platinum 30 %, Diamond 20 %,
-- Obsidian 10 %; it was six in ten for an Obsidian). The same draw is used by
-- paid spins, free spins (among the cards not held yet) and the trade-up
-- wheel. Works with or without the Redline migration: the three functions are
-- patched in place.

-- A card's tier from its price, which follows its rating: Bronze 1 to Obsidian 6.
-- The app's frames use the same lines (lib/rules.ts, checked by cardwars:check).
create or replace function public.cw_card_tier(_price integer) returns integer
language sql immutable as $$
  select case when _price >= 350 then 6 when _price >= 210 then 5 when _price >= 125 then 4 when _price >= 80 then 3 when _price >= 50 then 2 else 1 end
$$;

-- One card from these shelves (only ones `_unowned_by` doesn't hold, when given): the tier by rank, then a card of it.
create or replace function public.cw_pick_card(_cats text[], _unowned_by uuid default null) returns text
language sql volatile security definer set search_path to 'public','pg_temp' as $$
  with pool as (
    select c.id, public.cw_card_tier(c.price) as t
    from public.cw_catalog c
    where c.category = any(_cats)
      and (_unowned_by is null or not exists(select 1 from public.cw_owned o where o.user_id = _unowned_by and o.card_id = c.id))),
  tiers as (select t, dense_rank() over (order by t desc) as w from (select distinct t from pool) d),
  pick as (select t from tiers order by -ln(greatest(random(), 1e-12)) / w limit 1)
  select id from pool where t = (select t from pick) order by random() limit 1
$$;
revoke all on function public.cw_pick_card(text[], uuid) from public, anon, authenticated;

-- The app's probe, and the lines it draws its odds from.
create or replace function public.cw_tier_rules() returns jsonb
language sql immutable as $$ select jsonb_build_object('from', jsonb_build_array(50, 80, 125, 210, 350), 'weight', 'rank') $$;
revoke all on function public.cw_tier_rules() from public, anon;
grant execute on function public.cw_tier_rules() to authenticated;

do $migration$
declare
  d text; n integer;
  spin text[][] := array[
    array[$a$select id into card from public.cw_catalog c where c.category=cat and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1;$a$,
          $b$card := public.cw_pick_card(array[cat], u);$b$],
    array[$a$select id into card from public.cw_catalog c where c.category in('road','race') and not exists(select 1 from public.cw_owned o where o.user_id=u and o.card_id=c.id) order by random() limit 1;$a$,
          $b$card := public.cw_pick_card(array['road','race'], u);$b$],
    array[$a$select id into card from public.cw_catalog where category=cat order by random() limit 1;$a$,
          $b$card := public.cw_pick_card(array[cat]);$b$]
  ];
  up text[] := array[$a$select id into card from public.cw_catalog where category=nxt order by random() limit 1;$a$, $b$card := public.cw_pick_card(array[nxt]);$b$];
begin
  select pg_get_functiondef('public.cw_spin(text,boolean)'::regprocedure) into d;
  if position('cw_pick_card' in d) = 0 then
    for i in 1..array_length(spin, 1) loop
      n := (length(d) - length(replace(d, spin[i][1], ''))) / length(spin[i][1]);
      if n <> 1 then raise exception 'cw_spin has changed: piece % found % times', i, n; end if;
      d := replace(d, spin[i][1], spin[i][2]);
    end loop;
    execute d;
  end if;
  select pg_get_functiondef('public.cw_trade_up(text[])'::regprocedure) into d;
  if position('cw_pick_card' in d) = 0 then
    n := (length(d) - length(replace(d, up[1], ''))) / length(up[1]);
    if n <> 1 then raise exception 'cw_trade_up has changed: the card pick found % times', n; end if;
    execute replace(d, up[1], up[2]);
  end if;
end $migration$;
