import { useEffect } from 'react';
import { ChevronRight, Coins, Gift, Swords, Wrench } from 'lucide-react';
import { useServerCap } from '@/lib/serverCaps';
import { useDemoMode } from '@/lib/demoMode';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { ARCADE_PAY, BUILDS, showRpm } from '../lib/rules';
import { refreshShop, useShop } from '../lib/shop';
import { deckTagBonus } from '../lib/tags';
import { useVault } from '../lib/store';
import { conditionOf, withWear } from '../lib/wear';
import { CwCard } from './CwCard';
import { DogTagPlate } from './DogTagPlate';
import '../card-wars.css';

/**
 * Card Wars on the Arcade page: where the other games show a best score, this
 * shows the deck as it stands (each card's condition, the three dog tags, RPM,
 * battles left today) and what needs doing before the next battle. It takes
 * whatever room the page has left. The deck is the snapshot Card Wars keeps
 * with the vault, so nothing is worked out twice; RPM is asked for once.
 */
export function CardWarsArcadePanel({ onOpen }: { onOpen: () => void }) {
  const vault = useVault();
  const shop = useShop();
  const live = useServerCap('cardWars');
  const { enabled: demo } = useDemoMode();
  useEffect(() => {
    if (live && !demo) void refreshShop();
  }, [live, demo]);

  const view = vault.summary;
  const cards = (view?.cards ?? []).map((c) => withWear(c, conditionOf(vault.wear, c.id)));
  const worn = cards.filter((c) => (c.condition ?? 100) < 50).length;
  const spins = shop.freeSpins + shop.freeTagSpins;
  const inBattle = !!vault.run && !vault.run.result;

  return (
    <button type="button" onClick={onOpen} className="cw-arcade pressable col-span-2 text-left" aria-label={tr("Open Card Wars")}>
      <span className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Swords className="w-5 h-5 text-accent" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold tracking-tight text-white leading-none">{tr("Card Wars")}</span>
          <span className="block text-[10px] text-muted-foreground mt-1 truncate">
            {inBattle ? tr("Battle in progress: round {0}", [vault.run!.round + 1]) : tr("Real cars and bikes, five to a deck")}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </span>

      {cards.length > 0 ? (
        <>
          <span className="cw-arcade-stats">
            <span>
              <b className="font-mono">
                {view?.rating ?? '--'}
                {!!view?.tags.length && <span className="ml-0.5 align-top text-[11px] text-accent">+{deckTagBonus(view.tags)}</span>}
              </b>
              {tr("Deck rating")}
            </span>
            <span>
              <b className="font-mono inline-flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-accent" aria-hidden />
                {shop.balance === null ? '--' : showRpm(shop.balance)}
              </b>
              {tr("RPM")}
            </span>
            <span>
              <b className="font-mono">{shop.rewardsLeft ?? '--'}</b>
              {tr("Paid battles left")}
            </span>
          </span>

          <span className="cw-strip !max-w-none">
            {cards.map((c) => (
              <CwCard key={c.id} card={c} size="thumb" showCondition />
            ))}
          </span>

          {!!view?.tags.length && (
            <span className="cw-arcade-tags">
              {view.tags.map((t) => (
                <DogTagPlate key={t.id} tag={t} size="chip" />
              ))}
            </span>
          )}

          <span className="mt-auto flex flex-col gap-1.5">
            {worn > 0 && (
              <span className={cn('cw-arcade-note text-destructive')}>
                <Wrench aria-hidden />
                {worn === 1 ? tr("1 card is under 50%: rest or repair it") : tr("{0} cards are under 50%: rest or repair them", [worn])}
              </span>
            )}
            {spins > 0 && (
              <span className="cw-arcade-note text-accent">
                <Gift aria-hidden />
                {spins === 1 ? tr("1 free spin waiting") : tr("{0} free spins waiting", [spins])}
              </span>
            )}
            {BUILDS && (
              <span className="cw-arcade-note">
                <Coins aria-hidden />
                {tr("The other games pay RPM too: {0} a game, {1} for a personal best, up to {2} a day.", [showRpm(ARCADE_PAY.game), showRpm(ARCADE_PAY.best), showRpm(ARCADE_PAY.daily)])}
              </span>
            )}
          </span>
        </>
      ) : (
        <span className="flex-1 flex flex-col items-center justify-center gap-1 py-6 text-center">
          <span className="text-sm font-semibold text-foreground">{tr("Build your first deck")}</span>
          <span className="text-xs text-muted-foreground max-w-xs">{tr("Five cards, three dog tags, and free spins to get you started.")}</span>
        </span>
      )}
    </button>
  );
}
