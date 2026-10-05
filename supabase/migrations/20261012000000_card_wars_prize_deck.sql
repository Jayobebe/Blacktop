-- Card Wars: the prize for beating the computer is one of the computer's own
-- five cards, whatever shelf they're from.
--
-- Until now a shop-only card (GTLM, TT, F1, MotoGP) in the computer's deck was
-- swapped for a Road or Race card on the prize table, so the prizes didn't
-- match the deck just beaten. Now they do. The battle is settled on the phone,
-- so one thing bounds a forged claim: a shop-only prize may cost at most twice
-- the dearest card the rider already owns (the computer's deck is matched to
-- theirs, so an honest prize is always in reach; the app applies the same rule
-- to the table it shows). The app reads cw_prize_rules() to know this is live
-- (lib/serverCaps.ts, cardWarsPrizes).

create or replace function public.cw_prize_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 2, 'reach', 2)
$$;
revoke all on function public.cw_prize_rules() from public, anon;
grant execute on function public.cw_prize_rules() to authenticated;

create or replace function public.cw_claim_prize(_card text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
