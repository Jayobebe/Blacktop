-- Card Wars: a Coin flip picks the category against the opposing card.
--
-- Heads used to be the card's own best rating and tails its worst, whatever
-- it was up against. Now heads is the category where the card has the biggest
-- lead over the card it's facing (or the smallest deficit), and tails the one
-- where it's furthest behind: Speed, G-force, Distance or Corners, never Lean,
-- the first of equals in that order. Wear counts on both cards, as it does in
-- the round. The app's own sum is flipCategory (lib/tagRules.ts).
--
-- cw_action is patched in place (each piece looked for sits on one line); a
-- patch that no longer fits stops the migration rather than guess.

do $migration$
declare
  d text;
  edits text[][] := array[
    array[$a$order by round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,t.k) end)*case when hd1 then -1 else 1 end, t.o limit 1;$a$,
          $b$order by (round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,t.k) end)-round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,t.k) end))*case when hd1 then -1 else 1 end, t.o limit 1;$b$],
    array[$a$order by round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,t.k) end)*case when hd2 then -1 else 1 end, t.o limit 1;$a$,
          $b$order by (round(rat2[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p2,c2,t.k) end)-round(rat1[t.k]*case when ev=6 then 1 else public.cw_wear_mult(m.p1,c1,t.k) end))*case when hd2 then -1 else 1 end, t.o limit 1;$b$]
  ];
begin
  select pg_get_functiondef('public.cw_action(text,uuid,text[],integer,integer,integer,text[],jsonb)'::regprocedure) into d;
  if position($a$-round(rat2[t.k]*case when ev=6$a$ in d) = 0 then
    for i in 1..array_length(edits,1) loop
      if position(edits[i][1] in d) = 0 then raise exception 'cw_action has changed: edit % no longer fits', i; end if;
      d := replace(d, edits[i][1], edits[i][2]);
    end loop;
    execute d;
  end if;
end $migration$;
