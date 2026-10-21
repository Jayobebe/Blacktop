-- Fuel and charging prices, reported by riders who opt in (the Garage ledger's
-- "Help map fuel prices"), shown to everyone on the map's station cards and in
-- fuel searches.
--
-- A report is the station's map id (OpenStreetMap, "op:<id>"), the fuel type,
-- the price per litre or kWh, its currency and its country, and when: no
-- account, no route, no vehicle, no amount bought. The account is used only to
-- bound how many reports it can make (the rate limiter's own row, as for every
-- limited function), never stored with them.
--
-- A station's price is read from the last 14 days: with two reports or more, the
-- range from the cheapest quarter to the dearest quarter (so one odd report
-- can't mislead); with one, that price. Reports go after 60 days.
--
-- Safe to run twice.

create table if not exists public.fuel_price_reports(
  id bigserial primary key,
  station_id text not null check (station_id ~ '^op:[0-9]{1,15}$'),
  fuel text not null check (fuel in ('unleaded','super','diesel','premium_diesel','lpg','ac','dc')),
  price numeric(12,4) not null check (price > 0 and price < 100000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  reported_at timestamptz not null default now());
create index if not exists fuel_price_reports_station on public.fuel_price_reports(station_id, fuel, reported_at desc);
create index if not exists fuel_price_reports_market on public.fuel_price_reports(currency, fuel, reported_at desc);
alter table public.fuel_price_reports enable row level security;
-- No policies: only the functions below read and write.
revoke all on public.fuel_price_reports from public, anon, authenticated;

create or replace function public.report_fuel_price(_station_id text, _fuel text, _price numeric, _currency text, _country text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  market_mid numeric;
  market_n integer;
begin
  if auth.uid() is null then return 'no_session'; end if;
  if _station_id is null or _station_id !~ '^op:[0-9]{1,15}$' then return 'bad_station'; end if;
  if _fuel is null or _fuel not in ('unleaded','super','diesel','premium_diesel','lpg','ac','dc') then return 'bad_fuel'; end if;
  if _currency is null or _currency !~ '^[A-Z]{3}$' then return 'bad_currency'; end if;
  if _country is not null and _country !~ '^[A-Z]{2}$' then _country := null; end if;
  if _price is null or _price <= 0 or _price >= 100000 then return 'bad_price'; end if;
  -- A dozen a day an account: more than anyone fills up.
  if not public.check_rate_limit('fuel_price', 12, 86400) then return 'limited'; end if;
  -- Far outside what this fuel costs in this currency lately (with enough reports to know): refused.
  select percentile_cont(0.5) within group (order by price), count(*)
    into market_mid, market_n
    from public.fuel_price_reports
    where currency = _currency and fuel = _fuel and reported_at > now() - interval '30 days';
  if market_n >= 5 and (_price < market_mid * 0.5 or _price > market_mid * 2) then return 'out_of_range'; end if;
  insert into public.fuel_price_reports(station_id, fuel, price, currency, country) values (_station_id, _fuel, round(_price, 4), _currency, _country);
  return 'ok';
end $function$;
revoke all on function public.report_fuel_price(text, text, numeric, text, text) from public, anon;
grant execute on function public.report_fuel_price(text, text, numeric, text, text) to authenticated;

-- Prices for the stations asked about (at most 60), each fuel's range from the last 14 days.
create or replace function public.fuel_prices_for(_ids text[])
returns table(station_id text, fuel text, currency text, low numeric, high numeric, n integer, latest timestamptz)
language sql stable security definer set search_path to 'public','pg_temp' as $function$
  select r.station_id, r.fuel, r.currency,
    round(case when count(*) >= 2 then percentile_cont(0.25) within group (order by r.price) else min(r.price) end::numeric, 4) as low,
    round(case when count(*) >= 2 then percentile_cont(0.75) within group (order by r.price) else min(r.price) end::numeric, 4) as high,
    count(*)::integer as n,
    max(r.reported_at) as latest
  from public.fuel_price_reports r
  where r.station_id = any(coalesce(_ids[1:60], '{}'::text[]))
    and r.reported_at > now() - interval '14 days'
  group by r.station_id, r.fuel, r.currency
$function$;
revoke all on function public.fuel_prices_for(text[]) from public, anon;
grant execute on function public.fuel_prices_for(text[]) to authenticated;

-- Daily: reports go after 60 days.
do $$
begin
  perform cron.schedule('blacktop-fuel-prices-cleanup', '17 3 * * *', $q$delete from public.fuel_price_reports where reported_at < now() - interval '60 days'$q$);
exception when others then
  raise notice 'pg_cron not available: fuel price reports will not be tidied automatically';
end;
$$;
