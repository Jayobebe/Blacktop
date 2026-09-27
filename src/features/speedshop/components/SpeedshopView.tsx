import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Send, ThumbsDown, ThumbsUp, HelpCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import shopAsset from '@/assets/garage-shop.png.asset.json';
import { SHOP_ITEMS } from '../lib/catalogue';
import { answer, fetchResults, flushPending, sendSuggestion, useSurveyAnswers, type Interest, type ItemResult } from '../lib/surveyStore';
import { ItemPreview } from './ItemPreview';

const INTERESTS: { id: Interest; label: string; icon: React.ElementType }[] = [
  { id: 'yes', label: "I'd buy it", icon: ThumbsUp },
  { id: 'maybe', label: 'Maybe', icon: HelpCircle },
  { id: 'no', label: 'Not for me', icon: ThumbsDown },
];

/** The last slide asks what else riders would want. */
const SUGGEST = SHOP_ITEMS.length;

/**
 * Speedshop: the Blacktop World store. Nothing is on sale yet, so each item
 * is shown on the garage floor and riders say whether they'd buy it and what
 * they'd pay. Arrows (or swipes / arrow keys) move between items.
 */
export function SpeedshopView() {
  const answers = useSurveyAnswers();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, ItemResult> | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [sending, setSending] = useState(false);
  const total = SHOP_ITEMS.length + 1;
  const item = index < SUGGEST ? SHOP_ITEMS[index] : null;
  const mine = item ? answers[item.id] : undefined;
  const answered = SHOP_ITEMS.filter((i) => answers[i.id]).length;

  const go = (d: number) => setIndex((i) => (i + d + total) % total);

  useEffect(() => {
    void flushPending().then(() => fetchResults()).then(setResults);
  }, []);

  // Keyboard arrows on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe on the showcase.
  const swipe = useRef<number | null>(null);

  const choose = async (patch: { interest?: Interest; price?: string | null }) => {
    if (!item) return;
    await answer(item.id, patch);
    // Refresh the crowd numbers once the answer is in.
    void fetchResults().then((r) => r && setResults(r));
  };

  const submitSuggestion = async () => {
    setSending(true);
    const r = await sendSuggestion(suggestion);
    setSending(false);
    if (r === 'sent') {
      setSuggestion('');
      toast.success('Thanks, noted for the shop');
    } else if (r === 'limit') toast.error("That's plenty for today", { description: 'Try again tomorrow.' });
    else toast.error("Couldn't send that", { description: 'Check your connection and try again.' });
  };

  const crowd = item && results?.[item.id];
  const crowdTotal = crowd ? crowd.yes + crowd.maybe + crowd.no : 0;

  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom gap-3">
      <PageHeader title="Speedshop" subtitle="Opening soon · help us stock the shelves" backTo="/world" backLabel="Back to Blacktop World" />

      <div className="flex flex-col landscape:flex-row gap-3 flex-1 min-h-0">
        <div className="flex flex-col gap-2 landscape:w-[55%] landscape:h-[calc(100dvh-7rem)]">
          {/* Showcase: the garage floor with the item on it */}
          <div
            className="relative w-full aspect-[4/3] landscape:aspect-auto landscape:flex-1 landscape:min-h-0 overflow-hidden rounded-3xl border border-accent/60 bg-black select-none"
            style={{ boxShadow: '0 0 0 1px hsl(var(--accent) / 0.55), 0 18px 40px -12px rgba(0,0,0,0.85)' }}
            onPointerDown={(e) => (swipe.current = e.clientX)}
            onPointerUp={(e) => {
              if (swipe.current === null) return;
              const dx = e.clientX - swipe.current;
              swipe.current = null;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            <img src={shopAsset.url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 60%, transparent 35%, rgba(0,0,0,0.65) 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none opacity-40" style={{ background: 'linear-gradient(to top, hsl(var(--accent) / 0.18), transparent)' }} />

            {/* Item on the floor */}
            <div key={index} className="absolute inset-x-0 bottom-[9%] flex justify-center items-end animate-fade-in origin-bottom landscape:scale-[0.72]">
              {item ? (
                <ItemPreview kind={item.preview} />
              ) : (
                <div className="w-28 h-28 rounded-full border-2 border-dashed border-accent/70 bg-black/50 flex items-center justify-center">
                  <Lightbulb className="w-12 h-12 text-accent" />
                </div>
              )}
            </div>

            {/* Name plate + tag */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
              <div className="rounded-xl bg-black/75 border border-white/10 px-3 py-1.5 backdrop-blur-sm min-w-0">
                <p className="text-[9px] uppercase tracking-[0.25em] text-accent">{index + 1} / {total}</p>
                <p className="text-sm font-bold truncate">{item ? item.name : 'Something else?'}</p>
              </div>
              {item && <span className="shrink-0 rounded-md bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest px-2 py-1 rotate-3 shadow">
                Coming soon
              </span>}
            </div>
          </div>

          {/* Arrows */}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-14 landscape:h-11 w-16 rounded-2xl border-2 border-accent/60" onClick={() => go(-1)} aria-label="Previous item">
              <ChevronLeft className="w-7 h-7" />
            </Button>
            <div className="flex-1 flex justify-center gap-1.5 flex-wrap">
              {Array.from({ length: total }, (_, i) => {
                const done = i < SUGGEST && !!answers[SHOP_ITEMS[i].id];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={i < SUGGEST ? SHOP_ITEMS[i].name : 'Suggest something'}
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      i === index ? 'w-6 bg-accent' : done ? 'w-2.5 bg-accent/50' : 'w-2.5 bg-muted-foreground/30',
                    )}
                  />
                );
              })}
            </div>
            <Button variant="outline" className="h-14 landscape:h-11 w-16 rounded-2xl border-2 border-accent/60" onClick={() => go(1)} aria-label="Next item">
              <ChevronRight className="w-7 h-7" />
            </Button>
          </div>
        </div>

        {/* Survey */}
        <div className="landscape:flex-1 flex flex-col gap-3 rounded-3xl border border-border bg-card/50 p-4 landscape:overflow-y-auto">
          {item ? (
            <>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{item.blurb}</p>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Would you buy it?</p>
                <div className="grid grid-cols-3 gap-2">
                  {INTERESTS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => void choose({ interest: id })}
                      aria-pressed={mine?.interest === id}
                      className={cn(
                        'pressable flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-xs font-semibold',
                        mine?.interest === id ? 'bg-accent text-accent-foreground border-accent' : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mine && mine.interest !== 'no' && (
                <div className="animate-fade-in">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">What would you pay?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {item.prices.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => void choose({ price: mine.price === p ? null : p })}
                        aria-pressed={mine.price === p}
                        className={cn(
                          'pressable rounded-xl border py-2 text-sm font-bold tabular-nums',
                          mine.price === p ? 'bg-accent text-accent-foreground border-accent' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mine && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                  {crowd && crowdTotal >= 3 ? (
                    <span>
                      {Math.round(((crowd.yes + crowd.maybe) / crowdTotal) * 100)}% of {crowdTotal} riders are interested
                      {crowd.topPrice ? `, most would pay ${crowd.topPrice}` : ''}.
                    </span>
                  ) : (
                    <span>Saved. You're one of the first to weigh in.</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                What else should the Speedshop sell? Parts, kit, prints, anything you'd want with your Blacktop stats on it.
              </p>
              <Textarea
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value.slice(0, 500))}
                placeholder="e.g. a tyre-pressure gauge keyring, a tank pad with my crew code…"
                className="min-h-[96px]"
              />
              <Button onClick={() => void submitSuggestion()} disabled={sending || suggestion.trim().length < 3} className="h-11 gap-2">
                <Send className="w-4 h-4" /> Send suggestion
              </Button>
            </>
          )}

          <p className="text-[10px] text-muted-foreground/80">
            {answered} of {SHOP_ITEMS.length} answered · nothing is charged, this just tells us what to stock
          </p>
        </div>
      </div>
    </div>
  );
}
