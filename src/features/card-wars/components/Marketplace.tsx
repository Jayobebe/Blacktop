import { useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, Coins } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isThermal } from '@/lib/thermal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { CATALOG, categoryOf, type ShopCategory } from '../lib/catalog';
import { MARKETPLACE, TRADE_UP, showRpm } from '../lib/rules';
import { sellCard, tradeUp, useShop } from '../lib/shop';
import { REEL_LABELS } from '../lib/spinText';
import { useVault } from '../lib/store';
import { Coin } from './Coin';
import { CwCard } from './CwCard';
import { shelfLabel } from './ShopPage';
import { SpinPanel } from './SpinPanel';

/** The tier a trade-up spins for: road → race → GTLM or TT (by what most of the five are) → F1 / MotoGP. The top tier has none. */
function nextTier(tier: ShopCategory, cars: number): ShopCategory | null {
  if (tier === 'road') return 'race';
  if (tier === 'race') return cars >= 3 ? 'gtlm' : 'tt';
  if (tier === 'gtlm') return 'f1';
  if (tier === 'tt') return 'motogp';
  return null;
}

function refusal(message: string, fallback: string): string {
  if (/keep five/i.test(message)) return tr("You keep at least five cards for a deck.");
  if (/closed for today/i.test(message)) return tr("No sales left today. Back tomorrow.");
  if (/current battle/i.test(message)) return tr("Finish your current battle first.");
  if (/not owned/i.test(message)) return tr("You don't own that card any more.");
  return fallback;
}

/**
 * The Blacktop Marketplace: the two things a spare card is good for. Sell it
 * to the house on a coin flip, or put five of one tier into a trade-up for a
 * spin at the tier above. The server decides both; this only shows its answer.
 */
export function Marketplace({ disabled }: { disabled?: boolean }) {
  const shop = useShop();
  // Cards fielded right now carry an In deck pill, so nobody sells or trades one away by mistake.
  const { deck } = useVault();
  const inDeck = (id: string) => deck.includes(id);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [tab, setTab] = useState<'sell' | 'up'>('sell');
  /** A sale: the coin is in the air until `landed`, then what it paid shows. */
  const [flip, setFlip] = useState<{ heads: boolean; rpm: number; name: string; landed: boolean } | null>(null);
  useEffect(() => {
    if (!flip || flip.landed) return;
    const t = setTimeout(() => {
      setFlip((f) => (f ? { ...f, landed: true } : f));
      haptics.light();
      eventSound(flip.heads ? 'success' : 'coin');
    }, 1450);
    return () => clearTimeout(t);
  }, [flip]);
  /** The five for a trade-up: ids, a card named once for each copy given. */
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const copiesOf = (id: string) => (shop.owned.includes(id) ? shop.copies[id] ?? 1 : 0);
  const mine = useMemo(() => CATALOG.filter((c) => shop.owned.includes(c.id) && (c.price ?? 0) > 0).sort((a, b) => (a.price ?? 0) - (b.price ?? 0)), [shop.owned]);
  const total = mine.reduce((n, c) => n + copiesOf(c.id), 0);
  const left = shop.marketLeft ?? MARKETPLACE.daily;
  const canSell = !disabled && !busy && left > 0 && total > MARKETPLACE.keep;

  const sell = async (id: string, name: string) => {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null);
    setBusy(true);
    const res = await sellCard(id);
    setBusy(false);
    if (typeof res === 'string') {
      if (res !== 'demo') toast.error(refusal(res, tr("Could not sell this card")));
      return;
    }
    haptics.light();
    eventSound('coin');
    const still = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setFlip({ heads: res.heads, rpm: res.rpm, name, landed: still });
    setPicked((p) => p.filter((x) => x !== id));
  };

  // Trade-up: the first card picked sets the tier; the rest have to match it.
  const tier = picked.length ? categoryOf(CATALOG.find((c) => c.id === picked[0])!) : null;
  const cars = picked.filter((id) => CATALOG.find((c) => c.id === id)?.vehicle === 'car').length;
  const next = tier ? nextTier(tier, cars) : null;
  const top = tier !== null && next === null;
  const full = picked.length === TRADE_UP.cards;
  const givenOf = (id: string) => picked.filter((x) => x === id).length;
  const toggle = (id: string) => {
    haptics.light();
    setPicked((p) => {
      const given = p.filter((x) => x === id).length;
      // Tapping adds another copy while there's one to give and room for it; then it takes them all back.
      if (given < copiesOf(id) && p.length < TRADE_UP.cards) return [...p, id];
      return p.filter((x) => x !== id);
    });
  };
  const upCards = tier ? mine.filter((c) => categoryOf(c) === tier) : mine;
  const enough = total - TRADE_UP.cards >= TRADE_UP.keep;

  return (
    <div className="space-y-4 mt-4">
      <div role="tablist" aria-label={tr("Blacktop Marketplace")} className="flex rounded-xl border border-accent/40 bg-background/60 p-0.5 text-sm">
        {(
          [
            ['sell', tr("Sell"), Coins],
            ['up', tr("Trade up"), ArrowUpCircle],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn('flex-1 min-h-11 flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors', tab === id ? 'bg-accent text-accent-foreground' : 'text-accent/80')}
            onClick={() => setTab(id)}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <Dialog open={!!flip} onOpenChange={(v) => !v && flip?.landed && setFlip(null)}>
        <DialogContent className="max-w-xs">
          {flip && (
            <>
              <DialogHeader>
                <DialogTitle>{flip.landed ? tr("{0} sold.", [flip.name]) : tr("Selling {0}", [flip.name])}</DialogTitle>
                <DialogDescription>{tr("Heads pays {0}% of its price, tails {1}%.", [MARKETPLACE.high * 100, MARKETPLACE.low * 100])}</DialogDescription>
              </DialogHeader>
              <div className="cw-sale" role="status">
                <Coin heads={flip.heads} className="cw-coin-lg" />
                {flip.landed && (
                  <>
                    <p className={cn('cw-sale-side', flip.heads ? 'cw-sale-heads' : 'cw-sale-tails')}>{flip.heads ? tr("Heads") : tr("Tails")}</p>
                    <p className="cw-won-figure font-mono">
                      <Coins aria-hidden />
                      {tr("+{0} RPM", [showRpm(flip.rpm)])}
                    </p>
                    {shop.balance !== null && <p className="cw-won-caption font-mono">{tr("You have {0} RPM", [showRpm(shop.balance)])}</p>}
                  </>
                )}
              </div>
              <Button className="w-full h-12" disabled={!flip.landed} onClick={() => setFlip(null)}>
                {tr("Done")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {tab === 'sell' && (
      <section className="cw-panel">
        <p className="text-xs text-muted-foreground leading-snug">
          {tr("Sell a card to the house on a coin flip: heads pays {0}% of its price, tails {1}%.", [MARKETPLACE.high * 100, MARKETPLACE.low * 100])}
        </p>
        <p className="text-xs font-mono text-muted-foreground">
          {left === 0 ? tr("No sales left today. Back tomorrow.") : left === 1 ? tr("1 sale left today") : tr("{0} sales left today", [left])}
          {total <= MARKETPLACE.keep && left > 0 && <> · {tr("You keep at least five cards for a deck.")}</>}
        </p>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("Nothing to sell yet. Cards you've bought, won or spun can be sold here.")}</p>
        ) : (
          <div className="cw-grid-2">
            {mine.map((c) => {
              const n = copiesOf(c.id);
              const price = c.price ?? 0;
              return (
                <div key={c.id} className="space-y-1.5">
                  <CwCard card={c} badge={inDeck(c.id) ? (n > 1 ? `${tr("In deck")} · ×${n}` : tr("In deck")) : n > 1 ? `×${n}` : undefined} />
                  <p className="text-[10.5px] text-muted-foreground font-mono leading-tight text-center">
                    {tr("{0} or {1} RPM", [showRpm(Math.max(1, Math.round(price * MARKETPLACE.low))), showRpm(Math.max(1, Math.round(price * MARKETPLACE.high)))])}
                  </p>
                  <Button size="sm" variant={confirm === c.id ? 'default' : 'outline'} className="w-full h-11" disabled={!canSell} onClick={() => void sell(c.id, c.name)}>
                    {confirm === c.id ? tr("Tap again to flip") : tr("Sell")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {tab === 'up' && (
      <section className="cw-panel">
        <p className="text-xs text-muted-foreground leading-snug">
          {tr("Pick five cards of one tier. They're traded for one spin: a card from the next tier up, a dog tag, a free spin or RPM.")}
        </p>
        {!enough ? (
          <p className="text-sm text-muted-foreground">{tr("A trade-up takes five cards and leaves you five for a deck, so it needs ten.")}</p>
        ) : (
          <>
            <div className="cw-grid-2">
              {upCards.map((c) => {
                const n = copiesOf(c.id);
                const given = givenOf(c.id);
                return (
                  <CwCard
                    key={c.id}
                    card={c}
                    selected={given > 0}
                    disabled={busy || disabled}
                    badge={given > 0 ? tr("{0} of {1}", [given, n]) : inDeck(c.id) ? (n > 1 ? `${tr("In deck")} · ×${n}` : tr("In deck")) : n > 1 ? `×${n}` : undefined}
                    onClick={() => toggle(c.id)}
                    className={cn(full && given === 0 && 'opacity-50')}
                  />
                );
              })}
            </div>
            <SpinPanel
              button={
                !full
                  ? TRADE_UP.cards - picked.length === 1
                    ? tr("Pick 1 more")
                    : tr("Pick {0} more", [TRADE_UP.cards - picked.length])
                  : tr("Trade up five {0} cards", [shelfLabel(tier!)])
              }
              disabled={disabled || !full}
              labels={REEL_LABELS}
              onSpin={async () => {
                const res = await tradeUp(picked);
                if (typeof res === 'string') {
                  // Said here in its own words; the panel only knows a spin's refusals.
                  if (res !== 'demo') toast.error(refusal(res, tr("Could not trade up")));
                  return 'demo';
                }
                setPicked([]);
                return res;
              }}
            >
              <p className="cw-odds font-mono">
                {top ? (
                  <>
                    <span>{tr("Dog tag {0}%", [35])}</span>
                    <span>{tr("Spin {0}%", [20])}</span>
                    <span>{tr("RPM {0}%", [45])}</span>
                  </>
                ) : (
                  <>
                    <span>{next ? tr("{0} card {1}%", [shelfLabel(next), 25]) : tr("Card {0}%", [25])}</span>
                    <span>{tr("Dog tag {0}%", [20])}</span>
                    <span>{tr("Spin {0}%", [15])}</span>
                    <span>{tr("RPM {0}%", [40])}</span>
                  </>
                )}
              </p>
              {top && <p className="text-xs text-muted-foreground">{tr("This is the top tier: there's no card on its wheel.")}</p>}
            </SpinPanel>
          </>
        )}
      </section>
      )}
    </div>
  );
}
