import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isThermal } from '@/lib/thermal';
import { tr } from '@/lib/i18n';
import { CwCard } from './CwCard';
import type { BattleState } from '../types';

/**
 * The prize for beating the computer: five cards are shown (its own, with any
 * shop-only card swapped for a Road or Race one), turned face down and
 * shuffled; the one picked is kept. Cards keep their identity through the flip
 * and every swap (measured slots, one element per card), and the settled order
 * is saved with the run, so coming back shows the same table.
 */
export function RewardShuffle({ run, riding, onClaim, onComplete }: { run: BattleState; riding: boolean; onClaim: (id: string) => void; onComplete: () => void }) {
  const prizes = run.prizes ?? run.opponent;
  const initial = prizes.map((c) => c.id);
  const [stage, setStage] = useState<'show' | 'flip' | 'shuffle' | 'pick'>(run.rewardShuffleComplete ? 'pick' : 'show');
  const [order, setOrder] = useState(run.rewardShuffleComplete ? run.rewardOrder : initial);
  const [moving, setMoving] = useState<string[]>([]);
  const [slots, setSlots] = useState<{ x: number; y: number; width: number }[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  useLayoutEffect(() => {
    const node = board.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      setSlots(
        Array.from(node.querySelectorAll<HTMLElement>('.cw-reward-anchor')).map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left - bounds.left, y: r.top - bounds.top, width: r.width };
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shuffling = stage === 'flip' || stage === 'shuffle';
  useEffect(() => {
    if (stage !== 'flip') return;
    const quick = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const next = initial.slice();
    let time = quick ? 0 : 650;
    const swap = (a: number, b: number) => {
      const ids = [next[a], next[b]];
      [next[a], next[b]] = [next[b], next[a]];
      const snapshot = next.slice();
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setStage('shuffle');
          setMoving(ids);
          setOrder(snapshot);
        }, time),
      );
      time += quick ? 180 : 850;
    };
    if (!quick) {
      swap(0, 1);
      swap(1, 2);
      swap(1, 2);
      swap(0, 1);
    }
    for (let i = 0; i < run.rewardOrder.length; i++) {
      const at = next.indexOf(run.rewardOrder[i]);
      if (at >= 0 && at !== i) swap(i, at);
    }
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setMoving([]);
        setStage('pick');
        complete.current();
      }, time),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // Runs once per shuffle: the swaps are planned up front.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffling, run.id]);

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-semibold">{stage === 'show' ? tr("Your prize: one of these cards") : stage === 'pick' ? tr("Pick a card to keep") : tr("Keep your eye on the one you want…")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stage === 'show' ? tr("They're turned face down and shuffled. Whichever you pick is yours.") : stage === 'pick' ? tr("Tap one. It joins your collection.") : ' '}
        </p>
      </div>
      <div ref={board} className="cw-reward-board" aria-busy={shuffling}>
        {initial.map((id) => (
          <div key={id} className="cw-reward-anchor" />
        ))}
        {prizes.map((card) => {
          const slot = slots[order.indexOf(card.id)];
          if (!slot) return null;
          return (
            <div key={card.id} data-reward-id={card.id} className={`cw-reward-position ${moving.includes(card.id) ? 'cw-reward-moving' : ''}`} style={{ width: slot.width, transform: `translate(${slot.x}px,${slot.y}px)` }}>
              <div className={`cw-reward-flipper ${stage !== 'show' ? 'cw-reward-facedown' : ''}`}>
                <div className="cw-reward-face cw-reward-front" aria-hidden={stage !== 'show'}>
                  <CwCard card={card} />
                </div>
                <div className="cw-reward-face cw-reward-back" aria-hidden={stage === 'show'}>
                  <CwCard card={card} faceDown disabled={stage !== 'pick' || riding} onClick={() => onClaim(card.id)} />
                </div>
              </div>
            </div>
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
