create table public.cw_catalog(id text primary key, vehicle text not null, ratings integer[] not null check(cardinality(ratings)=5));
grant select on public.cw_catalog to authenticated; grant all on public.cw_catalog to service_role;
alter table public.cw_catalog enable row level security;
create policy "Signed in catalog" on public.cw_catalog for select to authenticated using(true);
insert into public.cw_catalog values ('mx5','car','{52,44,54,78,72}'),('gti','car','{62,38,58,80,62}'),('m3','car','{82,35,78,58,62}'),('911','car','{88,32,82,48,65}'),('civic','car','{70,40,72,64,72}'),('gr86','car','{62,42,82,42,88}'),('gt3r','car','{94,28,94,32,68}'),('rally','car','{72,40,90,42,90}'),('mt07','bike','{62,78,48,72,70}'),('sv650','bike','{58,72,50,82,68}'),('ninja','bike','{54,84,48,68,86}'),('gs','bike','{64,58,55,94,58}'),('panigale','bike','{94,86,72,38,72}'),('r6','bike','{78,94,76,30,92}'),('s1000','bike','{96,88,84,24,78}'),('rs660','bike','{72,92,70,40,90}');
create table public.cw_accounts(user_id uuid primary key references auth.users(id) on delete cascade, balance integer not null default 100 check(balance>=0), active_code uuid, last_created_at timestamptz, created_at timestamptz not null default now());
grant select on public.cw_accounts to authenticated; grant all on public.cw_accounts to service_role;
alter table public.cw_accounts enable row level security;
create policy "Own game balance" on public.cw_accounts for select to authenticated using(auth.uid()=user_id);
create table public.cw_matches(code uuid primary key default gen_random_uuid(),p1 uuid not null references auth.users(id) on delete cascade,p2 uuid references auth.users(id) on delete cascade,d1 text[] not null,d2 text[],hp1 integer[] not null default '{100,100,100,100,100}',hp2 integer[] not null default '{100,100,100,100,100}',used1 integer[] not null default '{}',used2 integer[] not null default '{}',move1 integer,move2 integer,tag1 integer,tag2 integer,categories integer[] not null,penalty integer not null default -1,round integer not null default 1,status text not null default 'waiting',winner uuid,log jsonb not null default '[]',deadline timestamptz not null default now()+interval '120 seconds',created_at timestamptz not null default now(),check(p1 is distinct from p2));
grant all on public.cw_matches to service_role;
alter table public.cw_matches enable row level security;
create function public.cw_available() returns boolean language sql stable set search_path=public as $$select true$$;
revoke all on function public.cw_available() from public,anon;grant execute on function public.cw_available() to authenticated;
create function public.cw_action(_action text,_code uuid default null,_deck text[] default null,_card integer default null,_tag integer default null,_round integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();m public.cw_matches%rowtype;a public.cw_accounts%rowtype;side integer;cat integer;s1 numeric;s2 numeric;damage integer;v1 text;v2 text;victor uuid;h1 integer;h2 integer;n integer;changed boolean:=false;
begin
if u is null then raise exception 'Sign in required';end if;
if _action is null or _action not in('status','create','join','play','leave') then raise exception 'Invalid action';end if;
perform pg_advisory_xact_lock(493817061);
insert into public.cw_accounts(user_id) values(u) on conflict do nothing;
if _action in('create','join') then
if _deck is null or cardinality(_deck)<>5 or (select count(distinct x) from unnest(_deck) x)<>5 or (select count(*) from public.cw_catalog where id=any(_deck))<>5 then raise exception 'Select five unique catalog cards';end if;
end if;
if _action='create' then
select * into a from public.cw_accounts where user_id=u for update;
if a.active_code is not null then raise exception 'Finish your current battle first';end if;
if a.balance<10 then raise exception 'Not enough Overdrive';end if;
if a.last_created_at>now()-interval '5 seconds' then raise exception 'Wait before inviting again';end if;
insert into public.cw_matches(p1,d1,categories,penalty) values(u,_deck,array(select x from generate_series(1,5) x order by random()),case when random()<.125 then 2+floor(random()*4)::integer else -1 end) returning * into m;
update public.cw_accounts set balance=balance-10,active_code=m.code,last_created_at=now() where user_id=u;changed:=true;
else
if _code is null then select active_code into _code from public.cw_accounts where user_id=u;end if;
if _code is null and _action<>'status' then raise exception 'Battle code required';end if;
if _code is not null then
select * into m from public.cw_matches where code=_code for update;
if not found then
if _action='status' then update public.cw_accounts set balance=balance+10,active_code=null where user_id=u and active_code=_code;else raise exception 'Battle not found';end if;
elsif u not in(m.p1,coalesce(m.p2,m.p1)) and _action<>'join' then raise exception 'Private battle';end if;
end if;
end if;
if m.code is not null then
if m.deadline<now() and m.status in('waiting','playing') then
if _action='join' and u<>m.p1 then raise exception 'Invitation expired';end if;
if m.status='waiting' then update public.cw_accounts set balance=balance+10,active_code=null where user_id=m.p1;m.status:='cancelled';
else
select sum(x) into h1 from unnest(m.hp1) x;select sum(x) into h2 from unnest(m.hp2) x;
victor:=case when m.move1 is not null and m.move2 is null then m.p1 when m.move2 is not null and m.move1 is null then m.p2 when h1>h2 then m.p1 when h2>h1 then m.p2 else null end;
m.status:='finished';m.winner:=victor;
update public.cw_accounts set balance=balance+case when victor is null then 10 when user_id=victor then 20 else 0 end,active_code=null where user_id in(m.p1,m.p2);
end if;changed:=true;
end if;
if _action='join' and u<>m.p1 then
if m.status<>'waiting' then if u is distinct from m.p2 then raise exception 'Battle unavailable';end if;
else
update public.cw_accounts set balance=balance-10,active_code=m.code where user_id=u and balance>=10 and active_code is null;get diagnostics n=row_count;if n<>1 then raise exception 'Insufficient points or already battling';end if;
m.p2:=u;m.d2:=_deck;m.status:='playing';m.deadline:=now()+interval '120 seconds';changed:=true;
end if;end if;
side:=case when u=m.p1 then 1 else 2 end;
if _action='leave' and m.status in('waiting','playing') then
if m.status='waiting' then m.status:='cancelled';update public.cw_accounts set balance=balance+10,active_code=null where user_id=m.p1;
else m.status:='finished';m.winner:=case when side=1 then m.p2 else m.p1 end;update public.cw_accounts set balance=balance+case when user_id=m.winner then 20 else 0 end,active_code=null where user_id in(m.p1,m.p2);end if;changed:=true;
end if;
if _action='play' and m.status='playing' then
if _round is null or _round>m.round then raise exception 'Invalid round';end if;
if _round=m.round then
if _card is null or _card<0 or _card>4 then raise exception 'Invalid card';end if;
if (side=1 and m.hp1[_card+1]<=0) or (side=2 and m.hp2[_card+1]<=0) then raise exception 'Card knocked out';end if;
if _tag is not null and (_tag<0 or _tag>2) then raise exception 'Invalid dog tag';end if;
if (side=1 and m.move1 is null) or (side=2 and m.move2 is null) then
if _tag is not null and ((side=1 and _tag=any(m.used1)) or (side=2 and _tag=any(m.used2))) then raise exception 'Dog tag already used';end if;
if side=1 then m.move1:=_card;m.tag1:=_tag;else m.move2:=_card;m.tag2:=_tag;end if;changed:=true;
end if;end if;
if m.move1 is not null and m.move2 is not null then
cat:=m.categories[m.round];if m.tag1=0 or m.tag2=0 then cat:=1+floor(random()*5)::integer;end if;
select vehicle,ratings[cat] into v1,s1 from public.cw_catalog where id=m.d1[m.move1+1];select vehicle,ratings[cat] into v2,s2 from public.cw_catalog where id=m.d2[m.move2+1];
if m.tag1 is not null then m.used1:=array_append(m.used1,m.tag1);end if;if m.tag2 is not null then m.used2:=array_append(m.used2,m.tag2);end if;
if m.tag1=1 then m.hp1[m.move1+1]:=least(100,m.hp1[m.move1+1]+case when v1='car' then 38 else 30 end);end if;
if m.tag2=1 then m.hp2[m.move2+1]:=least(100,m.hp2[m.move2+1]+case when v2='car' then 38 else 30 end);end if;
if m.tag1=2 then s1:=s1*case when v1='bike' then 1.65 else 1.5 end;end if;if m.tag2=2 then s2:=s2*case when v2='bike' then 1.65 else 1.5 end;end if;
if m.penalty=m.round and cat=2 then s1:=s1*.8;s2:=s2*.8;end if;
damage:=case when s1=s2 then 0 else least(65,20+round(abs(s1-s2)*.7)::integer) end;
if s1>s2 then m.hp2[m.move2+1]:=greatest(0,m.hp2[m.move2+1]-damage);elsif s2>s1 then m.hp1[m.move1+1]:=greatest(0,m.hp1[m.move1+1]-damage);end if;
m.log:=m.log||jsonb_build_array(jsonb_build_object('round',m.round,'category',cat,'card1',m.d1[m.move1+1],'card2',m.d2[m.move2+1],'damage',damage,'winner',case when s1=s2 then null when s1>s2 then 1 else 2 end));
m.round:=m.round+1;m.move1:=null;m.move2:=null;m.tag1:=null;m.tag2:=null;m.deadline:=now()+interval '120 seconds';changed:=true;
if m.round>5 or not exists(select 1 from unnest(m.hp1) x where x>0) or not exists(select 1 from unnest(m.hp2) x where x>0) then
select sum(x) into h1 from unnest(m.hp1) x;select sum(x) into h2 from unnest(m.hp2) x;m.winner:=case when h1=h2 then null when h1>h2 then m.p1 else m.p2 end;m.status:='finished';
update public.cw_accounts set balance=balance+case when m.winner is null then 10 when user_id=m.winner then 20 else 0 end,active_code=null where user_id in(m.p1,m.p2);
end if;end if;end if;
if changed then update public.cw_matches set p2=m.p2,d2=m.d2,hp1=m.hp1,hp2=m.hp2,used1=m.used1,used2=m.used2,move1=m.move1,move2=m.move2,tag1=m.tag1,tag2=m.tag2,round=m.round,status=m.status,winner=m.winner,log=m.log,deadline=m.deadline where code=m.code;end if;
return jsonb_build_object('code',m.code,'status',m.status,'round',m.round,'category',m.categories[least(m.round,5)],'penalty',m.penalty=m.round,'deck',case when side=1 then m.d1 else m.d2 end,'rivalDeck',case when side=1 then m.d2 else m.d1 end,'hp',case when side=1 then m.hp1 else m.hp2 end,'rivalHp',case when side=1 then m.hp2 else m.hp1 end,'used',case when side=1 then m.used1 else m.used2 end,'submitted',case when side=1 then m.move1 is not null else m.move2 is not null end,'rivalSubmitted',case when side=1 then m.move2 is not null else m.move1 is not null end,'side',side,'result',case when m.status<>'finished' then null when m.winner is null then 'draw' when m.winner=u then 'win' else 'loss' end,'deadline',m.deadline,'log',m.log,'balance',(select balance from public.cw_accounts where user_id=u));
end if;
return jsonb_build_object('balance',(select balance from public.cw_accounts where user_id=u));
end;$$;
revoke all on function public.cw_action(text,uuid,text[],integer,integer,integer) from public,anon;
grant execute on function public.cw_action(text,uuid,text[],integer,integer,integer) to authenticated;