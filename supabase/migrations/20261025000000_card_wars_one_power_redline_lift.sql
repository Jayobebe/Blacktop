-- Card Wars: one dog tag of each power again, and Redline cards worth how rare they are.
-- Needs 20261021000000_card_wars_redline.sql.
--
-- Builds of two or three of one power are over: three Overdrives took a mirror
-- match from one win in four to nearly nine in ten, so the tags decided
-- battles more than the cards did. A deck carries three dog tags, each a
-- different power.
--
-- The Wildcard was worth no more than carrying no tag. Three things lift it
-- (the app's engine does the same against the computer):
--   the rev counter never stops on a Redline whose rating in the drawn category is 0;
--   a Redline that wins hits as hard as a hit can (80);
--   a Redline that loses takes the loss itself: the player's card isn't touched.
-- When both sides arm a Wildcard in the same round the last two cancel out and the round is an ordinary one.

create or replace function public.cw_check_slots(_user uuid, _tags text[]) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare t text; pw text; ref text; powers text[] := '{}'::text[];
begin
  if _tags is null or cardinality(_tags) <> 3 then raise exception 'Invalid dog tag'; end if;
  foreach t in array _tags loop
    continue when t = '-';
    if t is null or position(':' in t) = 0 then raise exception 'Invalid dog tag'; end if;
    pw := split_part(t, ':', 1); ref := substr(t, length(pw) + 2);
    if pw not in('reroll','heal','boost','flip','wild') then raise exception 'Invalid dog tag'; end if;
    if pw = any(powers) then raise exception 'One dog tag of each power'; end if;
    powers := array_append(powers, pw);
    if pw = 'wild' then
      if ref <> '' then raise exception 'Invalid dog tag'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and a.wildcard) then raise exception 'Dog tag not owned'; end if;
      if not exists(select 1 from public.cw_accounts a where a.user_id=_user and cardinality(a.redline_wheel) = 5) then raise exception 'Pick five Redline cards for your wheel'; end if;
      continue;
    end if;
    continue when ref in('~car','~bike','~all');
    if ref <> '' and not exists(select 1 from public.cw_tags g where g.user_id=_user and g.power=pw and g.card_id=ref) then raise exception 'Dog tag not owned'; end if;
  end loop;
end $function$;

-- Where the rev counter stops: any card on the wheel that isn't a 0 in the category (any at all if they all are).
create or replace function public.cw_wheel_pick(_wheel text[], _cat integer) returns text
language sql volatile security definer set search_path to 'public','pg_temp' as $$
  select coalesce(
    (select r.id from public.cw_redline_cards r where r.id = any(_wheel) and r.ratings[_cat] > 0 order by random() limit 1),
    (select w from unnest(_wheel) w order by random() limit 1))
$$;
revoke all on function public.cw_wheel_pick(text[], integer) from public, anon, authenticated;

create or replace function public.cw_redline_rules() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object('odds', 2, 'pity', 40, 'wheel', 5, 'starter', 5, 'dailyOneIn', 3, 'noZero', true, 'fullHit', true, 'shield', true,
    'cards', (select jsonb_agg(jsonb_build_object('id', id, 'vehicle', vehicle, 'ratings', ratings) order by id) from public.cw_redline_cards))
$$;

do $migration$
declare
  d text; n integer;
  pieces text[][] := array[
    -- The category is settled (never Lean) before the rev counter moves, so it can read it.
    array[$a$if pw1=4 and cardinality(m.wild1)>0 then$a$,
          $b$if (pw1=4 and cardinality(m.wild1)>0) or (pw2=4 and cardinality(m.wild2)>0) then
            if cat=2 then cat := (array[1,3,4,5])[1+floor(random()*4)::integer]; end if;
          end if;
          if pw1=4 and cardinality(m.wild1)>0 then$b$],
    array[$a$wl1 := m.wild1[1+floor(random()*cardinality(m.wild1))::integer];$a$, $b$wl1 := public.cw_wheel_pick(m.wild1, cat);$b$],
    array[$a$wl2 := m.wild2[1+floor(random()*cardinality(m.wild2))::integer];$a$, $b$wl2 := public.cw_wheel_pick(m.wild2, cat);$b$],
    -- A Redline's win is a full hit, its loss costs the player's card nothing (one side's Wildcard only).
    array[$a$damage := case when s1=s2 then 0 else least(80,35+round(abs(s1-s2)*.8)::integer) end;$a$,
          $b$damage := case when s1=s2 then 0 else least(80,35+round(abs(s1-s2)*.8)::integer) end;
          if wn is not null and ((wl1 is not null) <> (wl2 is not null)) then
            damage := case when (wl1 is not null and wn=1) or (wl2 is not null and wn=2) then 80 else 0 end;
          end if;$b$]
  ];
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position('wl1 text' in d) = 0 then raise exception 'Run 20261021000000_card_wars_redline.sql first'; end if;
  if position('cw_wheel_pick' in d) = 0 then
    for i in 1..array_length(pieces, 1) loop
      n := (length(d) - length(replace(d, pieces[i][1], ''))) / length(pieces[i][1]);
      if n <> 1 then raise exception 'cw_action has changed: piece % found % times', i, n; end if;
      d := replace(d, pieces[i][1], pieces[i][2]);
    end loop;
    execute d;
  end if;
end $migration$;
