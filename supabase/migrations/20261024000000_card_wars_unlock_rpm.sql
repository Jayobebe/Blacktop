-- Card Wars: the owner's unlock code also fills the account's RPM.
--
-- Entering the code tops the balance up to 100,000 (shown in the app as
-- 1,000,000 RPM: it shows ten times what the server counts). It's a top-up to
-- that figure, not an addition, so entering the code again refills it and can
-- never pile it higher. Everything else about the code is as before: one
-- account, the first to have entered it.

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

  return jsonb_build_object('ok', true) || public.cw_shop();
end $function$;
