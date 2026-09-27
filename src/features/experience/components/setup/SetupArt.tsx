import { cn } from '@/lib/utils';

/**
 * Line-art illustrations for the setup flow. Drawn with currentColor so they
 * pick up the accent (selected) or muted (unselected) text color, and animated
 * with CSS only — wheels spin and road dashes scroll while `active`.
 */

interface ArtProps {
  active?: boolean;
  className?: string;
}

function Road({ active, y = 92 }: { active?: boolean; y?: number }) {
  return (
    <g opacity={0.5}>
      <line x1="0" y1={y} x2="200" y2={y} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
      <line
        x1="0"
        y1={y + 8}
        x2="200"
        y2={y + 8}
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="14 12"
        className={cn(active && 'setup-road-dash')}
      />
    </g>
  );
}

function Wheel({ cx, cy, r, active }: { cx: number; cy: number; r: number; active?: boolean }) {
  return (
    <g className={cn(active && 'setup-wheel-spin')} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="3.5" />
      <circle cx={cx} cy={cy} r={r * 0.28} fill="currentColor" />
      <line x1={cx - r * 0.7} y1={cy} x2={cx + r * 0.7} y2={cy} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
      <line x1={cx} y1={cy - r * 0.7} x2={cx} y2={cy + r * 0.7} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
    </g>
  );
}

export function MotorcycleArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <Road active={active} />
      <g className={cn(active && 'setup-bob')}>
        {/* Swingarm + forks sit behind the bodywork */}
        <path d="M92 64 L50 74" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M136 34 L150 74" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
        <Wheel cx={50} cy={74} r={19} active={active} />
        <Wheel cx={150} cy={74} r={19} active={active} />
        {/* Sportbike bodywork: tail, seat, tank, fairing */}
        <path
          d="M34 44 L58 39 L84 39 Q92 27 112 26 L130 29 L147 37 Q159 45 159 54 L143 56 L128 66 L98 70 L82 60 L60 55 Z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Engine block */}
        <path d="M92 54 L120 54 L116 69 L97 69 Z" fill="currentColor" fillOpacity="0.55" />
        {/* Screen + bars */}
        <path d="M134 29 L140 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {/* Exhaust */}
        <path d="M84 63 L46 55" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.8" />
      </g>
    </svg>
  );
}

export function CarArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <Road active={active} />
      <g className={cn(active && 'setup-bob')}>
        <path
          d="M22 70 L22 58 Q24 50 34 48 L62 44 L82 28 Q88 24 98 24 L134 24 Q142 24 148 30 L164 46 L176 50 Q182 52 182 60 L182 70 Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M70 44 L88 30 L112 30 L112 44 Z M120 30 L140 30 L154 44 L120 44 Z" fill="currentColor" fillOpacity="0.3" />
        <Wheel cx={58} cy={72} r={15} active={active} />
        <Wheel cx={148} cy={72} r={15} active={active} />
      </g>
    </svg>
  );
}

function BicycleFrame({ active, battery }: { active?: boolean; battery?: boolean }) {
  return (
    <g className={cn(active && 'setup-bob')}>
      <Wheel cx={50} cy={70} r={22} active={active} />
      <Wheel cx={150} cy={70} r={22} active={active} />
      {/* Diamond frame: chainstay, seat tube, top tube, down tube, fork */}
      <path
        d="M50 70 L88 70 L76 36 M88 70 L130 40 L76 40 M50 70 L76 40 M130 40 L150 70 M126 30 L130 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Saddle + bars */}
      <path d="M66 32 L84 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M120 28 L134 26" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {battery && (
        <>
          <rect x="96" y="46" width="22" height="10" rx="3" transform="rotate(-36 107 51)" fill="currentColor" />
          <path d="M104 18 L99 27 L106 27 L101 36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn(active && 'setup-glow')} />
        </>
      )}
      {/* Crank */}
      <circle cx="88" cy="70" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </g>
  );
}

export function BicycleArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <Road active={active} />
      <BicycleFrame active={active} />
    </svg>
  );
}

export function EBikeArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <Road active={active} />
      <BicycleFrame active={active} battery />
    </svg>
  );
}

export function ScooterArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <Road active={active} />
      <g className={cn(active && 'setup-bob')}>
        <Wheel cx={56} cy={80} r={12} active={active} />
        <Wheel cx={148} cy={80} r={12} active={active} />
        {/* Deck */}
        <path d="M56 80 L66 70 L132 70 L148 80" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="66" y="66" width="66" height="6" rx="3" fill="currentColor" fillOpacity="0.3" />
        {/* Stem + bars */}
        <path d="M148 80 L136 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M126 22 L146 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** One dot cruising a winding road. */
export function SoloArt({ active, className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <path id="solo-road" d="M-10 90 C 50 90, 60 30, 110 40 S 170 80, 210 20" fill="none" stroke="currentColor" strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
      <path d="M-10 90 C 50 90, 60 30, 110 40 S 170 80, 210 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 8" strokeOpacity="0.5" />
      <circle r="7" fill="currentColor" className={cn(active && 'setup-glow')}>
        {active && <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto" path="M-10 90 C 50 90, 60 30, 110 40 S 170 80, 210 20" />}
      </circle>
      {!active && <circle cx="110" cy="40" r="7" fill="currentColor" />}
    </svg>
  );
}

/** A convoy of dots following the leader. */
export function GroupArt({ active, className }: ArtProps) {
  const path = 'M-10 90 C 50 90, 60 30, 110 40 S 170 80, 210 20';
  const riders = [0, 0.35, 0.7, 1.05, 1.4];
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 8" strokeOpacity="0.5" />
      {riders.map((delay, i) => (
        <circle key={i} r={i === 0 ? 7 : 5} fill="currentColor" fillOpacity={i === 0 ? 1 : 0.75 - i * 0.08} cx={active ? undefined : 70 + i * 16} cy={active ? undefined : 44 + (i % 2) * 6}>
          {active && <animateMotion dur="3.2s" begin={`-${delay}s`} repeatCount="indefinite" path={path} />}
        </circle>
      ))}
    </svg>
  );
}

/** Convoy on the main road with one rider peeling off down a side road. */
export function MixedArt({ active, className }: ArtProps) {
  const main = 'M-10 90 C 40 90, 70 60, 110 60 S 170 70, 210 50';
  const fork = 'M110 60 C 130 58, 140 30, 170 20 S 200 12, 215 8';
  const riders = [0, 0.35, 0.7];
  return (
    <svg viewBox="0 0 200 110" className={cn('w-full h-full', className)} aria-hidden="true">
      <path d={main} fill="none" stroke="currentColor" strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
      <path d={fork} fill="none" stroke="currentColor" strokeWidth="7" strokeOpacity="0.1" strokeLinecap="round" />
      <path d={main} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 8" strokeOpacity="0.5" />
      <path d={fork} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 7" strokeOpacity="0.4" />
      {riders.map((delay, i) => (
        <circle key={i} r={i === 0 ? 6 : 4.5} fill="currentColor" fillOpacity={1 - i * 0.2} cx={active ? undefined : 120 - i * 18} cy={active ? undefined : 61 + i * 3}>
          {active && <animateMotion dur="3.4s" begin={`-${delay}s`} repeatCount="indefinite" path={main} />}
        </circle>
      ))}
      <circle r="5.5" fill="currentColor" cx={active ? undefined : 150} cy={active ? undefined : 34} className={cn(active && 'setup-glow')}>
        {active && <animateMotion dur="2.6s" repeatCount="indefinite" path={fork} />}
      </circle>
    </svg>
  );
}
