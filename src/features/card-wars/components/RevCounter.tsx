import { useEffect, useState } from 'react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BattleCard as Card } from '../types';

const FROM = -118;
const SPAN = 80;
/** Where the needle rests on mark `i` of `n`, in degrees from straight up. */
const markAngle = (i: number, n: number) => (n <= 1 ? 0 : -SPAN + (2 * SPAN * i) / (n - 1));
const at = (deg: number, r: number): [number, number] => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)];

/**
 * The Wildcard's rev counter: a needle sweeps round a dial with one mark for
 * each Redline card on the wheel and stops on the one that fights. The rival's
 * wheel isn't known to this phone, so theirs is five blank marks and the name
 * it landed on. `still` (Thermal mode, reduced motion) shows it landed.
 */
export function RevCounter({ wheel, landed, side, still }: { wheel?: Card[] | null; landed: Card; side: 'mine' | 'theirs'; still?: boolean }) {
  const marks = wheel?.length ? wheel : null;
  const n = marks ? marks.length : 5;
  // The rival's needle stops on a mark picked from the card's name, so it's the same each time it's drawn.
  const index = marks ? Math.max(0, marks.findIndex((c) => c.id === landed.id)) : landed.id.length % n;
  const [swept, setSwept] = useState(!!still);
  useEffect(() => {
    if (still) return;
    const id = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(id);
  }, [still]);
  const angle = swept ? markAngle(index, n) : FROM;
  const [ax, ay] = at(-SPAN - 14, 78);
  const [bx, by] = at(SPAN + 14, 78);
  const [rx, ry] = at(SPAN - 26, 78);
  return (
    <div className={cn('cw-rev', `cw-rev-${side}`)} role="status" aria-label={tr("{0} {1} is in", [landed.manufacturer ?? '', landed.name])}>
      <svg viewBox="0 0 200 122" aria-hidden>
        <path d={`M ${ax} ${ay} A 78 78 0 0 1 ${bx} ${by}`} className="cw-rev-arc" />
        <path d={`M ${rx} ${ry} A 78 78 0 0 1 ${bx} ${by}`} className="cw-rev-red" />
        {Array.from({ length: n }, (_, i) => {
          const a = markAngle(i, n);
          const [x1, y1] = at(a, 66);
          const [x2, y2] = at(a, 84);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={cn('cw-rev-mark', swept && i === index && 'cw-rev-mark-on')} />;
        })}
        <g className="cw-rev-needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="100" y1="108" x2="100" y2="30" />
        </g>
        <circle cx="100" cy="100" r="7" className="cw-rev-hub" />
      </svg>
      <p className="cw-rev-word">{tr("Redline")}</p>
      <p className="cw-rev-name">{landed.name}</p>
    </div>
  );
}
