-- Blacktop World's globe glows by where accounts are, not by who is riding
-- right now. Each phone works out its own country from its last position and
-- sends only that country's number (ISO 3166 numeric, the id the globe's map
-- uses). Nothing finer is kept: no coordinates, no place.
--
-- A table of its own, not a column on profiles: profiles can be read by other
-- riders, and nobody should be able to look up one rider's country. RLS is on
-- with no policies, so the only way in or out is the two functions below, and
-- the only thing that comes out is a count per country.

create table if not exists public.profile_countries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country smallint not null check (country between 1 and 999),
  updated_at timestamptz not null default now()
);

alter table public.profile_countries enable row level security;

-- The rider's own country. Null takes it away again (Blacktop World turned off).
create or replace function public.set_profile_country(_country integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not signed in';
  end if;
  if _country is null then
    delete from public.profile_countries where user_id = _uid;
    return;
  end if;
  if _country < 1 or _country > 999 then
    raise exception 'unknown country';
  end if;
  insert into public.profile_countries (user_id, country)
  values (_uid, _country)
  on conflict (user_id) do update set country = excluded.country, updated_at = now();
end;
$$;

-- How many accounts each country has. Counts only.
create or replace function public.profile_country_counts()
returns table (country integer, riders bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.country::integer, count(*)
  from public.profile_countries c
  group by c.country
  order by 2 desc, 1;
$$;

revoke all on function public.set_profile_country(integer) from public, anon;
revoke all on function public.profile_country_counts() from public, anon;
grant execute on function public.set_profile_country(integer) to authenticated;
grant execute on function public.profile_country_counts() to authenticated;