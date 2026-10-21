-- Fuel prices: station ids in the form the app sends.
--
-- Map stations come from OpenStreetMap as nodes, ways or relations, and a node
-- and a way can carry the same number, so the id needs its kind: "op:n123",
-- "op:w123", "op:r123". The first migration only took "op:123", which no
-- station the app finds ever has, so every report was refused and none were
-- stored. Safe to run twice.

alter table public.fuel_price_reports drop constraint if exists fuel_price_reports_station_id_check;
alter table public.fuel_price_reports add constraint fuel_price_reports_station_id_check
  check (station_id ~ '^op:[nwr][0-9]{1,15}$') not valid;

create or replace function public.report_fuel_price(_station_id text, _fuel text, _price numeric, _currency text, _country text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  market_mid numeric;
  market_n integer;
begin
  if auth.uid() is null then return 'no_session'; end if;
  if _station_id is null or _station_id !~ '^op:[nwr][0-9]{1,15}$' then return 'bad_station'; end if;
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

