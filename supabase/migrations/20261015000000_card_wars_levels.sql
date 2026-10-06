-- Card Wars: difficulty levels against the computer.
--
-- A battle against the computer is now played at a level, and pays by it:
--   easy    practice: no RPM, no prize card, and it doesn't count against the
--           day's paid battles;
--   medium  half the RPM (8 / 4 / 3 for a win / draw / loss), no first-win
--           bonus, no prize card;
--   hard    everything, as cw_reward_offline pays: 15 / 8 / 5, the day's first
--           win 20 more, and a win picks a prize card. Quick play is hard.
-- Twenty paid battles a day, thirty seconds apart, across medium and hard
-- together. The phone reports the level with the result, as it reports the
-- result itself, so the daily cap is still what bounds a forged one.
-- cw_reward_offline stays for apps that haven't updated. The app reads
-- cw_level_rules() to know this is live (lib/serverCaps.ts, cardWarsLevels);
-- its own numbers are LEVEL in lib/rules.ts.

create or replace function public.cw_level_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 1,
    'easy', jsonb_build_object('pay', 0, 'prize', false),
    'medium', jsonb_build_object('pay', 0.5, 'prize', false),
    'hard', jsonb_build_object('pay', 1, 'prize', true))
$$;
revoke all on function public.cw_level_rules() from public, anon;
grant execute on function public.cw_level_rules() to authenticated;

create or replace function public.cw_reward_battle(_result text, _level text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; amount integer; bonus integer := 0; used integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _result is null or _result not in('win','draw','loss') then raise exception 'Invalid result'; end if;
  if _level is null or _level not in('easy','medium','hard') then raise exception 'Invalid level'; end if;
  if _level = 'hard' then return public.cw_reward_offline(_result); end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  perform public.cw_daily_topup(u);
  select * into a from public.cw_accounts where user_id=u for update;
  used := case when a.reward_day = current_date then a.reward_count else 0 end;
  if _level = 'easy' or a.last_offline_reward > now() - interval '30 seconds' or used >= 20 then
    return jsonb_build_object('rpm',0,'bonus',0,'balance',a.balance,'left',greatest(0,20-used));
  end if;
  amount := case _result when 'win' then 8 when 'draw' then 4 else 3 end;
  update public.cw_accounts set
    balance = balance + amount,
    last_offline_reward = now(),
    reward_day = current_date,
    reward_count = used + 1
  where user_id=u returning balance into a.balance;
  return jsonb_build_object('rpm',amount,'bonus',bonus,'balance',a.balance,'left',20-used-1);
end $$;
revoke all on function public.cw_reward_battle(text,text) from public, anon;
grant execute on function public.cw_reward_battle(text,text) to authenticated;
