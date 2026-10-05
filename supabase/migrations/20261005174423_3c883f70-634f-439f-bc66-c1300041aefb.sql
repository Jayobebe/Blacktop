-- Card Wars: the Coin flip dog tag, and riders' own cards that stay in their class.
--
-- Coin flip is a fourth dog tag power. Armed for a round, it replaces the
-- category draw with a coin: heads, the round is fought in that card's best
-- rating; tails, in its worst (Speed, G-force, Distance or Corners: never
-- Lean). A standard tag is a fair coin; one won on a spin lands heads more
-- often the faster its vehicle (50 + speed / 6 percent, 4 more with a matching
-- kind of vehicle). If both sides flip, each coin picks a category and the
-- round takes one of the two at random. The log carries both flips.
--
-- A deck still carries three dog tags, so one of the four powers stays at
-- home: the app sends "-" in its place, the server refuses a fourth and
-- refuses a round played with the one left out. An app that still sends three
-- carries the first three and no coin.
--
-- Own cards: the app now matches a rider's own vehicle to the nearest Road
-- card instead of a random one, and riding lifts a rating by 12 at most. The
-- server holds it to that, and forgets the ratings it had locked.
--
-- cw_action, cw_spin, cw_spin_tag and cw_shop are patched in place (they have
-- changed since they were first written); a patch that no longer fits stops
-- the migration rather than guess (every piece looked for sits on one line, so
-- line endings can't get in the way). The app reads cw_flip() to know this is
-- live (lib/serverCaps.ts, cardWarsFlip).

alter table public.cw_tags drop constraint if exists cw_tags_power_check;
alter table public.cw_tags add constraint cw_tags_power_check check (power in ('reroll','heal','boost','flip'));

-- Everyone gets a free spin for the new power.
alter table public.cw_accounts alter column free_tag_spins set default 4;
update public.cw_accounts set free_tag_spins = free_tag_spins + 1;

delete from public.cw_own_cards;

create or replace function public.cw_flip() returns boolean language sql stable set search_path=public as $$ select true $$;
revoke all on function public.cw_flip() from public, anon;
grant execute on function public.cw_flip() to authenticated;

create or replace function public.cw_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'version', 3,
    'reward', jsonb_build_object('win', 15, 'draw', 8, 'loss', 5, 'firstWin', 20, 'daily', 20, 'duplicate', 10),
    'stake', 20, 'pot', 36,
    'spin', jsonb_build_object('card', 16, 'tag', 12, 'spin', 20, 'rpm', 52),
    'freeTagSpins', 4,
    'powers', jsonb_build_array('reroll','heal','boost','flip'))
$$;

-- A tag's strength with a card of kind _kind (src/features/card-wars/lib/tagRules.ts
-- does the same sums). _power: 0 Second chance, 1 Pit medic, 2 Overdrive, 3 Coin
-- flip. Hundredths for 0 and 2, HP for 1, the chance of heads in percent for 3.
create or replace function public.cw_tag_value(_power integer, _ref text, _kind text) returns integer language plpgsql stable set search_path=public as $$
declare r integer[]; tied text; base integer := case _power when 3 then 50 when 2 then 135 when 1 then 20 else 100 end;
begin
  if _ref is null or _ref = '' then return base; end if;
  if left(_ref,1) = '~' then
    tied := substr(_ref,2);
  else
    select ratings, vehicle into r, tied from public.cw_catalog where id=_ref;
    if r is null then return base; end if;
    base := case _power when 3 then 50 + r[1]/6 when 2 then 125 + r[3]/2 when 1 then 14 + (r[4]*32)/100 else 100 + greatest(0,(r[5]-40)/4) end;
  end if;
  return base + case when tied = _kind then case _power when 3 then 4 when 2 then 10 when 1 then 6 else 5 end else 0 end;
end $$;
revoke all on function public.cw_tag_value(integer,text,text) from public, anon, authenticated;

do $migration$
declare
  d text;
  -- [what to find, what to put there]
  edits text[][] := array[
    -- a place for the flips
    array[$a$tags text[];$a$, $b$tags text[]; hd1 boolean; hd2 boolean; fc1 integer; fc2 integer;$b$],
    -- four powers, three to a deck: '-' marks the one left at home (an app that sends three leaves the coin)
    array[$a$tags := coalesce(_tags, array['','','']);$a$, $b$tags := coalesce(_tags, array['','','','-']); if cardinality(tags)=3 then tags := tags || '-'::text; end if;$b$],
    array[$a$if cardinality(tags)<>3 then raise exception 'Invalid dog tag'; end if;$a$, $b$if cardinality(tags)<>4 then raise exception 'Invalid dog tag'; end if; if (select count(*) from unnest(tags) x where x is distinct from '-')>3 then raise exception 'Three dog tags a deck'; end if;$b$],
    array[$a$if tags[i] not in('','~car','~bike') and not exists($a$, $b$if tags[i] not in('','~car','~bike','-') and not exists($b$],
    array[$a$for i in 1..3 loop$a$, $b$for i in 1..4 loop$b$],
    array[$a$t.power=(array['reroll','heal','boost'])[i]$a$, $b$t.power=(array['reroll','heal','boost','flip'])[i]$b$],
    array[$a$if _tag is not null and (_tag<0 or _tag>2) then$a$, $b$if _tag is not null and (_tag<0 or _tag>3) then raise exception 'Invalid dog tag'; end if; if _tag is not null and coalesce((case when side=1 then m.tags1 else m.tags2 end)[_tag+1],'-')='-' then$b$],
    -- riding lifts an own card's rating by 12 at most
    array[$a$if cand[k]<base[k] or cand[k]>(select max(ratings[k]) from public.cw_catalog) then$a$, $b$if cand[k]<base[k] or cand[k]>least(base[k]+12,(select max(ratings[k]) from public.cw_catalog)) then$b$],
    -- the coin picks the category
    array[$a$if m.tag2=2 then b2 := public.cw_tag_value(2,m.tags2[3],v2)/100.0; end if;$a$, $b$if m.tag2=2 then b2 := public.cw_tag_value(2,m.tags2[3],v2)/100.0; end if;
          if m.tag1=3 then
            hd1 := random()*100 < public.cw_tag_value(3,m.tags1[4],v1);
            select t.k into fc1 from unnest(array[1,3,4,5]) with ordinality t(k,o)
              order by round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,t.k) end)*case when hd1 then -1 else 1 end, t.o limit 1;
          end if;
          if m.tag2=3 then
            hd2 := random()*100 < public.cw_tag_value(3,m.tags2[4],v2);
            select t.k into fc2 from unnest(array[1,3,4,5]) with ordinality t(k,o)
              order by round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,t.k) end)*case when hd2 then -1 else 1 end, t.o limit 1;
          end if;
          if fc1 is not null or fc2 is not null then
            cat := case when fc1 is not null and fc2 is not null and fc1<>fc2 then (case when random()<.5 then fc1 else fc2 end) else coalesce(fc1,fc2) end;
          end if;$b$],
    array[$a$'t1',m.tag1,'t2',m.tag2,'event',ev));$a$, $b$'t1',m.tag1,'t2',m.tag2,'event',ev,
            'f1',case when fc1 is not null then jsonb_build_object('h',hd1,'c',fc1) end,
            'f2',case when fc2 is not null then jsonb_build_object('h',hd2,'c',fc2) end));$b$]
  ];
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position('fc1' in d) = 0 then
    for i in 1..array_length(edits,1) loop
      if position(edits[i][1] in d) = 0 then raise exception 'cw_action has changed: edit % no longer fits', i; end if;
      d := replace(d, edits[i][1], edits[i][2]);
    end loop;
    execute d;
  end if;

  -- A shelf spin's dog tag can be a Coin flip.
  select pg_get_functiondef('public.cw_spin(text,boolean)'::regprocedure) into d;
  if position($a$'boost','flip'$a$ in d) = 0 then
    if position($a$(array['reroll','heal','boost'])[1+floor(random()*3)::integer]$a$ in d) = 0 then raise exception 'cw_spin has changed'; end if;
    execute replace(d, $a$(array['reroll','heal','boost'])[1+floor(random()*3)::integer]$a$, $b$(array['reroll','heal','boost','flip'])[1+floor(random()*4)::integer]$b$);
  end if;

  -- The free spins cover all four powers.
  select pg_get_functiondef('public.cw_spin_tag()'::regprocedure) into d;
  if position($a$'flip'$a$ in d) = 0 then
    if position($a$unnest(array['boost','heal','reroll'])$a$ in d) = 0 or position($a$(array['reroll','heal','boost'])[1+floor(random()*3)::integer]$a$ in d) = 0 then raise exception 'cw_spin_tag has changed'; end if;
    d := replace(d, $a$unnest(array['boost','heal','reroll'])$a$, $b$unnest(array['boost','heal','reroll','flip'])$b$);
    execute replace(d, $a$(array['reroll','heal','boost'])[1+floor(random()*3)::integer]$a$, $b$(array['reroll','heal','boost','flip'])[1+floor(random()*4)::integer]$b$);
  end if;

  select pg_get_functiondef('public.cw_shop()'::regprocedure) into d;
  if position($a$coalesce(a.free_tag_spins, 3)$a$ in d) > 0 then
    execute replace(d, $a$coalesce(a.free_tag_spins, 3)$a$, $b$coalesce(a.free_tag_spins, 4)$b$);
  end if;
end $migration$;