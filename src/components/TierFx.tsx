import { useRef, type CSSProperties } from 'react';
import type { CardTier } from '@/features/cards/types';
import { useOnScreen } from '@/hooks/useOnScreen';
import { isThermal } from '@/lib/thermal';
import { cn } from '@/lib/utils';

type Finish = 'metal' | 'stone' | 'obsidian' | 'poly' | 'orion' | 'spectre';

/** What each tier is made of, and so how it catches the light. */
const FINISH: Partial<Record<CardTier | 'spectre', Finish>> = {
  bronze: 'metal',
  silver: 'metal',
  gold: 'metal',
  platinum: 'metal',
  diamond: 'stone',
  ruby: 'stone',
  obsidian: 'obsidian',
  polyatomic: 'poly',
  orion: 'orion',
  spectre: 'spectre',
};

// Where the glints sit on a gemstone and the stars on an Orion card (% across, % down, seconds a cycle, seconds in).
const GLINTS = [
  [18, 15, 2.9, 0],
  [80, 11, 3.6, 1.1],
  [61, 37, 3.1, 2.2],
  [27, 57, 4.1, 0.6],
  [88, 63, 2.7, 1.7],
  [45, 84, 3.4, 2.9],
  [11, 89, 3.9, 0.3],
] as const;
const STARS = [
  [14, 12, 3.2, 0],
  [72, 8, 4.4, 1.4],
  [90, 30, 2.8, 0.7],
  [38, 26, 5.1, 2.6],
  [8, 48, 3.7, 1.9],
  [60, 55, 4.6, 0.2],
  [84, 74, 3.1, 3.1],
  [26, 80, 4.9, 1.1],
  [52, 92, 3.5, 2.3],
] as const;

const at = (x: number, y: number, d: number, delay: number) => ({ '--x': `${x}%`, '--y': `${y}%`, '--d': `${d}s`, '--delay': `${delay}s` }) as CSSProperties;

/** A number from a card's name, so two cards side by side don't shimmer in step. */
function shiftOf(seed: string | undefined): number {
  let h = 0;
  for (let i = 0; i < (seed?.length ?? 0); i++) h = (h * 31 + seed!.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 60) / 10;
}

/**
 * A card's finish: how its tier catches the light, the same on every card in
 * the app (the vault's cards, the Speed Shop's preview, Card Wars).
 *
 *   Bronze, Silver, Gold, Platinum: metal. Brushed grain, and a band of light crossing it.
 *   Diamond, Ruby: stone. Cut facets, and glints that come and go.
 *   Obsidian: dark glass. A slow sheen in the rider's accent.
 *   Polyatomic: a slow swirl of every colour.
 *   Orion: a night sky. Stars that twinkle, and now and then a shooting star.
 *   Spectre: fog drifting across it and a cold shimmer.
 *
 * It sits between the card's background and what's printed on it: the card it
 * goes in needs `isolation: isolate` (Tailwind `isolate`), and this is its
 * first child. It only moves while the card is on screen (a vault holds far
 * more cards than a screen shows), and `still` (cards drawn small, in a hand
 * or a grid) keeps the texture without the movement. Nothing moves in Thermal
 * mode or with reduced motion.
 */
export function TierFx({ tier, still, seed }: { tier: CardTier | 'spectre'; still?: boolean; seed?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const calm = still || isThermal() || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const live = useOnScreen(ref, calm);
  const finish = FINISH[tier];
  if (!finish) return null;
  return (
    <div ref={ref} className={cn('tier-fx', `tier-fx-${finish}`, live && 'tier-fx-live')} style={{ '--fx-shift': `${shiftOf(seed)}s` } as CSSProperties} aria-hidden>
      {finish === 'metal' && (
        <>
          <i className="fx-grain" />
          <i className="fx-sheen" />
        </>
      )}
      {finish === 'stone' && (
        <>
          <i className="fx-facets" />
          {GLINTS.map(([x, y, d, delay], i) => (
            <i key={i} className="fx-glint" style={at(x, y, d, delay)} />
          ))}
        </>
      )}
      {finish === 'obsidian' && (
        <>
          <i className="fx-glass" />
          <i className="fx-sheen" />
        </>
      )}
      {finish === 'poly' && (
        <>
          <i className="fx-swirl" />
          <i className="fx-swirl fx-swirl-b" />
        </>
      )}
      {finish === 'orion' && (
        <>
          <i className="fx-nebula" />
          <i className="fx-stars" />
          {STARS.map(([x, y, d, delay], i) => (
            <i key={i} className="fx-star" style={at(x, y, d, delay)} />
          ))}
          <i className="fx-shoot" />
          <i className="fx-shoot fx-shoot-b" />
        </>
      )}
      {finish === 'spectre' && (
        <>
          <i className="spectre-metal" />
          <i className="spectre-fog" />
          <i className="spectre-fog alt" />
          <i className="spectre-shimmer" />
        </>
      )}
    </div>
  );
}
