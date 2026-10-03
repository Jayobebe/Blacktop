do $migration$
declare definition text;
begin
select pg_get_functiondef(oid) into definition from pg_proc where proname='cw_action' and pronamespace='public'::regnamespace;
if definition is null then raise exception 'Battle operation missing'; end if;
if position('''category'',m.categories[least(m.round,5)]' in definition)=0 then raise exception 'Unexpected battle operation'; end if;
definition:=replace(definition,'''category'',m.categories[least(m.round,5)]','''category'',null,''selected'',case when side=1 then m.move1 else m.move2 end');
definition:=replace(definition,'cat:=m.categories[m.round];if m.tag1=0 or m.tag2=0 then cat:=1+floor(random()*5)::integer;end if;','cat:=m.categories[m.round];if m.tag1=0 or m.tag2=0 then cat:=1+floor(random()*5)::integer;end if; if cat=2 and exists(select 1 from public.cw_catalog where id in(m.d1[m.move1+1],m.d2[m.move2+1]) and vehicle=''car'') then cat:=(array[1,3,4,5])[1+floor(random()*4)::integer];end if;');
execute definition;
end;$migration$;