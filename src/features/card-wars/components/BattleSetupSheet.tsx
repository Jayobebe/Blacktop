import { Dices, Flame, Shield, Skull, Sparkles, Swords, Timer, Zap, type LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { LEVEL, QUICK, RULES, levelPay } from '../lib/rules';
import { LEVELS_ORDER, QUICK_MODES, type Level, type QuickMode } from '../types';

const LEVEL_ICON: Record<Level, LucideIcon> = { easy: Shield, medium: Swords, hard: Flame };

export function levelName(level: Level): string {
  return level === 'easy' ? tr("Easy") : level === 'medium' ? tr("Medium") : tr("Hard");
}

function levelBlurb(level: Level): string {
  switch (level) {
    case 'easy':
      return tr("Practice. A weaker deck, played at random. No RPM, no prize card, and your cards wear a third as much.");
    case 'medium':
      return tr("A fair deck, played at random. Pays {0} RPM for a win, no prize card, and your cards wear two thirds as much.", [levelPay('medium', 'win')]);
    default:
      return tr("An even deck that picks its cards and carries dog tags of its own. Pays {0} RPM for a win, and you pick a prize card.", [RULES.reward.win]);
  }
}

const MODE_ICON: Record<QuickMode, LucideIcon> = { themed: Timer, chaos: Dices, sudden: Skull, bare: Zap };

export function modeName(mode: QuickMode): string {
  switch (mode) {
    case 'chaos':
      return tr("Chaos");
    case 'sudden':
      return tr("Sudden death");
    case 'bare':
      return tr("Bare knuckle");
    default:
      return tr("Themed");
  }
}

export function modeBlurb(mode: QuickMode): string {
  switch (mode) {
    case 'chaos':
      return tr("Round events are twice as likely.");
    case 'sudden':
      return tr("Every card starts on {0} HP.", [QUICK.suddenHp]);
    case 'bare':
      return tr("No dog tags, yours or theirs.");
    default:
      return tr("The theme, and nothing else.");
  }
}

/**
 * Before a battle against the computer: how hard, or a quick play mode. The
 * level sets what the battle pays and how much it wears the deck; quick play
 * is always hard, with a deck built on the spot.
 */
export function BattleSetupSheet({ open, onClose, onLevel, onQuick, canQuick }: { open: boolean; onClose: () => void; onLevel: (level: Level) => void; onQuick: (mode: QuickMode) => void; canQuick: boolean }) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <div className="space-y-4 max-w-md mx-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("Battle the computer")}</SheetTitle>
            <SheetDescription>{tr("Pick how hard it plays. The harder the battle, the more it pays.")}</SheetDescription>
          </SheetHeader>

          <div className="space-y-2">
            {LEVELS_ORDER.map((level) => {
              const Icon = LEVEL_ICON[level];
              return (
                <button key={level} type="button" className={cn('cw-setup-row', level === 'hard' && 'cw-setup-row-hot')} onClick={() => onLevel(level)}>
                  <Icon aria-hidden />
                  <span className="flex-1 min-w-0">
                    <b>{levelName(level)}</b>
                    <span>{levelBlurb(level)}</span>
                  </span>
                  <span className="cw-setup-pay font-mono">{LEVEL[level].pay === 0 ? tr("0 RPM") : tr("{0} RPM", [levelPay(level, 'win')])}</span>
                </button>
              );
            })}
          </div>

          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent" aria-hidden />
              {tr("Quick play")}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {tr("A wheel spins the theme: the category that comes up most. You get {0} seconds to build a deck for it from every card you have, then it's a hard battle with one twist.", [QUICK.buildSeconds])}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pb-1">
            {QUICK_MODES.map((mode) => {
              const Icon = MODE_ICON[mode];
              return (
                <button key={mode} type="button" className="cw-setup-mode" disabled={!canQuick} onClick={() => onQuick(mode)}>
                  <Icon aria-hidden />
                  <b>{modeName(mode)}</b>
                  <span>{modeBlurb(mode)}</span>
                </button>
              );
            })}
          </div>
          {!canQuick && <p className="text-[11px] text-muted-foreground">{tr("Quick play needs at least five cards in your collection.")}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
