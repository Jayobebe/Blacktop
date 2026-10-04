create or replace function public.cw_wear_offline(_deck text[], _fought text[]) returns table(card_id text, condition integer) language plpgsql security definer set search_path=public as $$
declare u uuid := auth.uid(); card text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _deck is null or cardinality(_deck) <> 5 or (select count(distinct x) from unnest(_deck) x) <> 5 then raise exception 'Deck needs five unique cards'; end if;
  if _fought is null or cardinality(_fought) < 1 or not (_fought <@ _deck) then raise exception 'Invalid battle'; end if;
  if not public.check_rate_limit(u, 'cw_wear_offline', 1, 90) then raise exception 'Too many battles'; end if;
  foreach card in array _deck loop
    insert into public.cw_wear(user_id, card_id, condition)
    values(u, left(card, 120), case when card = any(_fought) then 100 - case when public.cw_is_race(card) then 15 else 8 end else 100 end)
    on conflict (user_id, card_id) do update set condition = case when card = any(_fought)
      then greatest(0, cw_wear.condition - case when public.cw_is_race(card) then 15 else 8 end)
      else least(100, cw_wear.condition + 10) end;
  end loop;
  return query select w.card_id, w.condition from public.cw_wear w where w.user_id = u;
end $$;
revoke all on function public.cw_wear_offline(text[], text[]) from public, anon;
grant execute on function public.cw_wear_offline(text[], text[]) to authenticated;