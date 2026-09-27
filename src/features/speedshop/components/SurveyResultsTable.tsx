import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { SHOP_ITEMS } from '../lib/catalogue';

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
  // Catalogue order first, then anything no longer in the catalogue.
  const ordered = [
    ...SHOP_ITEMS.map((i) => ({ id: i.id, name: i.name, prices: i.prices, row: byId.get(i.id) })),
    ...(rows ?? []).filter((r) => !SHOP_ITEMS.some((i) => i.id === r.item_id)).map((r) => ({ id: r.item_id, name: r.item_id, prices: Object.keys(r.prices), row: r })),
  ];
  const voters = Math.max(0, ...ordered.map((o) => (o.row ? o.row.yes + o.row.maybe + o.row.no : 0)));

  return (
    <section className="rounded-[18px] p-4 landscape:p-3 border border-accent/40 bg-card/50 animate-slide-up">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingBag className="w-[18px] h-[18px] text-accent" />
        <p className="text-[14px] font-semibold flex-1">Speedshop survey</p>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Refresh survey results">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Every rider's answers, all in one place. Anonymous totals.</p>

      {error ? (
        <p className="text-xs text-destructive">Couldn't load the results. The survey tables may not be set up on the server yet.</p>
      ) : rows === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-2 py-1.5">Item</th>
                  <th className="text-right font-medium px-1.5 py-1.5" title="I'd buy it">Buy</th>
                  <th className="text-right font-medium px-1.5 py-1.5">Maybe</th>
                  <th className="text-right font-medium px-1.5 py-1.5">No</th>
                  <th className="text-right font-medium px-2 py-1.5">Keen</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(({ id, name, prices, row }) => {
                  const total = row ? row.yes + row.maybe + row.no : 0;
                  const keen = total ? Math.round(((row!.yes + row!.maybe) / total) * 100) : null;
                  const picks = prices.filter((p) => row?.prices?.[p]).map((p) => `${p} ×${row!.prices[p]}`);
                  return (
                    <tr key={id} className="border-t border-border/60">
                      <td className="px-2 py-1.5">
                        <p className="font-medium">{name}</p>
                        {picks.length > 0 && <p className="text-[10px] text-muted-foreground">Would pay {picks.join(' · ')}</p>}
                      </td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{row?.yes ?? 0}</td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{row?.maybe ?? 0}</td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{row?.no ?? 0}</td>
                      <td className={cn('px-2 py-1.5 text-right tabular-nums font-semibold', keen !== null && keen >= 50 && 'text-accent')}>
                        {keen === null ? '—' : `${keen}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Keen = buy + maybe. Up to {voters} rider{voters === 1 ? '' : 's'} per item so far.
          </p>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3 mb-1.5">Suggestions ({suggestions.length})</p>
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
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
