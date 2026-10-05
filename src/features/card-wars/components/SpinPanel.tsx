import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Coins, Dices, Loader2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cardById } from '../lib/catalog';
import type { SpinResult } from '../lib/shop';
import { spinCaption, spinLabel } from '../lib/spinText';
import { parseOwnedTag } from '../lib/tagRules';
import { CwCard } from './CwCard';
import { DogTagPlate } from './DogTagPlate';
import { SpinReel } from './SpinReel';

/** What a spin won, shown off: the card, the dog tag on its chain, or the RPM. */
function Won({ result }: { result: SpinResult }) {
  const card = result.kind === 'card' ? cardById(result.card) : undefined;
  const tag = result.kind === 'tag' && result.tag ? parseOwnedTag(result.tag) : null;
  return (
    <div className="cw-won" role="status">
      {card ? (
        <div className="cw-won-card">
          <CwCard card={card} />
          <span className="cw-shine" aria-hidden />
        </div>
      ) : tag ? (
        <DogTagPlate tag={tag} size="big" />
      ) : (
        <p className="cw-won-figure font-mono">
          {result.kind === 'spins' ? <RotateCw aria-hidden /> : <Coins aria-hidden />}
          {spinLabel(result)}
        </p>
      )}
      <p className="cw-won-caption">{spinCaption(result)}</p>
    </div>
  );
}

/**
 * One spin of a wheel: the button, the reel, and what it stopped on. The
 * server decides the result (`onSpin` asks it); the reel only plays it back.
 * Used for the free card and dog tag spins and for every shelf in the shop.
 */
export function SpinPanel({
  button,
  disabled,
  labels,
  onSpin,
  onWon,
  children,
}: {
  /** The button's words ("Spin for 25 RPM"). */
  button: ReactNode;
  disabled?: boolean;
  /** What flies past on the reel. */
  labels: string[];
  /** Asks the server for a spin. A string is its refusal. */
  onSpin: () => Promise<SpinResult | string>;
  /** Called once the reel has stopped on a result. */
  onWon?: (result: SpinResult) => void;
  /** A line under the button (the odds). */
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [shown, setShown] = useState<SpinResult | null>(null);
  const latest = useRef<SpinResult | null>(null);
  const turn = useRef(0);
  const won = useRef(onWon);
  won.current = onWon;

  const spin = async () => {
    if (busy || disabled) return;
    haptics.medium();
    setBusy(true);
    setResult(null);
    setShown(null);
    const r = await onSpin();
    if (typeof r === 'string') {
      setBusy(false);
      if (r !== 'demo') toast.error(/rpm/i.test(r) ? tr("Not enough RPM") : /no free spins/i.test(r) ? tr("No free spins left") : tr("Spin failed"));
      return;
    }
    turn.current++;
    latest.current = r;
    setResult(r);
  };

  const stopped = useCallback(() => {
    const r = latest.current;
    latest.current = null;
    setBusy(false);
    setResult(null);
    if (!r) return;
    setShown(r);
    haptics.success();
    eventSound(r.kind === 'card' || r.kind === 'tag' ? 'success' : 'coin');
    won.current?.(r);
  }, []);

  return (
    <div className="space-y-3">
      {result && <SpinReel key={turn.current} result={spinLabel(result)} labels={labels} onDone={stopped} />}
      {shown && !busy && <Won result={shown} />}
      <Button className="w-full h-12 text-base font-bold gap-2" disabled={busy || disabled} onClick={() => void spin()}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Dices className="w-5 h-5" />}
        {button}
      </Button>
      {children}
    </div>
  );
}
