import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { isThermal } from '@/lib/thermal';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { shuffle } from '../lib/engine';
import type { BattleState } from '../types';
import { CwCard } from './CwCard';

type Stage = 'show' | 'flip' | 'shuffle' | 'pick' | 'reveal';

/** How many times the table is rearranged, and how long each move takes. Too quick to follow one card by eye. */
const MOVES = 11;
const MOVE_MS = 210;

/** A new arrangement in which no card stays where it was. */
function rearranged(order: string[]): string[] {
  for (let tries = 0; tries < 20; tries++) {
    const next = shuffle(order);
    if (next.every((id, i) => id !== order[i])) return next;
  }
  return [...order.slice(1), order[0]];
}

/**
 * The prize for beating the computer: five cards are shown (its own, with any
 * shop-only card swapped for a Road or Race one), turned face down and
 * shuffled fast, all five moving at once; the one picked is turned over and
 * kept. Each card is one element that keeps its identity through the flip and
 * every move (measured slots), and the whole card is the button, so a tap
 * can't land between its faces. The settled order is saved with the run:
 * coming back shows the same table.
 */
export function RewardShuffle({ run, riding, onClaim, onComplete }: { run: BattleState; riding: boolean; onClaim: (id: string) => void; onComplete: () => void }) {
  const prizes = run.prizes ?? run.opponent;
  const initial = prizes.map((c) => c.id);
  const [stage, setStage] = useState<Stage>(run.rewardShuffleComplete ? 'pick' : 'show');
  const [order, setOrder] = useState(run.rewardShuffleComplete ? run.rewardOrder : initial);
  const [picked, setPicked] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ x: number; y: number; width: number }[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const claim = useRef(onClaim);
  claim.current = onClaim;
  const quick = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    const node = board.current;
    if (!node) return;
    // Layout positions, not what's on screen: the result page scales in, and a slot measured mid-animation is off.
    const measure = () => setSlots(Array.from(node.querySelectorAll<HTMLElement>('.cw-reward-anchor')).map((e) => ({ x: e.offsetLeft, y: e.offsetTop, width: e.offsetWidth })));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Face down, then the shuffle: every card moves on every beat, and the last beat lands on the saved order.
  const shuffling = stage === 'flip' || stage === 'shuffle';
  useEffect(() => {
    if (stage !== 'flip') return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(() => !cancelled && run(), ms));
    const settle = () => {
      setOrder(run.rewardOrder);
      setStage('pick');
      complete.current();
    };
    if (quick) {
      at(250, settle);
    } else {
      let current = initial;
      let time = 520;
      for (let i = 0; i < MOVES - 1; i++) {
        const next = rearranged(current);
        current = next;
        at(time, () => {
          setStage('shuffle');
          setOrder(next);
          if (i % 2 === 0) eventSound('whoosh');
        });
        time += MOVE_MS + 25;
      }
      at(time, () => setOrder(run.rewardOrder));
      at(time + MOVE_MS + 150, settle);
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // Runs once per shuffle: the moves are planned up front.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffling, run.id]);

  // The pick turns over (so do the rest, a beat later), then it's kept.
  const pick = (id: string) => {
    if (stage !== 'pick' || riding) return;
    haptics.medium();
    eventSound('success');
    setPicked(id);
    setStage('reveal');
  };
  useEffect(() => {
    if (stage !== 'reveal' || !picked) return;
    const t = setTimeout(() => claim.current(picked), quick ? 600 : 1900);
    return () => clearTimeout(t);
  }, [stage, picked, quick]);

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-semibold">
          {stage === 'show' ? tr("Your prize: one of these cards") : stage === 'pick' ? tr("Pick a card to keep") : stage === 'reveal' ? tr("And the others were…") : tr("Keep your eye on the one you want…")}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 min-h-4">
          {stage === 'show' ? tr("They're turned face down and shuffled. Whichever you pick is yours.") : stage === 'pick' ? tr("Tap one. It joins your collection.") : ' '}
        </p>
      </div>
      <div ref={board} className={cn('cw-reward-board', `cw-reward-${stage}`)} aria-busy={shuffling}>
        {initial.map((id) => (
          <div key={id} className="cw-reward-anchor" />
        ))}
        {prizes.map((card) => {
          const slot = slots[order.indexOf(card.id)];
          if (!slot) return null;
          const up = stage === 'show' || (stage === 'reveal' && picked !== null);
          const mine = picked === card.id;
          return (
            <button
              key={card.id}
              type="button"
              data-reward-id={card.id}
              className={cn('cw-reward-position', mine && 'cw-reward-picked', stage === 'reveal' && !mine && 'cw-reward-missed')}
              style={{ width: slot.width, transform: `translate(${slot.x}px,${slot.y}px)` }}
              disabled={stage !== 'pick' || riding}
              aria-label={stage === 'pick' ? tr("Choose face-down card") : card.name}
              onClick={() => pick(card.id)}
            >
              <span className={cn('cw-reward-flipper', !up && 'cw-reward-facedown')}>
                <span className="cw-reward-face cw-reward-front" aria-hidden={!up}>
                  <CwCard card={card} />
                </span>
                <span className="cw-reward-face cw-reward-back" aria-hidden={up}>
                  <CwCard card={card} faceDown />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {stage === 'show' && (
        <Button className="w-full h-12 text-base font-bold gap-2" disabled={riding} onClick={() => setStage('flip')}>
          <Shuffle className="w-5 h-5" />
          {tr("Shuffle the cards")}
        </Button>
      )}
    </div>
  );
}
