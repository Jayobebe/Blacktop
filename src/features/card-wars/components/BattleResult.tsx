import type { ReactNode } from 'react';
import { Coins, Flag, Handshake, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import type { BattleCard as Card } from '../types';
import { CwCard } from './CwCard';

export type Outcome = 'win' | 'loss' | 'draw';

/**
 * After a battle: how it went, what it paid, what it did to the cards that
 * fought, and (after beating the computer) the prize. `children` is the prize
 * picker while there's still one to pick.
 */
export function BattleResult({
  outcome,
  summary,
  pay,
  note,
  wear,
  prize,
  prizeNote,
  children,
  canLeave,
  onAgain,
  onDone,
}: {
  outcome: Outcome;
  /** One line on how it ended. */
  summary: string;
  /** RPM this battle paid or cost, line by line. */
  pay: { label: string; rpm: number }[];
  /** A line under the RPM (the day's limit reached, a stake returned). */
  note?: string;
  /** Cards whose condition this battle changed. */
  /** `rounds`: how many the card fought, when wear follows them. */
  wear: { card: Card; change: number; rounds?: number }[];
  /** The card kept from the prize table. */
  prize?: Card;
  prizeNote?: string;
  children?: ReactNode;
  /** False while a prize is still waiting to be picked. */
  canLeave: boolean;
  onAgain?: () => void;
  onDone: () => void;
}) {
  const Icon = outcome === 'win' ? Trophy : outcome === 'draw' ? Handshake : Flag;
  const title = outcome === 'win' ? tr("Victory") : outcome === 'loss' ? tr("Defeat") : tr("Draw");
  const total = pay.reduce((sum, p) => sum + p.rpm, 0);
  return (
    <div className={cn('cw-result', `cw-result-${outcome}`, 'min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-5 max-w-2xl mx-auto w-full')}>
      <div className="flex flex-col items-center text-center gap-2 pt-6">
        <div className="cw-medal">
          <Icon />
        </div>
        <h1 className="cw-result-title">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-xs">{summary}</p>
      </div>

      {(pay.length > 0 || note) && (
        <section className="cw-panel cw-receipt">
          {pay.map((p, i) => (
            <p key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{p.label}</span>
              <b className={cn('font-mono', p.rpm < 0 && 'text-destructive')}>
                {p.rpm > 0 ? '+' : ''}
                {p.rpm} RPM
              </b>
            </p>
          ))}
          {pay.length > 1 && (
            <p className="flex items-center justify-between gap-3 text-sm border-t border-border/60 pt-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <Coins className="w-4 h-4 text-accent" />
                {tr("This battle")}
              </span>
              <b className={cn('font-mono text-base', total < 0 ? 'text-destructive' : 'text-accent')}>
                {total > 0 ? '+' : ''}
                {total} RPM
              </b>
            </p>
          )}
          {note && <p className="text-[11px] text-muted-foreground leading-snug">{note}</p>}
        </section>
      )}

      {children}

      {prize && (
        <section className="flex flex-col items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Your prize")}</h2>
          <div className="cw-won-card">
            <CwCard card={prize} />
            <span className="cw-shine" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">{prizeNote ?? tr("It's yours. Swap it into your deck any time.")}</p>
        </section>
      )}

      {wear.length > 0 && canLeave && (
        <section className="cw-panel">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Card condition")}</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {wear.map(({ card, change, rounds }) => (
              <li key={card.id} className="flex items-center justify-between gap-2 min-w-0">
                <span className="truncate">
                  {card.name}
                  {rounds ? <span className="text-muted-foreground font-mono"> ×{rounds}</span> : null}
                </span>
                <span className={cn('font-mono font-semibold shrink-0', change < 0 ? 'text-destructive' : 'text-[hsl(var(--stat-improvement))]')}>
                  {change > 0 ? '+' : ''}
                  {change}%
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {wear.some((w) => w.rounds)
              ? tr("Wear follows the rounds each card fought (×), and climbs faster past ten. Rest them for a battle, or repair them from your deck.")
              : tr("Cards that fought wore a little. Rest them for a battle, or repair them from your deck.")}
          </p>
        </section>
      )}

      {canLeave && (
        <div className="mt-auto grid gap-2 pt-2">
          {onAgain && (
            <Button className="h-14 text-base font-bold" onClick={onAgain}>
              {tr("Battle again")}
            </Button>
          )}
          <Button variant={onAgain ? 'outline' : 'default'} className="h-12" onClick={onDone}>
            {tr("Back to your deck")}
          </Button>
        </div>
      )}
    </div>
  );
}
