import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { isThermal } from '@/lib/thermal';

const FLY_MS = 720;
/** One and a half turns: the card leaves face up and lands on its back. */
export const LIFT_TURN = 540;
/** One whole turn, for a card that lands face up. */
const LIFT_TURN_FRONT = 360;

/**
 * A card lifted out of the vault: it leaves its place (`source`), comes to the
 * front of a dimmed screen while turning one and a half times, and lands on
 * its back (or, with `front`, turns once right round and lands face up: a
 * card picked from the full vault's small thumbs, not yet seen at size). Back
 * sends it home the same way. A tap on the card turns it over
 * (`render` is given the turn in degrees and the tap handler; the card draws
 * both its faces). A `locked` card comes forward without turning: there's no
 * back to show. Under Thermal mode and reduced motion it's simply there.
 */
export function CardLift({
  source,
  locked,
  front,
  title,
  render,
  below,
  onClosed,
}: {
  /** The card's place in the list, to fly from and back to. */
  source: HTMLElement | null;
  locked?: boolean;
  /** Land face up, after one whole turn. */
  front?: boolean;
  title: string;
  render: (turn: number, onTap: () => void) => React.ReactNode;
  /** Under the card: its dog tags, or what can be done with it. */
  below?: React.ReactNode;
  onClosed: () => void;
}) {
  const still = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = useRef<HTMLDivElement>(null);
  const home = locked ? 0 : front ? LIFT_TURN_FRONT : LIFT_TURN;
  const [turn, setTurn] = useState(still ? (locked || front ? 0 : 180) : 0);
  const [shown, setShown] = useState(still);
  const closing = useRef(false);
  const done = useRef(onClosed);
  done.current = onClosed;

  /** Where the card's place is, measured against where the lifted card sits. */
  const offset = () => {
    const el = box.current;
    const a = source?.getBoundingClientRect();
    if (!el || !a || !a.width) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`;
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || still) return;
    const from = offset();
    if (from) {
      el.style.transition = 'none';
      el.style.transform = from;
      // Read it back so the browser starts from there.
      void el.offsetWidth;
      el.style.transition = '';
      el.style.transform = '';
    }
    setShown(true);
    setTurn(home);
    eventSound('whoosh');
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    haptics.light();
    if (still) return done.current();
    const el = box.current;
    // Measured with the card at rest where it sits, not mid-turn.
    const to = el ? (el.style.transition = 'none', el.style.transform = '', offset()) : null;
    if (el) {
      void el.offsetWidth;
      el.style.transition = '';
      if (to) el.style.transform = to;
    }
    setShown(false);
    setTurn(0);
    eventSound('whoosh');
    window.setTimeout(() => done.current(), FLY_MS);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = () => {
    if (locked || closing.current) return;
    haptics.light();
    // Back and front by half turns, always onward the same way.
    setTurn((t) => t + 180);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9995] safe-frame overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label={title} data-no-pull>
      <div className="vault-lift-dim fixed inset-0" data-shown={shown} onClick={close} aria-hidden />
      <div className="relative min-h-full flex flex-col px-4 pt-3 pb-5 pointer-events-none">
        <button type="button" onClick={close} className="vault-lift-fade pointer-events-auto self-start inline-flex items-center gap-2 min-h-12 px-4 rounded-xl bg-secondary text-sm font-semibold" data-shown={shown}>
          <ArrowLeft className="w-5 h-5" />
          {tr("Back")}
        </button>
        <div className="my-auto py-3 w-full max-w-[300px] mx-auto">
          <div ref={box} className="vault-lift-card pointer-events-auto">
            {render(turn, flip)}
          </div>
          {below && (
            <div className="vault-lift-fade pointer-events-auto mt-4" data-shown={shown}>
              {below}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
