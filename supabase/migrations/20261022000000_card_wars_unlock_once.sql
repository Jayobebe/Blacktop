-- Card Wars: a one-time unlock for a test account. Needs 20261021000000_card_wars_redline.sql first.
--
-- One code, held here only as its SHA-256, works for the first account that
-- enters it and for nobody after. That account gets everything the vault has:
-- every catalogue card, the Wildcard with every Redline card, and every dog
-- tag (each of the four powers tied to each of the cards). The app's code box is hidden: it shows when
-- the deck page's Potential button is held for three seconds. (cw_unlock_open says whether the code is
-- still unused; the app no longer asks.)

create table if not exists public.cw_unlock_used(
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now());
alter table public.cw_unlock_used enable row level security;

create or replace function public.cw_unlock_open() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select auth.uid() is not null and not exists(select 1 from public.cw_unlock_used)
$$;

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

  return jsonb_build_object('ok', true) || public.cw_shop();
end $function$;

revoke all on function public.cw_unlock_open(), public.cw_unlock_all(text) from public, anon;
grant execute on function public.cw_unlock_open(), public.cw_unlock_all(text) to authenticated;
