import { useEffect, useState, type ReactNode } from 'react';
import { Mic, WifiOff, Radio, LifeBuoy, Flag, Timer, GraduationCap, Store, Mountain, Gauge, Infinity as InfinityIcon, Palette } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { EnterpriseTier } from '../types';
import { tierName } from '../lib/tiers';

/**
 * Animated scenes for the Enterprise page's packages, in the style of the demo
 * slides (pages/DemoShowcase): a small dark map or console where the package's
 * headline features play out live. Only the open package's scene runs, it
 * redraws at ~30 fps, and with reduced motion it holds a still frame.
 */

type Pt = [number, number];
const W = 160;
const H = 100;

/** Seconds since mount, ticking at ~30 fps; frozen under reduced motion. */
function useSceneTime(): number {
  const [t, setT] = useState(3.2);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    const start = performance.now() - 3200;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      setT((now - start) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

function lengths(pts: Pt[]) {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  return { segs, total: segs.reduce((a, b) => a + b, 0) };
}

function along(pts: Pt[], f: number): Pt {
  const { segs, total } = lengths(pts);
  let d = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) {
      const r = segs[i] ? d / segs[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

const path = (pts: Pt[], close = false) => `M${pts.map((p) => p.join(' ')).join(' L')}${close ? ' Z' : ''}`;

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Position helper for HTML markers over the SVG (viewBox 160×100). */
const at = ([x, y]: Pt) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-full aspect-[16/10] rounded-2xl border border-border/30 bg-[#0d0d10] overflow-hidden animate-scale-in no-frost', className)}>
      {children}
    </div>
  );
}

function Streets({ roads }: { roads: Pt[][] }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-25 text-muted-foreground" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {roads.map((r, i) => (
        <path key={i} d={path(r)} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function Marker({ p, label, className, style }: { p: Pt; label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        'absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 flex items-center justify-center text-[8px] font-bold text-white transition-[transform,box-shadow] duration-300',
        className,
      )}
      style={{ ...at(p), ...style }}
    >
      {label}
    </div>
  );
}

function Chip({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('absolute flex items-center gap-1.5 rounded-lg bg-card/95 border border-border/40 px-2 py-1 text-[9px] font-semibold no-frost', className)} style={style}>
      {children}
    </div>
  );
}

function MicBars({ on }: { on: boolean }) {
  return (
    <span className="flex items-end gap-[2px] h-2.5">
      {[0, 1, 2, 3].map((b) => (
        <span
          key={b}
          className={cn('w-0.5 rounded-full bg-accent', on ? 'animate-pulse' : 'opacity-30')}
          style={{ height: `${4 + ((b * 3) % 7)}px`, animationDelay: `${b * 120}ms` }}
        />
      ))}
    </span>
  );
}

// ---- Academy: tether radar, priority comms, Mod 1 speed trap -----------------

const ACADEMY_ROAD: Pt[] = [[6, 84], [30, 74], [52, 76], [72, 60], [94, 46], [120, 42], [154, 22]];
const ACADEMY_STREETS: Pt[][] = [ACADEMY_ROAD, [[40, 0], [52, 76], [60, 100]], [[94, 46], [104, 0]], [[120, 42], [150, 100]]];

function AcademyScene() {
  const t = useSceneTime();
  const cycle = (t * 0.045) % 1;
  const lead = 0.32 + 0.68 * cycle;
  const fade = Math.min(1, cycle * 12, (1 - cycle) * 12);
  const lagGap = 0.17 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.8));
  const metres = Math.round(lagGap * 1100);
  const tether = metres > 240 ? 'red' : metres > 150 ? 'amber' : 'ok';
  const instr = along(ACADEMY_ROAD, lead);
  const lagger = along(ACADEMY_ROAD, lead - lagGap);
  const talking = t % 7 < 3.2;
  const trap = Math.floor(t / 4) % 2 === 0;
  const trapSpeed = Math.round((trap ? 51 : 46) * Math.min(1, (t % 4) / 0.9));
  const tetherColor = tether === 'red' ? '#ef4444' : tether === 'amber' ? '#f59e0b' : 'hsl(var(--accent))';

  return (
    <Frame>
      <Streets roads={ACADEMY_STREETS} />
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path d={path(ACADEMY_ROAD)} stroke="hsl(var(--accent))" strokeOpacity={0.5} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* The tether: an arc above the road from instructor to the trailing student */}
        <path
          d={`M${instr[0]} ${instr[1]} Q${(instr[0] + lagger[0]) / 2} ${Math.min(instr[1], lagger[1]) - 18} ${lagger[0]} ${lagger[1]}`}
          stroke={tetherColor}
          strokeWidth={1.3}
          strokeDasharray="3 2"
          fill="none"
          opacity={fade}
          className="transition-[stroke] duration-300"
        />
      </svg>
      <div style={{ opacity: fade }}>
        <Marker p={along(ACADEMY_ROAD, lead - 0.06)} label="S" className="bg-sky-500" />
        <Marker p={along(ACADEMY_ROAD, lead - 0.11)} label="S" className="bg-violet-500" />
        <Marker p={lagger} label="S" className={cn('bg-pink-500', tether !== 'ok' && 'scale-110')} style={tether === 'red' ? { boxShadow: '0 0 10px 3px rgba(239,68,68,0.6)' } : undefined} />
        <Marker p={instr} label="I" className={cn('bg-accent', talking && 'scale-125 shadow-[0_0_10px_3px_hsl(var(--accent)/0.6)]')} />
      </div>

      <Chip className="top-2 left-2 animate-fade-in">
        <Mic className={cn('w-3 h-3', talking ? 'text-accent' : 'text-muted-foreground')} />
        <span>{tr("Instructor")}</span>
        <span className={cn('rounded px-1 text-[8px] uppercase tracking-wider', talking ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}>{tr("Priority")}</span>
        <MicBars on={talking} />
      </Chip>

      <Chip
        className="top-2 right-2 animate-fade-in delay-100"
        style={{ borderColor: tether === 'ok' ? undefined : tetherColor }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tetherColor }} />
        <span className="font-mono tabular-nums">{metres} m</span>
      </Chip>

      <Chip className="bottom-2 right-2 animate-slide-up delay-200">
        <Timer className="w-3 h-3 text-accent" />
        <span className="font-mono tabular-nums">{trapSpeed} km/h</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[8px] font-black tracking-wider transition-colors duration-300',
            (t % 4) < 0.9 ? 'bg-muted text-muted-foreground' : trap ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
          )}
        >
          {(t % 4) < 0.9 ? '…' : trap ? tr("PASS") : tr("TOO SLOW")}
        </span>
      </Chip>
    </Frame>
  );
}

// ---- Showroom: timed test ride, geofence alert, ride summary ------------------

const FENCE: Pt[] = [[18, 16], [118, 10], [136, 56], [92, 90], [22, 82]];
const TEST_ROUTE: Pt[] = [[42, 70], [30, 44], [58, 26], [100, 22], [124, 34], [150, 48], [128, 62], [96, 76], [60, 80], [42, 70]];
const SHOWROOM_STREETS: Pt[][] = [TEST_ROUTE, [[0, 50], [30, 44]], [[100, 22], [110, 0]], [[96, 76], [104, 100]]];

function ShowroomScene() {
  const t = useSceneTime();
  const cycle = (t * 0.06) % 1;
  const bike = along(TEST_ROUTE, cycle);
  const out = !inside(bike, FENCE);
  const left = Math.max(0, 45 * 60 - Math.floor(t * 9) % (45 * 60));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const summary = cycle > 0.82;

  return (
    <Frame>
      <Streets roads={SHOWROOM_STREETS} />
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path d={path(FENCE, true)} fill="hsl(var(--accent))" fillOpacity={out ? 0.04 : 0.08} stroke={out ? '#ef4444' : 'hsl(var(--accent))'} strokeWidth={1} strokeDasharray="4 3" className="transition-colors duration-300" />
        <path d={path(TEST_ROUTE)} stroke="hsl(var(--accent))" strokeOpacity={0.55} strokeWidth={2} fill="none" strokeLinejoin="round" />
      </svg>
      <Marker p={bike} label="C" className={cn('bg-sky-500', out && 'bg-red-500 scale-125')} style={out ? { boxShadow: '0 0 12px 4px rgba(239,68,68,0.55)' } : undefined} />

      <Chip className="top-2 left-2 animate-fade-in">
        <Gauge className="w-3 h-3 text-accent" />
        <span>{tr("Test ride")}</span>
        <span className="font-mono tabular-nums text-accent">{mm}:{ss}</span>
      </Chip>

      <Chip
        className={cn('top-2 right-2 border-red-500/70 text-red-400 transition-all duration-300', out ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2')}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {tr("Left the test area")}
      </Chip>

      <div
        className={cn(
          'absolute bottom-2 right-2 w-28 rounded-xl bg-card/95 border border-accent/60 p-2 transition-all duration-500 no-frost',
          summary ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        )}
      >
        <p className="text-[8px] uppercase tracking-widest text-accent font-semibold">{tr("Ride summary")}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            <p className="text-[8px] text-muted-foreground">{tr("Peak lean")}</p>
            <p className="font-mono font-bold text-sm leading-none">41°</p>
          </div>
          <svg viewBox="0 0 40 20" className="w-10 h-5" aria-hidden>
            <path d="M2 16 C 8 4, 14 18, 20 8 S 32 2, 38 12" stroke="hsl(var(--accent))" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </Frame>
  );
}

// ---- Touring: offline switchbacks, leader broadcast, sweep radar, guide ping --

const PASS_ROAD: Pt[] = [[8, 92], [70, 82], [22, 66], [92, 56], [34, 40], [110, 30], [70, 16], [156, 8]];

function TouringScene() {
  const t = useSceneTime();
  const cycle = (t * 0.035) % 1;
  const lead = 0.36 + 0.64 * cycle;
  const fade = Math.min(1, cycle * 12, (1 - cycle) * 12);
  const riders = [0.07, 0.14, 0.21].map((g) => along(PASS_ROAD, lead - g));
  const sweepGap = 0.3 + 0.04 * Math.sin(t * 0.7);
  const sweep = along(PASS_ROAD, lead - sweepGap);
  const tailMetres = Math.round((sweepGap - 0.21) * 3600);
  const broadcasting = t % 6 < 2.6;
  const ping = t % 9 > 6.2;

  return (
    <Frame>
      {/* Contour lines: it's a mountain */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.12]" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {[18, 30, 42, 54].map((r) => (
          <ellipse key={r} cx={96} cy={30} rx={r * 1.6} ry={r} fill="none" stroke="white" strokeWidth={0.6} />
        ))}
      </svg>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path d={path(PASS_ROAD)} stroke="hsl(var(--accent))" strokeOpacity={0.55} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ opacity: fade }}>
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(along(PASS_ROAD, lead))}>
          {broadcasting && <span className="absolute inset-0 -m-3 rounded-full border border-accent/70 animate-ping" />}
        </div>
        <Marker p={sweep} label="S" className="bg-sky-500" />
        {riders.map((p, i) => (
          <Marker
            key={i}
            p={p}
            label={String(i + 1)}
            className={cn('bg-zinc-500', i === 1 && ping && 'bg-red-500 scale-125')}
            style={i === 1 && ping ? { boxShadow: '0 0 12px 4px rgba(239,68,68,0.55)' } : undefined}
          />
        ))}
        <Marker p={along(PASS_ROAD, lead)} label="L" className={cn('bg-accent', broadcasting && 'scale-110')} />
      </div>

      <Chip className="top-2 left-2 animate-fade-in">
        <WifiOff className="w-3 h-3 text-muted-foreground" />
        <span>{tr("Offline maps")}</span>
      </Chip>

      <Chip className={cn('top-2 right-2 transition-all duration-300', broadcasting ? 'opacity-100 border-accent/70' : 'opacity-40')}>
        <Radio className="w-3 h-3 text-accent" />
        <span>{tr("Leader broadcast")}</span>
        <MicBars on={broadcasting} />
      </Chip>

      <Chip className="bottom-2 left-2 animate-slide-up delay-100">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        <span className="font-mono tabular-nums">{tr("Tail rider {0}", [`${tailMetres} m`])}</span>
      </Chip>

      <Chip className={cn('bottom-2 right-2 border-red-500/70 text-red-400 transition-all duration-300', ping ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')}>
        <LifeBuoy className="w-3 h-3" />
        {tr("Guide ping sent")}
      </Chip>
    </Frame>
  );
}

// ---- Track Pack Pro: pit board, helmet calls, flags ---------------------------

const CIRCUIT: Pt[] = [[24, 24], [96, 18], [120, 26], [128, 44], [104, 52], [70, 50], [58, 62], [84, 72], [120, 70], [132, 82], [108, 92], [30, 90], [14, 70], [14, 40], [24, 24]];

function TrackScene() {
  const t = useSceneTime();
  const lapLen = 7;
  const lap = Math.floor(t / lapLen) + 4;
  const f = (t % lapLen) / lapLen;
  const bike = along(CIRCUIT, f);
  // A made-up but steady pit board: each lap's time and delta come from its number.
  const lastTime = 102 + ((lap * 37) % 17) / 10;
  const delta = (((lap * 53) % 13) - 6) / 10;
  const call = lap % 3 === 0 ? tr("BOX") : lap % 3 === 1 ? tr("PUSH") : null;
  const showCall = call && f > 0.15 && f < 0.6;
  const flag = lap % 4 === 2 && f > 0.4 && f < 0.75 ? 'yellow' : f > 0.93 ? 'chequered' : null;
  const trailStart = Math.max(0, f - 0.18);
  const trail: Pt[] = Array.from({ length: 12 }, (_, i) => along(CIRCUIT, trailStart + ((f - trailStart) * i) / 11));

  return (
    <Frame>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path d={path(CIRCUIT)} stroke="white" strokeOpacity={0.14} strokeWidth={5} fill="none" strokeLinejoin="round" />
        <path d={path(CIRCUIT)} stroke="white" strokeOpacity={0.3} strokeWidth={1} fill="none" strokeLinejoin="round" strokeDasharray="2 3" />
        <path d={path(trail)} stroke="hsl(var(--accent))" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={24} y1={20} x2={24} y2={29} stroke="white" strokeWidth={1.4} />
      </svg>
      <Marker p={bike} label="7" className="bg-accent" />

      {/* Pit board */}
      <div className="absolute top-2 right-2 w-[38%] rounded-lg bg-black/85 border border-white/15 px-2 py-1.5 font-mono tabular-nums animate-fade-in no-frost">
        <p className="text-[8px] uppercase tracking-widest text-muted-foreground">{tr("Lap {0}", [lap])}</p>
        <p className="text-sm font-bold leading-tight text-white">
          {Math.floor(lastTime / 60)}:{(lastTime % 60).toFixed(1).padStart(4, '0')}
        </p>
        <p className={cn('text-xs font-bold', delta <= 0 ? 'text-emerald-400' : 'text-red-400')}>
          Δ {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}
        </p>
      </div>

      {/* Helmet call */}
      <Chip className={cn('left-2 top-2 border-accent/70 transition-all duration-300', showCall ? 'opacity-100 scale-100' : 'opacity-0 scale-90')}>
        <Mic className="w-3 h-3 text-accent" />
        <span className="text-accent tracking-widest">{call}</span>
      </Chip>

      {/* Race control flag */}
      <div
        className={cn(
          'absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition-all duration-300',
          flag ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
          flag === 'yellow' ? 'bg-yellow-400 text-black' : 'text-black',
        )}
        style={flag === 'chequered' ? { background: 'repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 8px 8px' } : undefined}
      >
        <Flag className="w-3 h-3" />
        <span className={flag === 'chequered' ? 'bg-white px-1 rounded' : ''}>
          {flag === 'chequered' ? tr("Chequered flag") : tr("Yellow flag")}
        </span>
      </div>
    </Frame>
  );
}

// ---- Billion: every module, your branding, no limits --------------------------

const BRAND_HUES = [32, 200, 330, 150];

function BillionScene() {
  const t = useSceneTime();
  const lit = Math.floor(t / 1.1) % 4;
  const hue = BRAND_HUES[Math.floor(t / 2.2) % BRAND_HUES.length];
  const brand = `hsl(${hue} 90% 58%)`;
  const modules: { tier: EnterpriseTier; Icon: typeof GraduationCap }[] = [
    { tier: 'track_pro', Icon: Flag },
    { tier: 'showroom', Icon: Store },
    { tier: 'academy', Icon: GraduationCap },
    { tier: 'touring', Icon: Mountain },
  ];

  return (
    <Frame className="p-3 flex gap-3">
      <div className="flex-1 grid grid-cols-2 gap-2">
        {modules.map(({ tier, Icon }, i) => (
          <div
            key={tier}
            className={cn(
              'rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-500 animate-scale-in no-frost',
              lit === i ? 'bg-accent/15 border-accent scale-[1.03] shadow-[0_0_14px_hsl(var(--accent)/0.35)]' : 'bg-card/60 border-border/40',
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <Icon className={cn('w-4 h-4 transition-colors', lit === i ? 'text-accent' : 'text-muted-foreground')} />
            <span className="text-[8px] font-semibold text-center leading-tight px-1">{tierName(tier)}</span>
          </div>
        ))}
      </div>
      <div className="w-[34%] flex flex-col gap-2">
        {/* A phone in the organisation's colours, cycling through brands */}
        <div className="flex-1 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-colors duration-700 animate-fade-in no-frost" style={{ borderColor: brand, background: `hsl(${hue} 60% 12%)` }}>
          <Palette className="w-4 h-4 transition-colors duration-700" style={{ color: brand }} />
          <span className="text-[8px] font-semibold text-center px-1 transition-colors duration-700" style={{ color: brand }}>{tr("Custom branding")}</span>
        </div>
        <div className="rounded-xl bg-card/80 border border-border/40 flex items-center justify-center gap-1 py-1.5 animate-slide-up delay-200 no-frost">
          <InfinityIcon className="w-4 h-4 text-accent" />
          <span className="text-[8px] font-semibold">{tr("Unlimited seats")}</span>
        </div>
      </div>
    </Frame>
  );
}

export function TierShowcase({ tier }: { tier: EnterpriseTier }) {
  switch (tier) {
    case 'academy':
      return <AcademyScene />;
    case 'showroom':
      return <ShowroomScene />;
    case 'touring':
      return <TouringScene />;
    case 'track_pro':
      return <TrackScene />;
    case 'billion':
      return <BillionScene />;
  }
}
