import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { SHOP_ITEMS } from '../lib/catalogue';
import { tr } from '@/lib/i18n';

interface Row {
  item_id: string;
  yes: number;
  maybe: number;
  no: number;
  prices: Record<string, number>;
}

interface Suggestion {
  body: string;
  created_at: string;
}

/**
 * Every rider's Speedshop survey answers, rolled up per item, plus their
 * suggestions. Shown on the demo account (Settings, below Pay up). Anonymous:
 * the server only ever returns totals and suggestion text.
 */
export function SurveyResultsTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [t, s] = await Promise.all([
        (supabase as any).rpc('speedshop_survey_table'),
        (supabase as any).rpc('speedshop_suggestion_list', { _limit: 200 }),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (t.error) throw t.error;
      setRows((t.data ?? []) as Row[]);
      setSuggestions((s.data ?? []) as Suggestion[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map((rows ?? []).map((r) => [r.item_id, r]));
  // Only items still in the shop (answers for removed items stay in the database).
  const ordered = SHOP_ITEMS.map((i) => ({ id: i.id, name: i.name, prices: i.prices, row: byId.get(i.id) }));
  const voters = Math.max(0, ...ordered.map((o) => (o.row ? o.row.yes + o.row.maybe + o.row.no : 0)));

  return (
    <section className="rounded-[18px] p-4 landscape:p-3 border border-accent/40 bg-card/50 animate-slide-up">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingBag className="w-[18px] h-[18px] text-accent" />
        <p className="text-[14px] font-semibold flex-1">{tr("Speedshop survey")}</p>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground" aria-label={tr("Refresh survey results")}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{tr("Every rider's answers, all in one place. Anonymous totals.")}</p>

      {error ? (
        <p className="text-xs text-destructive">{tr("Couldn't load the results. The survey tables may not be set up on the server yet.")}</p>
      ) : rows === null ? (
        <p className="text-xs text-muted-foreground">{tr("Loading…")}</p>
      ) : (
        <>
          {/* A stacked list rather than a five-column table: it reads at any
              phone width and in any language (long translated column headings
              used to push the table off the side of the card). */}
          <ul className="rounded-xl border border-border divide-y divide-border/60">
            {ordered.map(({ id, name, prices, row }) => {
              const yes = row?.yes ?? 0;
              const maybe = row?.maybe ?? 0;
              const no = row?.no ?? 0;
              const total = yes + maybe + no;
              const keen = total ? Math.round(((yes + maybe) / total) * 100) : null;
              const picks = prices.filter((p) => row?.prices?.[p]).map((p) => `${p} ×${row!.prices[p]}`);
              const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
              return (
                <li key={id} className="px-3 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <p className="flex-1 min-w-0 text-xs font-medium break-words">{name}</p>
                    <p className={cn('text-xs font-semibold tabular-nums', keen !== null && keen >= 50 ? 'text-accent' : 'text-muted-foreground')}>
                      {keen === null ? '—' : `${keen}%`}
                    </p>
                  </div>
                  {total > 0 && (
                    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-muted/40" aria-hidden>
                      <span className="bg-accent" style={{ width: pct(yes) }} />
                      <span className="bg-accent/45" style={{ width: pct(maybe) }} />
                      <span className="bg-muted-foreground/30" style={{ width: pct(no) }} />
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                    {tr("Buy")} {yes} · {tr("Maybe")} {maybe} · {tr("No")} {no}
                  </p>
                  {picks.length > 0 && (
                    <p className="text-[10px] text-muted-foreground break-words">{tr("Would pay")}{" "}{picks.join(' · ')}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {voters === 1 ? tr("Keen = buy + maybe. Up to 1 rider per item so far.") : tr("Keen = buy + maybe. Up to {0} riders per item so far.", [voters])}
          </p>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3 mb-1.5">{tr("Suggestions (")}{suggestions.length})</p>
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tr("None yet.")}</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {suggestions.map((s, i) => (
                <li key={i} className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
                  <p className="break-words">{s.body}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(s.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
