import { useEffect, useMemo, useRef } from 'react';
import { eventSound } from '@/lib/appSound';
import { isThermal } from '@/lib/thermal';

/** A reel that spins through `labels` and stops on `result`, then calls `onDone` (once, however often the caller re-renders). */
export function SpinReel({ result, labels, onDone }: { result: string; labels: string[]; onDone?: () => void }) {
  const items = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 22; i++) list.push(labels[Math.floor(Math.random() * labels.length)]);
    return [...list, result];
  }, [result, labels]);
  const still = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!still) eventSound('whoosh');
    const t = window.setTimeout(() => done.current?.(), still ? 50 : 2500);
    return () => window.clearTimeout(t);
  }, [still, result]);
  return (
    <div className="cw-spin" role="status" aria-live="polite" aria-label={result}>
      <span className="cw-spin-marker" />
      <span className="cw-spin-marker" />
      <div className="cw-spin-track" style={{ transform: `translateY(-${(items.length - 1) * 52}px)` }}>
        {items.map((l, i) => (
          <div key={i} className="cw-spin-item">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
