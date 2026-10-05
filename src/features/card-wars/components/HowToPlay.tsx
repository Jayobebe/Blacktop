import type { ElementType, ReactNode } from 'react';
import { Coins, Dices, Flame, Layers, Swords, Trophy, Users, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { tr } from '@/lib/i18n';
import { CATEGORY_ICON, CATEGORY_ORDER, categoryLabel } from '../lib/ratings';
import { RULES, V2, WEAR_BY_ROUND } from '../lib/rules';
import { TAG_ICON, TAG_ORDER, tagDescription, tagName } from '../lib/tags';

const SEEN_KEY = 'bt.card_wars_howto';

export function howToSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* shown again next time, no harm */
  }
}

/** The rules, in the order a first battle meets them. Opens by itself the first time. */
export function HowToPlay({ open, onClose, players }: { open: boolean; onClose: () => void; /** Player battles exist on this server. */ players: boolean }) {
  const close = () => {
    markSeen();
    onClose();
  };
  const steps: { icon: ElementType; title: string; text: ReactNode }[] = [
    {
      icon: Layers,
      title: tr("Build a deck"),
      text: tr("Five cards and three dog tags. Every card is a real car or bike with ratings out of 100. The big number is its battle rating: how often it wins a round against every other card."),
    },
    {
      icon: Swords,
      title: tr("Play a card each round"),
      text: (
        <>
          {tr("You pick first, then a category is drawn at random:")}
          <span className="flex flex-wrap gap-1.5 mt-1.5">
            {CATEGORY_ORDER.map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  <Icon className="w-3 h-3 text-accent" />
                  {categoryLabel(c)}
                </span>
              );
            })}
          </span>
          <span className="block mt-1.5">{tr("Lean only comes up when both cards are bikes.")}</span>
        </>
      ),
    },
    {
      icon: Flame,
      title: tr("Higher rating wins the round"),
      text: tr("The losing card takes damage: at least 20, more the wider the gap. A card at 0 HP burns out. Burn out all five of theirs to win."),
    },
    {
      icon: Zap,
      title: tr("Dog tags turn a round"),
      text: (
        <span className="grid gap-1">
          {TAG_ORDER.map((power) => {
            const Icon = TAG_ICON[power];
            return (
              <span key={power} className="flex items-start gap-1.5">
                <Icon className="w-3.5 h-3.5 text-accent shrink-0 mt-px" />
                <span>
                  <b className="text-foreground">{tagName(power)}</b> {tagDescription(power)}
                </span>
              </span>
            );
          })}
          <span>
            {V2
              ? tr("A deck carries three of the four, so choose the ones that suit your cards. Arm one before you play; each works once per battle. A tag won on a spin is tied to a vehicle: that sets how strong it is, and it does more with the same kind of vehicle.")
              : tr("Arm one before you play. Each works once per battle.")}
          </span>
        </span>
      ),
    },
    {
      icon: Trophy,
      title: tr("Win cards and RPM"),
      text: (
        <>
          {tr("Beat the computer and you keep one of five cards, picked face down. Every battle pays RPM: {0} for a win, {1} for a draw, {2} for a loss.", [RULES.reward.win, RULES.reward.draw, RULES.reward.loss])}
          {RULES.dailyBattles !== null && (
            <span className="block mt-1">{tr("The first win of the day pays {0} more, and the first {1} battles of the day pay.", [RULES.firstWin, RULES.dailyBattles])}</span>
          )}
        </>
      ),
    },
    {
      icon: Dices,
      title: tr("Spend RPM in the shop"),
      text: V2
        ? tr("Every card has its own price: the stronger it is, the more it costs. Or spin a shelf's wheel for about a fifth of that: a spin can land a card, a dog tag, RPM or another spin.")
        : tr("Buy a card outright, or spin for a sixth of the price: a spin can land a card, RPM or more spins."),
    },
    {
      icon: Wrench,
      title: tr("Cards wear"),
      text: V2
        ? WEAR_BY_ROUND
          ? tr("Every round a card fights wears it, and faster past its tenth round in a battle, so don't lean on your best card. One that sits a battle out gets condition back. Under 50% its ratings drop: rotate your deck or repair with RPM. Dearer cards cost more to repair.")
          : tr("A card that fights loses condition and one that rests gets it back. Under 50% its ratings drop, so rotate your deck or repair with RPM. Dearer cards cost more to repair.")
        : tr("A card that fights loses condition and one that rests gets it back. Under 50% its ratings drop, so rotate your deck or repair with RPM."),
    },
    ...(players
      ? [
          {
            icon: Users,
            title: tr("Battle a player"),
            text: tr("Invite a rider with a QR code or a link. You each put in {0} RPM and the winner takes {1}. Nobody loses a card.", [RULES.stake, RULES.pot]),
          },
        ]
      : []),
    {
      icon: Coins,
      title: tr("RPM stays in the game"),
      text: tr("RPM is only for Card Wars. It can't be bought, sold or sent to anyone."),
    },
  ];
  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom">
        <div className="max-w-md mx-auto space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("How Card Wars works")}</SheetTitle>
            <SheetDescription>{tr("A quick battle of real cars and bikes. Two minutes to learn.")}</SheetDescription>
          </SheetHeader>
          <ol className="space-y-3">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={i} className="flex gap-3">
                <div className="rounded-xl bg-accent/15 p-2 h-fit shrink-0">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{title}</p>
                  <div className="text-xs text-muted-foreground leading-snug mt-0.5">{text}</div>
                </div>
              </li>
            ))}
          </ol>
          <Button className="w-full h-12 text-base font-bold" onClick={close}>
            {tr("Got it")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
