-- Card Wars: free builds, earned Spectre tags, cheaper upkeep, RPM from the arcade.
--
-- Builds. A deck still carries three dog tags, but they no longer have to be
-- three different powers: two or three Overdrives is a build like any other.
-- The app now sends its three slots as "power:ref" ("boost:panigale", "heal:",
-- "flip:~all", or "-" for an empty slot), plays a slot (0 to 2) and gets its
-- used slots back. A tag can sit in one slot only: the plain tag of a power
-- once, a tag won on a spin once (it has to be owned). An app that hasn't
-- updated still sends one entry per power and is treated as before.
--
-- Spectre tags (taken on a Track Day board, kept on the phone): "~all" is a
-- plain tag that always gets the matching-vehicle bonus, car or bike, because
-- it was earned. The power it has is spun for on the phone.
--
-- Upkeep. A day of battles wore cards faster than its winnings could repair:
-- a repair now costs a quarter of the card's price for a full one (it was
-- half), and a card that sits a battle out gets 15 % back (it was 10).
--
-- Arcade. A finished game of Hit Heavy or Petrol Head pays 5 RPM, 15 for a new
-- personal best, 40 a day at most and one payment every 20 seconds: the phone
-- reports the game, so the cap is what bounds a forged one.
--
-- cw_action is patched in place; a patch that no longer fits stops the
-- migration rather than guess (every piece looked for sits on one line). The
-- app reads cw_build_rules() to know this is live (lib/serverCaps.ts,
-- cardWarsBuilds).

alter table public.cw_accounts add column if not exists arcade_day date;
alter table public.cw_accounts add column if not exists arcade_rpm integer not null default 0;
alter table public.cw_accounts add column if not exists last_arcade_reward timestamptz;

create or replace function public.cw_build_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 4, 'slots', 3, 'repairDivisor', 400, 'rest', 15,
    'arcade', jsonb_build_object('game', 5, 'best', 15, 'daily', 40))
$$;
revoke all on function public.cw_build_rules() from public, anon;
grant execute on function public.cw_build_rules() to authenticated;

create or replace function public.cw_wear_rules() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('version', 3, 'road', 1, 'race', 2, 'past', 10, 'extra', 1, 'cap', 45, 'rest', 15)
$$;

-- ── Dog tags ─────────────────────────────────────────────────────────────────
-- A tag's strength with a card of kind _kind (src/features/card-wars/lib/tagRules.ts
-- does the same sums). "~all": a Spectre tag, matched with any vehicle.
create or replace function public.cw_tag_value(_power integer, _ref text, _kind text) returns integer language plpgsql stable set search_path=public as $$
declare r integer[]; tied text; base integer := case _power when 3 then 50 when 2 then 135 when 1 then 20 else 100 end;
begin
  if _ref is null or _ref = '' then return base; end if;
  if left(_ref,1) = '~' then
    tied := case when _ref = '~all' then _kind else substr(_ref,2) end;
  else
    select ratings, vehicle into r, tied from public.cw_catalog where id=_ref;
    if r is null then return base; end if;
    base := case _power when 3 then 50 + r[1]/6 when 2 then 125 + r[3]/2 when 1 then 14 + (r[4]*32)/100 else 100 + greatest(0,(r[5]-40)/4) end;
  end if;
  return base + case when tied = _kind then case _power when 3 then 4 when 2 then 10 when 1 then 6 else 5 end else 0 end;
end $$;
revoke all on function public.cw_tag_value(integer,text,text) from public, anon, authenticated;

-- Three slots, each "-" or "power:ref". Refused: a power that doesn't exist, a
-- tag that isn't owned, the same tag in two slots (Spectre tags aside: the
-- server can't tell one from another).
create or replace function public.cw_check_slots(_user uuid, _tags text[]) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t text; pw text; ref text; seen text[] := '{}'::text[];
begin
  if _tags is null or cardinality(_tags) <> 3 then raise exception 'Invalid dog tag'; end if;
  foreach t in array _tags loop
    continue when t = '-';
    if t is null or position(':' in t) = 0 then raise exception 'Invalid dog tag'; end if;
    pw := split_part(t, ':', 1); ref := substr(t, length(pw) + 2);
    if pw not in('reroll','heal','boost','flip') then raise exception 'Invalid dog tag'; end if;
    continue when ref in('~car','~bike','~all');
    if ref <> '' and not exists(select 1 from public.cw_tags g where g.user_id=_user and g.power=pw and g.card_id=ref) then raise exception 'Dog tag not owned'; end if;
    if t = any(seen) then raise exception 'The same dog tag twice'; end if;
    seen := array_append(seen, t);
  end loop;
end $$;
revoke all on function public.cw_check_slots(uuid,text[]) from public, anon, authenticated;

-- The power (0 Second chance, 1 Pit medic, 2 Overdrive, 3 Coin flip) and the
-- tag behind what a side armed: a slot of three, or the power itself for an
-- app that still sends one entry per power.
create or replace function public.cw_armed_power(_tags text[], _tag integer) returns integer language sql immutable as $$
  select case when _tag is null then null
    when cardinality(_tags) = 3 then array_position(array['reroll','heal','boost','flip'], split_part(_tags[_tag+1], ':', 1)) - 1
    else _tag end
$$;
create or replace function public.cw_armed_ref(_tags text[], _tag integer) returns text language sql immutable as $$
  select case when _tag is null then null
    when cardinality(_tags) = 3 then substr(_tags[_tag+1], length(split_part(_tags[_tag+1], ':', 1)) + 2)
    else _tags[_tag+1] end
$$;
-- Is there an Overdrive this side hasn't used? (Only one can break a stalemate.)
create or replace function public.cw_boost_left(_tags text[], _used integer[]) returns boolean language sql immutable as $$
  select case when cardinality(_tags) = 3
    then exists(select 1 from unnest(_tags) with ordinality t(x, i) where split_part(t.x, ':', 1) = 'boost' and not ((t.i - 1)::integer = any(coalesce(_used, '{}'::integer[]))))
    else not (2 = any(coalesce(_used, '{}'::integer[]))) end
$$;
revoke all on function public.cw_armed_power(text[],integer), public.cw_armed_ref(text[],integer), public.cw_boost_left(text[],integer[]) from public, anon, authenticated;

do $migration$
declare
  d text;
  -- [what to find, what to put there]
  edits text[][] := array[
    array[$a$tags text[]; hd1 boolean;$a$, $b$tags text[]; slots boolean; pw1 integer; pw2 integer; tr1 text; tr2 text; hd1 boolean;$b$],
    -- three slots of "power:ref", or the older one entry per power
    array[$a$tags := coalesce(_tags, array['','','','-']); if cardinality(tags)=3 then tags := tags || '-'::text; end if;$a$,
          $b$tags := coalesce(_tags, array['','','','-']); slots := cardinality(tags)=3 and exists(select 1 from unnest(tags) x where x='-' or position(':' in coalesce(x,''))>0); if slots then perform public.cw_check_slots(u, tags); elsif cardinality(tags)=3 then tags := tags || '-'::text; end if;$b$],
    array[$a$if cardinality(tags)<>4 then raise exception 'Invalid dog tag'; end if; if (select$a$, $b$if not slots and cardinality(tags)<>4 then raise exception 'Invalid dog tag'; end if; if (select$b$],
    array[$a$for i in 1..4 loop$a$, $b$for i in 1..(case when slots then 0 else 4 end) loop$b$],
    -- what each side armed, whichever way its tags are held
    array[$a$if m.tag2 is not null then m.used2 := array_append(m.used2,m.tag2); end if;$a$,
          $b$if m.tag2 is not null then m.used2 := array_append(m.used2,m.tag2); end if;
          pw1 := public.cw_armed_power(m.tags1,m.tag1); tr1 := public.cw_armed_ref(m.tags1,m.tag1);
          pw2 := public.cw_armed_power(m.tags2,m.tag2); tr2 := public.cw_armed_ref(m.tags2,m.tag2);$b$],
    array[$a$if m.tag1=1 then$a$, $b$if pw1=1 then$b$],
    array[$a$if m.tag2=1 then$a$, $b$if pw2=1 then$b$],
    array[$a$if m.tag1=2 then$a$, $b$if pw1=2 then$b$],
    array[$a$if m.tag2=2 then$a$, $b$if pw2=2 then$b$],
    array[$a$if m.tag1=3 then$a$, $b$if pw1=3 then$b$],
    array[$a$if m.tag2=3 then$a$, $b$if pw2=3 then$b$],
    array[$a$(s1<s2 and m.tag1=0) or (s2<s1 and m.tag2=0)$a$, $b$(s1<s2 and pw1=0) or (s2<s1 and pw2=0)$b$],
    array[$a$cw_tag_value(1,m.tags1[2],v1)$a$, $b$cw_tag_value(1,tr1,v1)$b$],
    array[$a$cw_tag_value(1,m.tags2[2],v2)$a$, $b$cw_tag_value(1,tr2,v2)$b$],
    array[$a$cw_tag_value(2,m.tags1[3],v1)$a$, $b$cw_tag_value(2,tr1,v1)$b$],
    array[$a$cw_tag_value(2,m.tags2[3],v2)$a$, $b$cw_tag_value(2,tr2,v2)$b$],
    array[$a$cw_tag_value(3,m.tags1[4],v1)$a$, $b$cw_tag_value(3,tr1,v1)$b$],
    array[$a$cw_tag_value(3,m.tags2[4],v2)$a$, $b$cw_tag_value(3,tr2,v2)$b$],
    array[$a$cw_tag_value(0,m.tags1[1],v1)$a$, $b$cw_tag_value(0,tr1,v1)$b$],
    array[$a$cw_tag_value(0,m.tags2[1],v2)$a$, $b$cw_tag_value(0,tr2,v2)$b$],
    -- the log names the power, not the slot
    array[$a$'t1',m.tag1,'t2',m.tag2,$a$, $b$'t1',pw1,'t2',pw2,$b$],
    array[$a$elsif 2=any(m.used1) and 2=any(m.used2) and not exists($a$, $b$elsif not public.cw_boost_left(m.tags1,m.used1) and not public.cw_boost_left(m.tags2,m.used2) and not exists($b$]
  ];
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position('cw_armed_power' in d) = 0 then
    for i in 1..array_length(edits,1) loop
      if position(edits[i][1] in d) = 0 then raise exception 'cw_action has changed: edit % no longer fits', i; end if;
      d := replace(d, edits[i][1], edits[i][2]);
    end loop;
    execute d;
  end if;

  -- Repairs: a quarter of the card's price for a full one.
  select pg_get_functiondef('public.cw_repair(text)'::regprocedure) into d;
  if position($a$/ 400.0$a$ in d) = 0 then
    if position($a$coalesce(p,100) / 200.0$a$ in d) = 0 then raise exception 'cw_repair has changed'; end if;
    execute replace(d, $a$coalesce(p,100) / 200.0$a$, $b$coalesce(p,100) / 400.0$b$);
  end if;

  -- Sitting a battle out gives 15 back.
  select pg_get_functiondef('public.cw_wear_rounds(uuid,text[],integer[])'::regprocedure) into d;
  if position($a$w.condition+15$a$ in d) = 0 then
    if position($a$least(100,w.condition+10)$a$ in d) = 0 then raise exception 'cw_wear_rounds has changed'; end if;
    execute replace(d, $a$least(100,w.condition+10)$a$, $b$least(100,w.condition+15)$b$);
  end if;
  select pg_get_functiondef('public.cw_wear_for(uuid,text[])'::regprocedure) into d;
  if position($a$w.condition+15$a$ in d) = 0 then
    if position($a$least(100,w.condition+10)$a$ in d) = 0 then raise exception 'cw_wear_for has changed'; end if;
    execute replace(d, $a$least(100,w.condition+10)$a$, $b$least(100,w.condition+15)$b$);
  end if;
end $migration$;

-- ── RPM from the other arcade games ──────────────────────────────────────────
create or replace function public.cw_arcade_reward(_game text, _best boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid(); a public.cw_accounts%rowtype; earned integer; amount integer;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if _game is null or _game not in('hit-heavy','petrol-head') then raise exception 'Invalid game'; end if;
  insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
  perform public.cw_daily_topup(u);
  select * into a from public.cw_accounts where user_id=u for update;
  earned := case when a.arcade_day = current_date then a.arcade_rpm else 0 end;
  if earned >= 40 or a.last_arcade_reward > now() - interval '20 seconds' then
    return jsonb_build_object('rpm',0,'balance',a.balance,'left',greatest(0,40-earned));
  end if;
  amount := least(40 - earned, case when coalesce(_best,false) then 15 else 5 end);
  update public.cw_accounts set balance=balance+amount, arcade_day=current_date, arcade_rpm=earned+amount, last_arcade_reward=now()
    where user_id=u returning balance into a.balance;
  return jsonb_build_object('rpm',amount,'balance',a.balance,'left',40-earned-amount);
end $$;
revoke all on function public.cw_arcade_reward(text,boolean) from public, anon;
grant execute on function public.cw_arcade_reward(text,boolean) to authenticated;