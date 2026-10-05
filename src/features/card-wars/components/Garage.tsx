import { useMemo, useState } from 'react';
import { ChevronRight, Gift, Lock, Plus, Repeat, Sparkles, Store, Swords, Tag, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSettings } from '@/features/settings';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { SPECS, cardById } from '../lib/catalog';
import { deckRating, isBike, overall } from '../lib/ratings';
import { RULES, V2, repairCost } from '../lib/rules';
import { repairCard, spin, spinTag, useShop } from '../lib/shop';
import { CARD_REEL_LABELS, TAG_REEL_LABELS } from '../lib/spinText';
import { parseOwnedTag } from '../lib/tagRules';
import { TAG_ORDER, tagDescription, tagName, tagSourceLine, tagStrength, type TagPower } from '../lib/tags';
import { REST_RECOVERY, WEAR_PER_BATTLE } from '../lib/wear';
import type { BattleCard as Card, DogTag } from '../types';
import { CwCard } from './CwCard';
import { DogTagPlate } from './DogTagPlate';
import { SpinPanel } from './SpinPanel';

type Open = { kind: 'card'; index: number } | { kind: 'pick'; index: number } | { kind: 'tag'; power: TagPower } | null;

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
  availableTags,
  locked,
  riding,
  hours,
  playersOpen,
  onReplace,
  onBestDeck,
  onBattleComputer,
  onBattlePlayer,
  onShop,
}: {
  deck: Card[];
  /** The deck's dog tags. */
  tags: DogTag[];
  pool: Card[];
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
  onBattleComputer: () => void;
  onBattlePlayer: () => void;
  onShop: () => void;
}) {
  const shop = useShop();
  const { settings } = useSettings();
  const [open, setOpen] = useState<Open>(null);
  const [filter, setFilter] = useState<'all' | 'car' | 'bike'>('all');
  const [repairing, setRepairing] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const frozen = locked || riding;
  const spare = useMemo(() => pool.filter((c) => !deck.some((d) => d.id === c.id)).sort((a, b) => overall(b) - overall(a)), [pool, deck]);
  const missing = 5 - deck.length;
  const ready = missing === 0 && tags.length === 3;
  const rating = deckRating(deck);
  const freeCards = shop.freeSpins > 0;
  const freeTags = V2 && shop.freeTagSpins > 0;
  // Nothing to field and nothing spare: the free spins are the only way in.
  const mustSpin = missing > 0 && spare.length === 0 && freeCards;

  const current = open?.kind === 'card' || open?.kind === 'pick' ? deck[open.index] : undefined;
  const shown = open?.kind === 'pick' ? spare.filter((c) => filter === 'all' || (filter === 'bike') === isBike(c)) : [];
  const specs = current ? SPECS[current.id] : undefined;
  const condition = current?.condition ?? 100;
  const repairPrice = current ? repairCost(cardById(current.id)?.price, condition) : 0;

  const repair = async (id: string) => {
    setRepairing(true);
    const err = await repairCard(id);
    setRepairing(false);
    if (err) {
      if (err !== 'demo') toast.error(/not enough/i.test(err) ? tr("Not enough RPM") : /pending/i.test(err) ? tr("Still saving your last battle. Try again in a moment.") : tr("Repair failed"));
      return;
    }
    toast.success(tr("Card repaired"));
    window.dispatchEvent(new Event('blacktop:refresh'));
  };

  const equipIfBetter = (won: DogTag) => {
    const at = tags.findIndex((t) => t.power === won.power);
    if (at < 0) onReplace('tags', tags.length, won.id);
    else if (tagStrength(won) > tagStrength(tags[at])) onReplace('tags', at, won.id);
  };

  const cardSpins = freeCards && (
    <section className="cw-panel cw-panel-gift">
      <div className="flex items-start gap-2.5">
        <Gift className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{shop.freeSpins === 1 ? tr("1 free card spin") : tr("{0} free card spins", [shop.freeSpins])}</p>
          <p className="text-xs text-muted-foreground leading-snug">
            {tr("Every free spin wins a card you don't have. Road cards come up most; an F1 or MotoGP card is a {0}% shot.", [RULES.freeOdds.f1 + RULES.freeOdds.motogp])}
          </p>
        </div>
      </div>
      <SpinPanel
        button={tr("Spin for a card")}
        disabled={frozen}
        labels={CARD_REEL_LABELS}
        onSpin={() => spin(null)}
        onWon={(r) => {
          if (!r.card) return;
          setFresh(r.card);
          // Straight into the deck while there's room.
          if (deck.length < 5) onReplace('deck', deck.length, r.card);
        }}
      />
    </section>
  );

  const tagSpins = freeTags && (
    <section className="cw-panel cw-panel-gift">
      <div className="flex items-start gap-2.5">
        <Tag className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{shop.freeTagSpins === 1 ? tr("1 free dog tag spin") : tr("{0} free dog tag spins", [shop.freeTagSpins])}</p>
          <p className="text-xs text-muted-foreground leading-snug">{tr("Each spin wins a dog tag tied to a vehicle, which sets how strong it is. Your first three cover all three powers.")}</p>
        </div>
      </div>
      <SpinPanel
        button={tr("Spin for a dog tag")}
        disabled={frozen}
        labels={TAG_REEL_LABELS}
        onSpin={spinTag}
        onWon={(r) => {
          const won = r.tag ? parseOwnedTag(r.tag) : null;
          if (won) equipIfBetter(won);
        }}
      />
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
            <div className="text-right shrink-0">
              <p className="font-mono text-3xl font-bold leading-none">{rating}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{tr("Deck rating")}</p>
            </div>
          )}
        </div>

        {!mustSpin && (
          <div className="grid gap-2">
            <Button className="h-14 text-base font-bold gap-2" disabled={riding || (!locked && !ready)} onClick={onBattleComputer}>
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
            <span>{tr("Win {0} RPM · draw {1} · lose {2}", [RULES.reward.win, RULES.reward.draw, RULES.reward.loss])}</span>
            {shop.firstWin && RULES.firstWin > 0 && (
              <span className="inline-flex items-center gap-1 text-accent font-semibold">
                <Sparkles className="w-3 h-3" />
                {tr("First win today: +{0} RPM", [RULES.firstWin])}
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
        <div className="flex items-baseline justify-between mb-2">
          <h2 className={heading}>
            {tr("Your deck")} <span className="font-mono">{deck.length}/5</span>
          </h2>
          {!frozen && pool.length > 5 ? (
            <button type="button" className="text-xs font-semibold text-accent glove-hit" onClick={onBestDeck}>
              {tr("Field my best five")}
            </button>
          ) : !frozen && missing > 0 && spare.length > 0 ? (
            <button type="button" className="text-xs font-semibold text-accent glove-hit" onClick={onBestDeck}>
              {tr("Fill with my best cards")}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">{tr("Tap a card to look, swap or repair")}</span>
          )}
        </div>
        <div className="cw-grid">
          {Array.from({ length: 5 }, (_, i) => {
            const c = deck[i];
            return c ? (
              <CwCard key={c.id} card={c} showCondition className={cn(fresh === c.id && 'cw-pop')} onClick={() => setOpen({ kind: 'card', index: i })} />
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
          <span className="text-[11px] text-muted-foreground">{tr("One use each per battle")}</span>
        </div>
        <div className="space-y-2">
          {TAG_ORDER.map((power) => {
            const tag = tags.find((t) => t.power === power);
            const others = availableTags.filter((t) => t.power === power && t.id !== tag?.id).length;
            return (
              <button key={power} type="button" className="cw-tag-row" disabled={frozen} onClick={() => setOpen({ kind: 'tag', power })}>
                {tag ? (
                  <DogTagPlate tag={tag} />
                ) : (
                  <span className="flex-1 text-left">
                    <b className="block text-sm">{tagName(power)}</b>
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

      <Button variant="outline" className="w-full h-14 gap-2 justify-between px-4" onClick={onShop}>
        <span className="flex items-center gap-2">
          <Store className="w-5 h-5 text-accent" />
          <span className="text-left">
            <span className="block text-sm font-semibold leading-tight">{tr("Shop")}</span>
            <span className="block text-[11px] text-muted-foreground font-normal leading-tight">{V2 ? tr("Cards, spins and dog tags for RPM") : tr("Cards and spins for RPM")}</span>
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Button>

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
              <CwCard card={current} size="full" className="max-w-[300px] mx-auto" />
              <p className="text-[11px] text-muted-foreground text-center leading-snug">{tr("The big number is its battle rating: how often it wins a round against every other card. 70 wins half.")}</p>
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
                  {tr("A battle costs a card that fights {0}% (race builds {1}%); sitting one out gives {2}% back. Under 50% its ratings start to drop.", [
                    WEAR_PER_BATTLE.factory,
                    WEAR_PER_BATTLE.race,
                    REST_RECOVERY,
                  ])}
                </p>
                {repairPrice > 0 && (
                  <Button variant="outline" className="w-full h-11 gap-2" disabled={frozen || repairing || (shop.balance ?? 0) < repairPrice} onClick={() => void repair(current.id)}>
                    <Wrench className="w-4 h-4" />
                    {(shop.balance ?? 0) < repairPrice ? tr("Repair needs {0} RPM", [repairPrice]) : tr("Repair to 100% for {0} RPM", [repairPrice])}
                  </Button>
                )}
              </div>
              <Button className="w-full h-12 gap-2" disabled={frozen || spare.length === 0} onClick={() => setOpen({ kind: 'pick', index: open.index })}>
                <Repeat className="w-4 h-4" />
                {spare.length === 0 ? tr("No spare cards to swap in") : tr("Swap this card")}
              </Button>
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
                <SheetDescription>{current ? tr("Arrows show how each card compares with the one you're swapping out.") : tr("The number on each card is its battle rating. Strongest first.")}</SheetDescription>
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

      {/* Choosing the tag for a power */}
      <Sheet open={open?.kind === 'tag'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="bottom" className={sheetClass}>
          {open?.kind === 'tag' && (
            <div className="space-y-3 max-w-md mx-auto">
              <SheetHeader className="text-left">
                <SheetTitle>{tagName(open.power)}</SheetTitle>
                <SheetDescription>
                  {tagDescription(open.power)} {V2 && tagSourceLine(open.power)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2">
                {availableTags
                  .filter((t) => t.power === open.power)
                  .sort((a, b) => tagStrength(b) - tagStrength(a))
                  .map((t) => {
                    const inUse = tags.some((x) => x.id === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={cn('cw-tag-row', inUse && 'cw-tag-row-on')}
                        disabled={inUse || frozen}
                        onClick={() => {
                          const at = tags.findIndex((x) => x.power === open.power);
                          onReplace('tags', at >= 0 ? at : tags.length, t.id);
                          setOpen(null);
                        }}
                      >
                        <DogTagPlate tag={t} />
                        {inUse && <span className="text-[11px] font-semibold text-accent shrink-0">{tr("In use")}</span>}
                      </button>
                    );
                  })}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug pb-2">
                {V2
                  ? tr("More dog tags: spins in the shop can land one tied to a vehicle from that shelf. Beat a rider's lap on a Track Day board and you take theirs.")
                  : tr("A tag from a bike rider does more with a bike, and a car driver's with a car. Beat riders' lap times on Track Day to win their dog tags.")}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
