import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Gift, Lock, Plus, Repeat, Sparkles, Store, Swords, Tag, TrendingUp, Trophy, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useServerCap } from '@/lib/serverCaps';
import { useSettings } from '@/features/settings';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { SPECS, cardById } from '../lib/catalog';
import { CATEGORY_ICON, CATEGORY_ORDER, bestFive, categoriesOf, categoryLabel, deckRating, isBike, overall } from '../lib/ratings';
import { REPAIR_PART, RULES, WEAR_ROUND, repairCost, showRpm } from '../lib/rules';
import { repairCard, spin, spinTag, useShop } from '../lib/shop';
import { CARD_REEL_LABELS, TAG_REEL_LABELS } from '../lib/spinText';
import { parseOwnedTag } from '../lib/tagRules';
import { TAG_ORDER, deckTagBonus, tagDescription, tagName, tagSourceLine, tagStrength } from '../lib/tags';
import { REST_RECOVERY } from '../lib/wear';
import { updateVault, useVault } from '../lib/store';
import { eventSound } from '@/lib/appSound';
import { TradeSheet } from './TradeSheet';
import { claimSet, contractText, useProgress } from '../lib/progress';
import { Progress } from '@/components/ui/progress';
import { TAG_SLOTS, type BattleCard as Card, type DogTag } from '../types';
import { CwCard } from './CwCard';
import { DogTagPlate } from './DogTagPlate';
import { SpinPanel } from './SpinPanel';

type Open = { kind: 'card'; index: number } | { kind: 'pick'; index: number } | { kind: 'tag'; slot: number } | null;

const sheetClass = 'rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom';
const heading = 'text-[11px] font-semibold uppercase tracking-widest text-muted-foreground';

/**
 * Card Wars home: start a battle, and everything a battle is made of. The deck
 * (five cards, tap one to look at it, swap it or repair it), the three dog
 * tags, the shop, and what riding unlocks. A new player's first cards and dog
 * tags come from free spins, offered here until they're used.
 */
export function Garage({
  deck,
  tags,
  pool,
  basePool,
  availableTags,
  locked,
  riding,
  hours,
  playersOpen,
  onReplace,
  onBestDeck,
  onFieldDeck,
  onBattleComputer,
  onBattlePlayer,
  onShop,
}: {
  deck: Card[];
  /** The deck's dog tags. */
  tags: DogTag[];
  pool: Card[];
  /** The same cards unworn: what each would be when repaired. */
  basePool: Card[];
  availableTags: DogTag[];
  /** A battle is running: the deck can't change until it ends. */
  locked: boolean;
  riding: boolean;
  /** Hours ridden, for the cards riding unlocks. */
  hours: number;
  /** Player battles exist on this server. */
  playersOpen: boolean;
  onReplace: (type: 'deck' | 'tags', index: number, id: string) => void;
  /** Fields the five strongest cards. */
  onBestDeck: () => void;
  /** Fields these five cards. */
  onFieldDeck: (ids: string[]) => void;
  onBattleComputer: () => void;
  onBattlePlayer: () => void;
  onShop: () => void;
}) {
  const shop = useShop();
  const { beamIn } = useVault();
  const [trade, setTrade] = useState(false);
  const progress = useProgress();
  const [claiming, setClaiming] = useState<string | null>(null);
  const doneSets = new Set(progress.sets.filter((x) => x.claimed).map((x) => x.maker));
  const setBadge = (c: Card) => {
    const maker = cardById(c.archetype)?.manufacturer;
    return c.source !== 'collection' && maker && doneSets.has(maker) ? tr("{0} set", [maker]) : undefined;
  };
  // A raptured card beams back into the deck once, then the note clears.
  useEffect(() => {
    if (!beamIn?.length) return;
    eventSound('success');
    toast.success(tr("Your raptured card has beamed back"), { description: tr("Back in your deck at full condition.") });
    const t = setTimeout(() => updateVault({ beamIn: [] }), 2600);
    return () => clearTimeout(t);
  }, [beamIn]);
  const { settings } = useSettings();
  const [open, setOpen] = useState<Open>(null);
  const [filter, setFilter] = useState<'all' | 'car' | 'bike'>('all');
  const [repairing, setRepairing] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  /** The card sheet's Repair button has been pressed: its two options show. */
  const [repairOpen, setRepairOpen] = useState(false);
  /** A spare card tapped in the swap list: it's compared with the one coming out before anything changes. */
  const [candidate, setCandidate] = useState<Card | null>(null);
  const [potentialOpen, setPotentialOpen] = useState(false);
  const partRepair = useServerCap('cardWarsRepair');

  const frozen = locked || riding;
  const spare = useMemo(() => pool.filter((c) => !deck.some((d) => d.id === c.id)).sort((a, b) => overall(b) - overall(a)), [pool, deck]);
  const missing = 5 - deck.length;
  const ready = missing === 0 && tags.length === TAG_SLOTS;
  const rating = deckRating(deck);
  const freeCards = shop.freeSpins > 0;
  const freeTags = shop.freeTagSpins > 0;
  // Keep a spin box up after its last free spin, so the reel and the win still show.
  const [cardBoxOpen, setCardBoxOpen] = useState(false);
  const [tagBoxOpen, setTagBoxOpen] = useState(false);
  // Nothing to field and nothing spare: the free spins are the only way in.
  const mustSpin = missing > 0 && spare.length === 0 && freeCards;

  const current = open?.kind === 'card' || open?.kind === 'pick' ? deck[open.index] : undefined;
  const shown = open?.kind === 'pick' ? spare.filter((c) => filter === 'all' || (filter === 'bike') === isBike(c)) : [];
  const specs = current ? SPECS[current.id] : undefined;
  const condition = current?.condition ?? 100;
  const priceOf = (id: string) => cardById(id)?.price;
  const repairPrice = current ? repairCost(priceOf(current.id), condition) : 0;
  const partPrice = current && partRepair && condition < REPAIR_PART ? repairCost(priceOf(current.id), condition, REPAIR_PART) : 0;
  const balance = shop.balance ?? 0;
  /** The card as it would be repaired. */
  const unworn = (id: string) => basePool.find((c) => c.id === id);
  const currentNew = current ? unworn(current.id) : undefined;
  useEffect(() => {
    setRepairOpen(false);
    setCandidate(null);
  }, [open?.kind, open && 'index' in open ? open.index : -1]);

  // Potential: the strongest five if every card were repaired, each shown with the condition it's really in.
  const potential = useMemo(() => {
    if (basePool.length < 5) return null;
    const cards = bestFive(basePool);
    const now = cards.map((c) => pool.find((w) => w.id === c.id) ?? c);
    return {
      cards: cards.map((c, i) => ({ ...c, condition: now[i].condition ?? 100 })),
      rating: deckRating(cards),
      ratingNow: deckRating(now),
      cost: now.reduce((sum, c) => sum + repairCost(priceOf(c.id), c.condition ?? 100), 0),
      fielded: cards.every((c) => deck.some((d) => d.id === c.id)),
    };
  }, [basePool, pool, deck]);

  const repair = async (id: string, to = 100) => {
    setRepairing(true);
    const err = await repairCard(id, to);
    setRepairing(false);
    if (err) {
      if (err !== 'demo') toast.error(/not enough/i.test(err) ? tr("Not enough RPM") : /pending/i.test(err) ? tr("Still saving your last battle. Try again in a moment.") : tr("Repair failed"));
      return;
    }
    setRepairOpen(false);
    toast.success(to === 100 ? tr("Card repaired") : tr("Card repaired to {0}%", [to]));
    window.dispatchEvent(new Event('blacktop:refresh'));
  };

  const equipIfBetter = (won: DogTag) => {
    // Into the deck if its power is already carried and this one is stronger, or if there's a slot free.
    const at = tags.findIndex((t) => t.power === won.power);
    if (at >= 0) {
      if (tagStrength(won) > tagStrength(tags[at])) onReplace('tags', at, won.id);
    } else if (tags.length < TAG_SLOTS) onReplace('tags', tags.length, won.id);
  };

  const cardSpins = (freeCards || cardBoxOpen) && (
    <section className="cw-panel cw-panel-gift">
      <div className="flex items-start gap-2.5">
        <Gift className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{shop.freeSpins === 0 ? tr("No free card spins left") : shop.freeSpins === 1 ? tr("1 free card spin") : tr("{0} free card spins", [shop.freeSpins])}</p>
          <p className="text-xs text-muted-foreground leading-snug">
            {tr("Every free spin wins a card you don't have. Road cards come up most; an F1 or MotoGP card is a {0}% shot.", [RULES.freeOdds.f1 + RULES.freeOdds.motogp])}
          </p>
        </div>
      </div>
      <SpinPanel
        button={freeCards ? (cardBoxOpen ? tr("Spin again") : tr("Spin for a card")) : tr("No free spins left")}
        disabled={frozen || !freeCards}
        labels={CARD_REEL_LABELS}
        onSpin={() => {
          setCardBoxOpen(true);
          return spin(null);
        }}
        onWon={(r) => {
          if (!r.card) return;
          setFresh(r.card);
          // Straight into the deck while there's room.
          if (deck.length < 5) onReplace('deck', deck.length, r.card);
        }}
      />
      {!freeCards && cardBoxOpen && (
        <Button variant="outline" className="w-full h-11 mt-2" onClick={() => setCardBoxOpen(false)}>
          {tr("Done")}
        </Button>
      )}
    </section>
  );

  const tagSpins = (freeTags || tagBoxOpen) && (
    <section className="cw-panel cw-panel-gift">
      <div className="flex items-start gap-2.5">
        <Tag className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{shop.freeTagSpins === 0 ? tr("No free dog tag spins left") : shop.freeTagSpins === 1 ? tr("1 free dog tag spin") : tr("{0} free dog tag spins", [shop.freeTagSpins])}</p>
          <p className="text-xs text-muted-foreground leading-snug">{tr("Each spin wins a dog tag tied to a vehicle, which sets how strong it is. Your first spins cover every power; a deck carries three.")}</p>
        </div>
      </div>
      <SpinPanel
        button={freeTags ? (tagBoxOpen ? tr("Spin again") : tr("Spin for a dog tag")) : tr("No free spins left")}
        disabled={frozen || !freeTags}
        labels={TAG_REEL_LABELS}
        onSpin={() => {
          setTagBoxOpen(true);
          return spinTag();
        }}
        onWon={(r) => {
          const won = r.tag ? parseOwnedTag(r.tag) : null;
          if (won) equipIfBetter(won);
        }}
      />
      {!freeTags && tagBoxOpen && (
        <Button variant="outline" className="w-full h-11 mt-2" onClick={() => setTagBoxOpen(false)}>
          {tr("Done")}
        </Button>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      {riding && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
          {tr("Battles are off while you ride.")}
        </p>
      )}

      {/* Battle */}
      <section className="cw-panel cw-panel-hero">
        <div className="flex items-center gap-3">
          <div className="cw-emblem">
            <Swords />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold leading-tight">{locked ? tr("Battle in progress") : ready ? tr("Ready to battle") : tr("Build your deck")}</p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              {locked
                ? tr("Finish or forfeit it before changing your deck.")
                : ready
                  ? tr("Five cards and three dog tags. Pick a rival.")
                  : missing === 1
                    ? tr("Add 1 more card to battle.")
                    : missing > 1
                      ? tr("Add {0} more cards to battle.", [missing])
                      : tr("Choose your three dog tags to battle.")}
            </p>
          </div>
          {rating !== null && (
            <div data-tip="cw-rating" className="text-right shrink-0">
              <p className="font-mono text-3xl font-bold leading-none">
                {rating}
                {tags.length > 0 && (
                  <span className="ml-1 align-top text-sm text-accent" title={tr("From your dog tags")} aria-label={tr("Plus {0} from your dog tags", [deckTagBonus(tags)])}>
                    +{deckTagBonus(tags)}
                  </span>
                )}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{tr("Deck rating")}</p>
            </div>
          )}
        </div>

        {!mustSpin && (
          <div className="grid gap-2">
            <Button data-tip="cw-battle" className="h-14 text-base font-bold gap-2" disabled={riding || (!locked && !ready)} onClick={onBattleComputer}>
              <Swords className="w-5 h-5" />
              {locked ? tr("Back to the battle") : tr("Battle the computer")}
            </Button>
            {!locked && (
              <Button variant="outline" className="h-12 gap-2" disabled={riding || !ready || !playersOpen} onClick={onBattlePlayer}>
                <Users className="w-4 h-4" />
                {playersOpen ? tr("Battle a player") : tr("Player battles are coming soon")}
              </Button>
            )}
          </div>
        )}

        {!mustSpin && !locked && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground text-center">
            <span>
              {tr("Hard pays {0} RPM for a win · draw {1} · lose {2}", [showRpm(RULES.reward.win), showRpm(RULES.reward.draw), showRpm(RULES.reward.loss)])}
            </span>
            {shop.firstWin && (
              <span className="inline-flex items-center gap-1 text-accent font-semibold">
                <Sparkles className="w-3 h-3" />
                {tr("First win today: +{0} RPM", [showRpm(RULES.firstWin)])}
              </span>
            )}
            {shop.rewardsLeft !== null && RULES.dailyBattles !== null && (
              <span>{shop.rewardsLeft > 0 ? tr("Paid battles left today: {0}", [shop.rewardsLeft]) : tr("Today's paid battles are used up. Battles are just for fun until tomorrow.")}</span>
            )}
          </p>
        )}
      </section>

      {mustSpin && cardSpins}
      {mustSpin && tagSpins}

      {/* Deck */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
          <h2 className={heading}>
            {tr("Your deck")} <span className="font-mono">{deck.length}/5</span>
          </h2>
          {!frozen && (pool.length > 5 || (missing > 0 && spare.length > 0)) && (
            <div className="flex flex-wrap gap-1.5">
              {potential && pool.length > 5 && (
                <Button variant="outline" size="sm" className="h-10 gap-1.5 text-xs" onClick={() => setPotentialOpen(true)}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  {tr("Potential")}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-10 gap-1.5 text-xs" onClick={onBestDeck}>
                <Trophy className="w-3.5 h-3.5" />
                {pool.length > 5 ? tr("Field my best five") : tr("Fill with my best cards")}
              </Button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">{tr("Tap a card to look, swap or repair")}</p>
        <div data-tip="cw-deck" className="cw-grid cw-grid-deck">
          {Array.from({ length: 5 }, (_, i) => {
            const c = deck[i];
            return c ? (
              <CwCard key={c.id} card={c} showCondition badge={setBadge(c)} className={cn(fresh === c.id && 'cw-pop', beamIn?.includes(c.id) && 'cw-beam-in')} onClick={() => setOpen({ kind: 'card', index: i })} />
            ) : (
              <button
                key={i}
                type="button"
                className="cw-slot"
                disabled={frozen}
                onClick={() => {
                  if (spare.length) setOpen({ kind: 'pick', index: deck.length });
                  else toast(tr("No spare cards yet"), { description: freeCards ? tr("Use your free card spins first.") : tr("Win battles for RPM, then buy cards or spins in the shop.") });
                }}
              >
                <Plus />
                {tr("Add card")}
              </button>
            );
          })}
        </div>
      </section>

      {/* Dog tags */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className={heading}>{tr("Dog tags")}</h2>
          <span className="text-[11px] text-muted-foreground">{tr("Any three, one use each")}</span>
        </div>
        <div className="space-y-2">
          {Array.from({ length: TAG_SLOTS }, (_, slot) => {
            const tag = tags[slot];
            // What could go here instead: any tag not in another slot (before builds: whose power the other two don't carry).
            const others = availableTags.filter((t) => t.id !== tag?.id && !tags.some((x, i) => i !== slot && x.id === t.id)).length;
            return (
              <button key={slot} type="button" className="cw-tag-row" disabled={frozen} onClick={() => setOpen({ kind: 'tag', slot })}>
                {tag ? (
                  <DogTagPlate tag={tag} />
                ) : (
                  <span className="flex-1 text-left">
                    <b className="block text-sm">{tr("Dog tag {0}", [slot + 1])}</b>
                    <span className="text-[11px] text-destructive">{tr("Empty. Tap to choose a tag.")}</span>
                  </span>
                )}
                {others > 0 && (
                  <span className="cw-tag-more font-mono" aria-label={tr("{0} more to choose from", [others])}>
                    +{others}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </section>

      {!mustSpin && cardSpins}
      {!mustSpin && tagSpins}


      {progress.contracts.length > 0 && (
        <section className="cw-panel space-y-2.5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">{tr("Daily contracts")}</p>
            <span className="text-[11px] text-muted-foreground">{tr("New ones at midnight")}</span>
          </div>
          {progress.contracts.map((k) => (
            <div key={k.id} className={cn('space-y-1', k.paid && 'opacity-60')}>
              <p className="flex items-center justify-between gap-2 text-xs">
                <span>{contractText(k.id, k.target)}</span>
                <span className="font-mono text-accent shrink-0">{k.paid ? tr("Paid") : `+${showRpm(k.rpm)} RPM`}</span>
              </p>
              <div className="flex items-center gap-2">
                <Progress value={(k.progress / k.target) * 100} className="h-1.5" />
                <span className="text-[10.5px] font-mono text-muted-foreground shrink-0">
                  {k.progress}/{k.target}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {progress.sets.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Maker sets")}</h2>
            <span className="text-[11px] text-muted-foreground">{tr("Own every Road and Race card from a maker")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {progress.sets.map((x) => {
              const complete = x.owned >= x.total;
              return (
                <div key={x.maker} className={cn('cw-panel py-2 px-3 space-y-1.5', x.claimed && 'border-accent/50')}>
                  <p className="flex items-center justify-between text-xs font-semibold">
                    <span className="truncate">{x.maker}</span>
                    <span className="font-mono text-muted-foreground">
                      {x.owned}/{x.total}
                    </span>
                  </p>
                  <Progress value={(x.owned / x.total) * 100} className="h-1" />
                  {x.claimed ? (
                    <p className="text-[10.5px] text-accent">{tr("Set complete")}</p>
                  ) : complete ? (
                    <Button
                      size="sm"
                      className="w-full h-9"
                      disabled={claiming === x.maker}
                      onClick={async () => {
                        setClaiming(x.maker);
                        const r = await claimSet(x.maker);
                        setClaiming(null);
                        if (typeof r === 'string') {
                          if (r !== 'demo') toast.error(tr("Could not claim the set"));
                        } else {
                          eventSound('success');
                          toast.success(tr("{0} set complete: +{1} RPM", [x.maker, showRpm(r.rpm)]), { description: tr("And a {0} Overdrive dog tag.", [x.maker]) });
                        }
                      }}
                    >
                      {tr("Claim {0} RPM + dog tag", [showRpm(x.rpm)])}
                    </Button>
                  ) : (
                    <p className="text-[10.5px] text-muted-foreground">{tr("{0} RPM + dog tag", [showRpm(x.rpm)])}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Button variant="outline" className="w-full h-auto min-h-14 py-2 gap-2 justify-between px-4 whitespace-normal" onClick={onShop}>
        <span className="flex items-center gap-2 min-w-0">
          <Store className="w-5 h-5 shrink-0 text-accent" />
          <span className="text-left min-w-0">
            <span className="block text-sm font-semibold leading-tight">{tr("Shop")}</span>
            <span className="block text-[11px] text-muted-foreground font-normal leading-tight">{tr("Cards, spins and dog tags for RPM")}</span>
          </span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
      </Button>

      <Button variant="outline" className="w-full h-auto min-h-14 py-2 gap-2 justify-between px-4 whitespace-normal" onClick={() => setTrade(true)}>
        <span className="flex items-center gap-2 min-w-0">
          <Repeat className="w-5 h-5 shrink-0 text-accent" />
          <span className="text-left min-w-0">
            <span className="block text-sm font-semibold leading-tight">{tr("Trade cards")}</span>
            <span className="block text-[11px] text-muted-foreground font-normal leading-tight">{tr("Swap with another rider, card for card")}</span>
          </span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
      </Button>
      <TradeSheet open={trade} onClose={() => setTrade(false)} locked={frozen} />


      {/* Riding unlocks */}
      <section className="rounded-2xl border border-border/60 p-3 space-y-2.5">
        <h2 className={cn(heading, 'flex items-center gap-1.5')}>
          <Lock className="w-3 h-3 text-accent" />
          {tr("Ride to unlock")}
        </h2>
        {(
          [
            [tr("Demo card"), 10],
            [tr("Dev card"), 50],
          ] as const
        ).map(([name, goal]) => (
          <div key={goal} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 font-medium">{name}</span>
            <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (hours / goal) * 100)}%` }} />
            </span>
            <span className="font-mono text-muted-foreground shrink-0">{hours >= goal ? tr("Unlocked") : tr("{0} of {1} h", [Math.min(goal, hours).toFixed(1), goal])}</span>
          </div>
        ))}
      </section>

      {/* One card, looked at properly */}
      <Sheet open={open?.kind === 'card'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="bottom" className={sheetClass}>
          {open?.kind === 'card' && current && (
            <div className="space-y-4 max-w-md mx-auto">
              <SheetHeader className="text-left">
                <SheetTitle>{current.name}</SheetTitle>
                <SheetDescription>
                  {specs
                    ? tr("{0} · {1} hp · {2} kg · top speed {3} {4}", [specs.year, specs.hp, specs.kg, formatSpeed(specs.vmaxKmh / 1.609344, settings.speedUnit), getSpeedLabel(settings.speedUnit)])
                    : tr("From your own collection. It battles with a catalog card's ratings.")}
                </SheetDescription>
              </SheetHeader>
              <CwCard card={current} fresh={currentNew} size="full" className="max-w-[300px] mx-auto" />
              {currentNew && overall(currentNew) > overall(current) ? (
                <p className="text-xs text-center leading-snug">
                  <span className="text-destructive font-semibold">{tr("Battle rating {0} as it is", [overall(current)])}</span>
                  <span className="text-muted-foreground"> · {tr("{0} when repaired", [overall(currentNew)])}</span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground text-center leading-snug">{tr("The big number is its battle rating: how often it wins a round against every other card. 70 wins half.")}</p>
              )}
              <div className="rounded-2xl border border-border bg-card/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-accent" />
                  <p className="text-sm font-semibold flex-1">{tr("Condition")}</p>
                  <span className={cn('font-mono text-sm font-bold', condition < 50 && 'text-destructive')}>{condition}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <i className={cn('block h-full rounded-full', condition < 50 ? 'bg-destructive' : 'bg-foreground/80')} style={{ width: `${condition}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {tr("Every round a card fights costs it {0}% (race builds {1}%), and {2}% more for each round past its tenth in a battle. Sitting a battle out gives {3}% back. Under 50% its ratings start to drop.", [
                        WEAR_ROUND.road,
                        WEAR_ROUND.race,
                        WEAR_ROUND.extra,
                        REST_RECOVERY,
                      ])}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={repairOpen ? 'default' : 'outline'} className="h-12 gap-2" disabled={frozen || repairing || repairPrice === 0} aria-expanded={repairOpen} onClick={() => setRepairOpen((v) => !v)}>
                  <Wrench className="w-4 h-4" />
                  {repairPrice === 0 ? tr("Full condition") : tr("Repair")}
                </Button>
                <Button variant="outline" className="h-12 gap-2" disabled={frozen || spare.length === 0} onClick={() => setOpen({ kind: 'pick', index: open.index })}>
                  <Repeat className="w-4 h-4" />
                  {spare.length === 0 ? tr("No spares") : tr("Swap")}
                </Button>
              </div>
              {repairOpen && repairPrice > 0 && (
                <div className="rounded-2xl border border-accent/40 bg-card/50 p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground font-mono">{tr("You have {0} RPM", [showRpm(balance)])}</p>
                  <Button className="w-full h-12 justify-between gap-2" disabled={repairing || balance < repairPrice} onClick={() => void repair(current.id)}>
                    <span>{tr("Full repair, to 100%")}</span>
                    <span className="font-mono">{tr("{0} RPM", [showRpm(repairPrice)])}</span>
                  </Button>
                  {partPrice > 0 && (
                    <Button variant="outline" className="w-full h-12 justify-between gap-2" disabled={repairing || balance < partPrice} onClick={() => void repair(current.id, REPAIR_PART)}>
                      <span>{tr("Part repair, to {0}%", [REPAIR_PART])}</span>
                      <span className="font-mono">{tr("{0} RPM", [showRpm(partPrice)])}</span>
                    </Button>
                  )}
                  {partPrice > 0 && <p className="text-[11px] text-muted-foreground leading-snug">{tr("Ratings only fade under 50%, so a part repair brings them back for less.")}</p>}
                  {balance < (partPrice || repairPrice) && <p className="text-[11px] text-destructive">{tr("Not enough RPM")}</p>}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Choosing a card for a slot */}
      <Sheet open={open?.kind === 'pick'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="bottom" className={sheetClass}>
          {open?.kind === 'pick' && (
            <div className="space-y-3 max-w-2xl mx-auto">
              <SheetHeader className="text-left">
                <SheetTitle>{current ? tr("Swap {0}", [current.name]) : tr("Choose a card")}</SheetTitle>
                <SheetDescription>{current ? tr("Arrows show how each card compares with the one you're swapping out. Tap one to compare them side by side.") : tr("The number on each card is its battle rating. Strongest first.")}</SheetDescription>
              </SheetHeader>
              <div className="flex gap-1.5">
                {(
                  [
                    ['all', tr("All")],
                    ['car', tr("Cars")],
                    ['bike', tr("Bikes")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn('h-10 px-4 rounded-full border text-xs font-semibold', filter === id ? 'border-accent bg-accent/15 text-foreground' : 'border-border text-muted-foreground')}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shown.length ? (
                <div className="cw-grid-2 pb-2">
                  {shown.map((c) => (
                    <CwCard
                      key={c.id}
                      card={c}
                      showCondition
                      compareTo={current}
                      disabled={frozen}
                      onClick={() => {
                        // Into an empty slot there's nothing to compare with.
                        if (current) return setCandidate(c);
                        onReplace('deck', open.index, c.id);
                        setOpen(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{spare.length ? tr("None of that kind spare.") : tr("No spare cards yet. Win battles for RPM, then buy cards or spins in the shop.")}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* The card coming out beside the one going in, before anything changes */}
      <Dialog open={!!candidate} onOpenChange={(v) => !v && setCandidate(null)}>
        <DialogContent className="max-w-md">
          {candidate && current && open?.kind === 'pick' && (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle>{tr("Swap these cards?")}</DialogTitle>
                <DialogDescription>{tr("{0} comes out, {1} goes in.", [current.name, candidate.name])}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 items-start">
                <div className="space-y-1 min-w-0">
                  <p className={cn(heading, 'text-center')}>{tr("Out")}</p>
                  <CwCard card={current} showCondition />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className={cn(heading, 'text-center text-accent')}>{tr("In")}</p>
                  <CwCard card={candidate} showCondition />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card/50 px-2 py-1.5">
                {(
                  [
                    { key: 'rating', label: tr("Battle rating"), Icon: null, out: overall(current) as number | null, into: overall(candidate) as number | null },
                    ...CATEGORY_ORDER.filter((c) => categoriesOf(current).includes(c) || categoriesOf(candidate).includes(c)).map((c) => ({
                      key: c as string,
                      label: categoryLabel(c),
                      Icon: CATEGORY_ICON[c],
                      out: categoriesOf(current).includes(c) ? current.ratings[c] : null,
                      into: categoriesOf(candidate).includes(c) ? candidate.ratings[c] : null,
                    })),
                  ]
                ).map(({ key, label, Icon, out, into }) => {
                  const d = out === null || into === null ? 0 : into - out;
                  return (
                    <div key={key} className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1', key === 'rating' && 'border-b border-border/60 pb-1.5 mb-0.5')}>
                      <b className={cn('font-mono text-right', key === 'rating' ? 'text-lg' : 'text-sm')}>{out ?? '–'}</b>
                      <span className="flex items-center justify-center gap-1.5 w-28 text-[11px] text-muted-foreground">
                        {Icon && <Icon className="w-3.5 h-3.5 text-accent" aria-hidden />}
                        {label}
                      </span>
                      <b className={cn('font-mono flex items-center gap-1', key === 'rating' ? 'text-lg' : 'text-sm')}>
                        {into ?? '–'}
                        {d > 0 && <ArrowUp className="cw-up w-3.5 h-3.5" aria-label={tr("Higher")} />}
                        {d < 0 && <ArrowDown className="cw-down w-3.5 h-3.5" aria-label={tr("Lower")} />}
                      </b>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12" onClick={() => setCandidate(null)}>
                  {tr("Cancel")}
                </Button>
                <Button
                  className="h-12 gap-2"
                  disabled={frozen}
                  onClick={() => {
                    onReplace('deck', open.index, candidate.id);
                    setCandidate(null);
                    setOpen(null);
                  }}
                >
                  <Repeat className="w-4 h-4" />
                  {tr("Swap")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Potential: the best deck there is here, once its cards are repaired */}
      <Sheet open={potentialOpen} onOpenChange={setPotentialOpen}>
        <SheetContent side="bottom" className={sheetClass}>
          {potential && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <SheetHeader className="text-left">
                <SheetTitle>{tr("Potential")}</SheetTitle>
                <SheetDescription>{tr("Your strongest five with every card repaired. Ratings here are at full condition; the bar under a card is the condition it's in now.")}</SheetDescription>
              </SheetHeader>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-4xl font-bold leading-none">{potential.rating}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{tr("Deck rating, repaired")}</p>
                </div>
                <div className="text-right">
                  <p className={cn('font-mono text-xl font-bold leading-none', (potential.ratingNow ?? 0) < (potential.rating ?? 0) && 'text-destructive')}>{potential.ratingNow}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{tr("As they are now")}</p>
                </div>
              </div>
              <div className="cw-grid cw-grid-deck">
                {potential.cards.map((c) => (
                  <CwCard key={c.id} card={c} showCondition badge={deck.some((d) => d.id === c.id) ? tr("In deck") : undefined} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {potential.cost > 0 ? tr("Repairing all five would cost {0} RPM. You have {1}.", [showRpm(potential.cost), showRpm(balance)]) : tr("All five are at full condition.")}
              </p>
              <Button
                className="w-full h-12 gap-2"
                disabled={frozen || potential.fielded}
                onClick={() => {
                  onFieldDeck(potential.cards.map((c) => c.id));
                  setPotentialOpen(false);
                }}
              >
                <Repeat className="w-4 h-4" />
                {potential.fielded ? tr("This is your deck") : tr("Swap to this deck")}
              </Button>
              {!potential.fielded && potential.cost > 0 && <p className="text-[11px] text-muted-foreground leading-snug pb-2">{tr("Then tap a card in your deck to repair it.")}</p>}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Choosing the tag for a slot: its own power or the one the deck leaves out */}
      <Sheet open={open?.kind === 'tag'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="bottom" className={sheetClass}>
          {open?.kind === 'tag' && (
            <div className="space-y-4 max-w-md mx-auto">
              <SheetHeader className="text-left">
                <SheetTitle>{tr("Choose a dog tag")}</SheetTitle>
                <SheetDescription>
                  {tr("A deck carries three dog tags. Mix the powers or double up: two or three of the same power is a build like any other.")}
                </SheetDescription>
              </SheetHeader>
              {TAG_ORDER.map((power) => (
                <div key={power} className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold">{tagName(power)}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {tagDescription(power)} {tagSourceLine(power)}
                    </p>
                  </div>
                  {availableTags
                    .filter((t) => t.power === power)
                    .sort((a, b) => tagStrength(b) - tagStrength(a))
                    .map((t) => {
                      const inUse = tags[open.slot]?.id === t.id;
                      // Under builds a tag sits in one slot only.
                      const elsewhere = tags.some((x, i) => i !== open.slot && x.id === t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={cn('cw-tag-row', inUse && 'cw-tag-row-on')}
                          disabled={inUse || elsewhere || frozen}
                          onClick={() => {
                            onReplace('tags', Math.min(open.slot, tags.length), t.id);
                            setOpen(null);
                          }}
                        >
                          <DogTagPlate tag={t} />
                          {(inUse || elsewhere) && <span className="text-[11px] font-semibold text-accent shrink-0">{inUse ? tr("In use") : tr("In another slot")}</span>}
                        </button>
                      );
                    })}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground leading-snug pb-2">
                {tr("More dog tags: spins in the shop can land one tied to a vehicle from that shelf. Beat a rider's lap on a Track Day board and you take theirs: turn their card over in your vault to spin for its power.")}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
