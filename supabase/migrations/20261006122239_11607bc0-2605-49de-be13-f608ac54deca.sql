-- Card Wars: shorter battles, a win streak on hard, a daily challenge, and the
-- Suter MMX 500 in the TT series.
--
-- Pace. A round's damage was min(65, 20 + 0.7 x gap), which made a battle
-- about 35 rounds. It is now min(80, 35 + 0.8 x gap): about 24 rounds, five a
-- card. A tailwind still adds 15, now up to 95. cw_action is patched in place
-- (each piece looked for sits on one line); a patch that no longer fits stops
-- the migration rather than guess. The app's own numbers are DAMAGE in
-- lib/rules.ts, switched by cw_pace_rules() (lib/serverCaps.ts, cardWarsPace).
--
-- Streak. Paid wins in a row on hard pay 2 RPM more each, up to 10 more; a
-- hard battle lost or drawn starts again. Only a battle that paid counts, so
-- the day's twenty still bound it.
--
-- Daily challenge. One quick play battle a day, the same theme and mode for
-- everyone (the app works both out from the date). Winning it pays 30 RPM,
-- once a day. The phone reports the win, as it reports every computer battle.
--
-- Catalogue. The TT shelf's 'striplett' is now the Suter MMX 500 (the id
-- stays, so whoever owns the card keeps it), and every rating and price is
-- re-issued from `npm run cardwars:balance`, as they move together.

alter table public.cw_accounts add column if not exists hard_streak integer not null default 0;
alter table public.cw_accounts add column if not exists daily_day date;

create or replace function public.cw_pace_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 1,
    'damage', jsonb_build_object('floor', 35, 'gap', 0.8, 'cap', 80),
    'streak', jsonb_build_object('step', 2, 'most', 10),
    'daily', 30)
$$;
revoke all on function public.cw_pace_rules() from public, anon;
grant execute on function public.cw_pace_rules() to authenticated;

do $migration$
declare
  d text;
  edits text[][] := array[
    array[$a$least(65,20+round(abs(s1-s2)*.7)::integer)$a$, $b$least(80,35+round(abs(s1-s2)*.8)::integer)$b$],
    array[$a$damage := least(80,damage+15);$a$, $b$damage := least(95,damage+15);$b$]
  ];
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position($a$least(80,35+round(abs(s1-s2)*.8)$a$ in d) = 0 then
    for i in 1..array_length(edits,1) loop
      if position(edits[i][1] in d) = 0 then raise exception 'cw_action has changed: edit % no longer fits', i; end if;
      d := replace(d, edits[i][1], edits[i][2]);
    end loop;
    execute d;
  end if;
end $migration$;

create or replace function public.cw_reward_battle(_result text, _level text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
    return r || jsonb_build_object('rpm', (r->>'rpm')::integer + extra, 'balance', a.balance, 'streak', streak, 'streakBonus', extra);
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
end $$;
revoke all on function public.cw_reward_battle(text,text) from public, anon;
grant execute on function public.cw_reward_battle(text,text) to authenticated;

-- The account's streak and whether today's challenge is still open.
create or replace function public.cw_daily_state() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'streak', coalesce((select hard_streak from public.cw_accounts where user_id=auth.uid()), 0),
    'dailyDone', coalesce((select daily_day = current_date from public.cw_accounts where user_id=auth.uid()), false))
$$;
revoke all on function public.cw_daily_state() from public, anon;
grant execute on function public.cw_daily_state() to authenticated;

create or replace function public.cw_daily_claim() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  select * into a from public.cw_accounts where user_id=u for update;
  if a.daily_day = current_date then
    return jsonb_build_object('rpm',0,'balance',a.balance);
  end if;
  update public.cw_accounts set balance = balance + 30, daily_day = current_date where user_id=u returning balance into a.balance;
  return jsonb_build_object('rpm',30,'balance',a.balance);
end $$;
revoke all on function public.cw_daily_claim() from public, anon;
grant execute on function public.cw_daily_claim() to authenticated;

insert into public.cw_catalog(id, vehicle, ratings, price, category) values
 ('911','car','{80,30,45,62,76}',75,'road'),('gt3r','car','{74,30,52,70,92}',190,'race'),('m3','car','{70,30,39,80,62}',60,'road'),
 ('m4gt3','car','{74,30,52,68,88}',140,'race'),('296gtb','car','{85,30,58,58,76}',120,'road'),('296gt3','car','{74,30,54,68,91}',180,'race'),
 ('750s','car','{85,30,57,55,75}',105,'road'),('720sgt3','car','{74,30,51,67,89}',145,'race'),('amggtbs','car','{83,30,54,57,74}',95,'road'),
 ('amggt3','car','{74,30,50,70,88}',140,'race'),('gryaris','car','{49,30,29,72,72}',40,'road'),('suprag4','car','{60,30,42,66,80}',55,'race'),
 ('civic','car','{65,30,32,76,70}',50,'road'),('nsxgt3','car','{70,30,50,68,87}',105,'race'),('mustangdh','car','{63,30,39,74,56}',45,'road'),
 ('rally','car','{38,30,33,64,90}',60,'race'),('mx5','car','{45,30,24,82,68}',45,'road'),('mx5cup','car','{42,30,24,60,84}',35,'race'),
 ('gti','car','{56,30,24,84,60}',50,'road'),('gtitcr','car','{56,30,38,58,82}',40,'race'),('mt07','bike','{42,50,48,72,60}',35,'road'),
 ('r6','bike','{61,79,66,40,90}',100,'race'),('ninja','bike','{34,53,37,70,70}',30,'road'),('zx10rr','bike','{81,92,84,36,89}',205,'race'),
 ('sv650','bike','{42,46,47,78,58}',40,'road'),('gsxr','bike','{76,86,80,36,86}',120,'race'),('fireblade','bike','{74,73,77,46,74}',80,'road'),
 ('firebladesbk','bike','{81,92,84,34,91}',220,'race'),('panigale','bike','{74,73,78,44,76}',90,'road'),('v4rsbk','bike','{83,96,85,34,93}',275,'race'),
 ('gs','bike','{45,36,57,92,48}',60,'road'),('s1000','bike','{81,92,83,38,88}',195,'race'),('rs660f','bike','{49,63,57,64,72}',50,'road'),
 ('rs660','bike','{52,79,62,42,90}',90,'race'),('890duke','bike','{52,60,62,62,72}',50,'road'),('rc8c','bike','{60,83,72,38,92}',110,'race'),
 ('striple','bike','{56,60,64,64,74}',60,'road'),('moto2','bike','{72,89,70,36,90}',110,'race'),('f3rr','bike','{63,66,70,52,74}',60,'road'),
 ('f3ss','bike','{68,83,72,38,88}',95,'race'),('c8r','car','{74,30,48,84,88}',165,'gtlm'),('c7r','car','{73,30,48,82,86}',125,'gtlm'),
 ('rsr19','car','{74,30,49,78,93}',210,'gtlm'),('rsr17','car','{73,30,49,80,90}',165,'gtlm'),('488gte','car','{74,30,49,78,91}',190,'gtlm'),
 ('m8gte','car','{74,30,49,80,85}',140,'gtlm'),('m6gtlm','car','{73,30,48,76,84}',100,'gtlm'),('fordgt','car','{76,30,48,80,90}',190,'gtlm'),
 ('vantagegte','car','{74,30,49,82,88}',170,'gtlm'),('lexusrcf','car','{72,30,47,76,84}',90,'gtlm'),('rb19','car','{92,30,81,40,99}',415,'f1'),
 ('w11','car','{92,30,83,40,99}',465,'f1'),('f2004','car','{99,30,86,38,96}',475,'f1'),('mp44','car','{85,30,80,34,88}',155,'f1'),
 ('fw14b','car','{88,30,87,36,94}',350,'f1'),('w07','car','{94,30,83,40,95}',415,'f1'),('rb9','car','{85,30,79,38,95}',260,'f1'),
 ('lotus79','car','{70,30,70,32,86}',65,'f1'),('mcl38','car','{92,30,81,40,98}',405,'f1'),('bgp001','car','{85,30,81,38,93}',260,'f1'),
 ('m1000tt','bike','{85,79,83,64,86}',265,'tt'),('firebladett','bike','{83,76,82,62,85}',200,'tt'),('zx10tt','bike','{81,76,82,62,84}',180,'tt'),
 ('gsxrtt','bike','{79,76,81,63,83}',160,'tt'),('r1tt','bike','{79,76,80,60,85}',155,'tt'),('norton','bike','{81,73,82,60,82}',155,'tt'),
 ('shinden','bike','{63,66,62,24,76}',40,'tt'),('rc30','bike','{56,60,60,58,78}',55,'tt'),('ow01','bike','{58,60,62,58,78}',60,'tt'),
 ('striplett','bike','{77,92,87,30,92}',205,'tt'),('gp23','bike','{98,99,93,30,96}',465,'motogp'),('rc213v','bike','{92,99,89,30,97}',420,'motogp'),
 ('m1_15','bike','{92,99,87,32,98}',435,'motogp'),('gsxrr','bike','{90,99,87,32,97}',410,'motogp'),('rc16','bike','{95,99,91,29,95}',410,'motogp'),
 ('rsgp','bike','{95,99,91,32,96}',475,'motogp'),('rc211v','bike','{86,92,89,30,94}',315,'motogp'),('gp7','bike','{85,92,87,30,90}',230,'motogp'),
 ('m1_04','bike','{85,92,89,30,95}',310,'motogp'),('nsr500','bike','{81,86,85,28,93}',195,'motogp')
on conflict (id) do update set vehicle=excluded.vehicle, ratings=excluded.ratings, price=excluded.price, category=excluded.category;