import { useEffect, useMemo } from 'react';
import { isThermal } from '@/lib/thermal';

/** Reel-style wheel spin that lands on `result`, then calls `onDone`. */
export function SpinReel({ result, labels, onDone }: { result: string; labels: string[]; onDone: () => void }) {
 const items = useMemo(() => {
  const list: string[] = [];
  for (let i = 0; i < 22; i++) list.push(labels[Math.floor(Math.random() * labels.length)]);
  return [...list, result];
 }, [result, labels]);
 const still = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 useEffect(() => { const t = window.setTimeout(onDone, still ? 50 : 2500); return () => window.clearTimeout(t); }, [onDone, still]);
 return <div className="cw-wheel mx-auto" role="status" aria-live="polite" aria-label={result}>
  <div className="cw-wheel-marker" />
  <div className={still ? '' : 'cw-wheel-track'} style={{ transform: `translateY(-${(items.length - 1) * 44}px)` }}>
   {items.map((l, i) => <div key={i} className="cw-wheel-item text-sm">{l}</div>)}
  </div>
 </div>;
}
