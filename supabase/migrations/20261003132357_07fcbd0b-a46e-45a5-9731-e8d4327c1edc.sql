do $migration$
declare definition text;
begin
select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer)'::regprocedure) into definition;
if position('if m.round>5 or not exists' in definition)=0 or position('cat:=m.categories[m.round];' in definition)=0 then raise exception 'Unexpected battle operation'; end if;
definition:=replace(definition,'cat:=m.categories[m.round];','cat:=1+floor(random()*5)::integer;');
definition:=replace(definition,'if m.round>5 or not exists','if not exists');
execute definition;
end;$migration$;