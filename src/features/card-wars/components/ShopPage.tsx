import { useEffect, useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { useServerCap } from '@/lib/serverCaps';
import { REDLINE } from '../lib/redline';
import { useSettings } from '@/features/settings';
import { eventSound } from '@/lib/appSound';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { BANK_INFO, CATALOG, SHELVES, SPECS, SPIN_COST, categoryOf, type ShopCategory } from '../lib/catalog';
import { TIER_LADDER } from '@/features/cards/types';
import { COPIES, RULES, showRpm, tierOdds } from '../lib/rules';
import { buyCard, refreshShop, spin, useShop } from '../lib/shop';
import { REEL_LABELS } from '../lib/spinText';
import { CwCard } from './CwCard';
import { Marketplace } from './Marketplace';
import { RpmPill } from './RpmPill';
import { SpinPanel } from './SpinPanel';

/** The frames a catalogue card can wear, lowest first (`tierOfPrice` counts from 1). */
const SPIN_TIER_IDS = ['bronze', 'silver', 'gold', 'ruby', 'diamond', 'obsidian'] as const;

/** A shelf's name. The racing series keep their own. */
export function shelfLabel(id: ShopCategory): string {
  if (id === 'road') return tr("Road");
  if (id === 'race') return tr("Race");
  return BANK_INFO[id].label;
}

/**
 * The shop: six shelves of cards. A card is bought outright at its own price
 * (stronger cards cost more), or the shelf's wheel is spun for about a fifth
 * of that: a spin can land one of its cards, a dog tag tied to one of them,
 * RPM or another spin. The server decides every purchase and every spin; this
 * only shows what it answered.
 */
export function ShopPage({ onBack, disabled }: { onBack: () => void; disabled?: boolean }) {
  const shop = useShop();
  const { settings } = useSettings();
  // The seventh tab, once the server has it: where spare cards are sold or traded up.
  const [market, setMarket] = useState(false);
  const [shelf, setShelf] = useState<ShopCategory>('road');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    void refreshShop();
  }, []);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const cost = SPIN_COST[shelf];
  const bonus = shop.spins[shelf] ?? 0;
  const balance = shop.balance ?? 0;
  const redlineOn = useServerCap('cardWarsRedline');
  const tiersOn = useServerCap('cardWarsTiers');
  const cards = useMemo(() => CATALOG.filter((c) => categoryOf(c) === shelf).sort((a, b) => (a.price ?? 0) - (b.price ?? 0)), [shelf]);
  // Which tier a card from this shelf's wheel is likely to be: the lowest most, the highest least.
  const tierChances = useMemo(() => tierOdds(cards.map((c) => c.price ?? 0)), [cards]);
  const ownedHere = cards.filter((c) => shop.owned.includes(c.id)).length;
  const from = cards[0]?.price ?? 0;
  const to = cards[cards.length - 1]?.price ?? 0;

  const buy = async (id: string, name: string) => {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null);
    setBusy(true);
    const err = await buyCard(id);
    setBusy(false);
    if (!err) {
      eventSound('coin');
      toast.success(tr("{0} is yours", [name]), { description: tr("Swap it into your deck any time.") });
    } else if (err !== 'demo') toast.error(/rpm/i.test(err) ? tr("Not enough RPM") : tr("Could not buy this card"));
  };

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom max-w-3xl mx-auto w-full">
      <PageHeader title={tr("Shop")} subtitle={tr("Cards, spins and dog tags for RPM")} onBack={() => !busy && onBack()} right={<RpmPill balance={shop.balance} />} />

      <div className="cw-shelves" role="tablist" data-no-pull>
        {SHELVES.map((id) => {
          const extra = shop.spins[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={!market && shelf === id}
              className={cn('cw-shelf', !market && shelf === id && 'cw-shelf-on')}
              onClick={() => {
                setMarket(false);
                setShelf(id);
                setConfirm(null);
              }}
            >
              <b>{shelfLabel(id)}</b>
              <small className="font-mono">
                {tr("Spin {0}", [showRpm(SPIN_COST[id])])}
                {extra > 0 && <i> +{extra}</i>}
              </small>
            </button>
          );
        })}
        {(
          <button type="button" role="tab" aria-selected={market} className={cn('cw-shelf', market && 'cw-shelf-on')} onClick={() => setMarket(true)}>
            <b>{tr("Marketplace")}</b>
            <small>{tr("Sell · Trade up")}</small>
          </button>
        )}
      </div>

      {market ? (
        <Marketplace disabled={disabled} />
      ) : (
      <div className="space-y-5 mt-4">
        <section className="cw-panel" key={shelf}>
          <div className="flex items-start gap-3">
            <div className="cw-emblem cw-emblem-sm">
              <Dices />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{tr("Spin the {0} wheel", [shelfLabel(shelf)])}</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                {tr("One spin can land a card or a dog tag from this shelf, RPM, or another spin. A card you already own becomes another copy; with five, it pays 25% of its price. A dog tag you have gives half the spin back.")}
              </p>
            </div>
          </div>
          <SpinPanel
            button={bonus > 0 ? tr("Use a free spin ({0} left)", [bonus]) : balance < cost ? tr("A spin needs {0} RPM", [showRpm(cost)]) : tr("Spin for {0} RPM", [showRpm(cost)])}
            disabled={disabled || (bonus === 0 && balance < cost)}
            labels={REEL_LABELS}
            onSpin={() => spin(shelf)}
          >
            <p className="cw-odds font-mono">
              <span>{tr("Card {0}%", [RULES.odds.card])}</span>
              <span>{tr("Dog tag {0}%", [RULES.odds.tag])}</span>
              <span>{tr("Spin {0}%", [RULES.odds.spin])}</span>
              <span>{tr("RPM {0}%", [RULES.odds.rpm])}</span>
            </p>
            {tiersOn && tierChances.length > 1 && (
              <>
                <p className="text-[11px] text-muted-foreground leading-snug text-center">{tr("When a spin lands a card, the lower tiers come up more often:")}</p>
                <p className="cw-odds font-mono">
                  {tierChances.map(({ tier, share }) => (
                    <span key={tier}>
                      {TIER_LADDER.find((t) => t.id === SPIN_TIER_IDS[tier - 1])?.label} {Math.round(share * 100)}%
                    </span>
                  ))}
                </p>
              </>
            )}
            {redlineOn && (shelf === 'f1' || shelf === 'motogp') && !shop.wildcard && (
              <p className="text-[11px] text-muted-foreground leading-snug text-center">
                <b className="text-destructive">{tr("Wildcard dog tag: {0}% on a paid spin.", [REDLINE.odds])}</b>{' '}
                {REDLINE.pity - shop.wildPity <= 1 ? tr("Certain on your next paid spin") : tr("Certain within {0} more paid spins", [REDLINE.pity - shop.wildPity])}
              </p>
            )}
          </SpinPanel>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {tr("{0} cards", [shelfLabel(shelf)])} <span className="font-mono">{ownedHere}/{cards.length}</span>
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">{from === to ? tr("{0} RPM each", [showRpm(from)]) : tr("{0} to {1} RPM", [showRpm(from), showRpm(to)])}</span>
          </div>
          <div className="cw-grid-2">
            {cards.map((c) => {
              const copies = shop.owned.includes(c.id) ? shop.copies[c.id] ?? 1 : 0;
              // A card can be bought again, up to five copies.
              const owned = copies >= COPIES.most;
              const s = SPECS[c.id];
              const price = c.price ?? 0;
              return (
                <div key={c.id} className="space-y-1.5">
                  <CwCard card={c} badge={copies > 1 ? tr("Owned ×{0}", [copies]) : copies > 0 ? tr("Owned") : undefined} />
                  <p className="text-[10.5px] text-muted-foreground font-mono leading-tight text-center">
                    {s.year} · {s.hp} hp · {s.kg} kg · {formatSpeed(s.vmaxKmh / 1.609344, settings.speedUnit)} {getSpeedLabel(settings.speedUnit)}
                  </p>
                  <Button size="sm" variant={confirm === c.id ? 'default' : 'outline'} className="w-full h-11" disabled={owned || disabled || busy || balance < price} onClick={() => void buy(c.id, c.name)}>
                    {owned ? tr("Owned") : confirm === c.id ? tr("Tap again to buy") : balance < price ? tr("Needs {0} RPM", [showRpm(price)]) : copies > 0 ? tr("Another for {0} RPM", [showRpm(price)]) : tr("Buy for {0} RPM", [showRpm(price)])}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
