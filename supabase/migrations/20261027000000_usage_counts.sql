-- Anonymous usage counts: is Blacktop being used, and do people come back?
--
-- One row a day for each thing counted and each kind of device, holding a
-- number and nothing else: no account, no place, no vehicle. The app adds one
--   when it's opened (once a day a device), under how long ago that device
--     was first set up: open_new (today), open_week (1 to 6 days ago),
--     open_month (7 to 29) or open_old (30 or more). The phone works that out
--     from the date on its own profile; the server never learns which rider;
--   when a ride starts (ride, or ride_convoy with others) and when one that
--     lasted two minutes or more ends (ride_done).
-- Demo mode counts nothing.
--
-- To read it (SQL editor):
--   select * from public.usage_by_day order by day desc limit 30;

create table if not exists public.usage_daily(
  day date not null default ((now() at time zone 'utc')::date),
  event text not null,
  platform text not null,
  n integer not null default 0,
  primary key (day, event, platform));
alter table public.usage_daily enable row level security;
-- No policies: only the function below writes, and only the owner reads (SQL editor).
revoke all on public.usage_daily from public, anon, authenticated;

create or replace function public.usage_count(_event text, _platform text) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  if auth.uid() is null then return; end if;
  if _event is null or _event not in ('open_new','open_week','open_month','open_old','ride','ride_convoy','ride_done') then return; end if;
  if _platform is null or _platform not in ('web','pwa','ios','android','nimiq') then return; end if;
  -- Bounded per account an hour, so nobody can run the numbers up. (The limiter's own row is the account's
  -- last call, as for every rate-limited function; it isn't joined to anything here and goes with Burn.)
  if not public.check_rate_limit('usage', 40, 3600) then return; end if;
  insert into public.usage_daily(day, event, platform, n) values((now() at time zone 'utc')::date, _event, _platform, 1)
  on conflict (day, event, platform) do update set n = public.usage_daily.n + 1;
end $function$;
revoke all on function public.usage_count(text, text) from public, anon;
grant execute on function public.usage_count(text, text) to authenticated;

-- A day a row: devices that opened the app (and how many of them were first set up a week or more ago:
-- the ones who came back), rides started and finished.
create or replace view public.usage_by_day as
select day,
  coalesce(sum(n) filter (where event like 'open_%'), 0)::integer as opened,
  coalesce(sum(n) filter (where event = 'open_new'), 0)::integer as new_today,
  coalesce(sum(n) filter (where event = 'open_week'), 0)::integer as first_week,
  coalesce(sum(n) filter (where event in ('open_month','open_old')), 0)::integer as came_back,
  coalesce(sum(n) filter (where event in ('ride','ride_convoy')), 0)::integer as rides_started,
  coalesce(sum(n) filter (where event = 'ride_convoy'), 0)::integer as convoy_rides,
  coalesce(sum(n) filter (where event = 'ride_done'), 0)::integer as rides_finished,
  coalesce(sum(n) filter (where event like 'open_%' and platform in ('ios','android')), 0)::integer as opened_in_app
from public.usage_daily group by day;
revoke all on public.usage_by_day from public, anon, authenticated;
