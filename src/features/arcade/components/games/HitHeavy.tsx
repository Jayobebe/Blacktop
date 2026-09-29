import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Crosshair, Flame, Target, Trophy, Zap } from 'lucide-react';
import { useGForce } from '@/hooks/useGForce';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { saveModeBest, saveScore, useArcadeScores, useModeBests } from '../../hooks/useArcadeScores';

/*
 * Hit Heavy: a punch machine on the phone's accelerometer.
 *
 * Classic  - hardest single hit in 5 s (the crew board score, peak G).
 * Flurry   - punches over 2.5 G in 10 s.
 * Precision - five targets; land each punch as close to its G as you can.
 *
 * The sensor gives the peak of each ~50 ms window (total magnitude, ~1 G at
 * rest). A punch starts when a window crosses FIRE and ends when it falls back
 * under ARM (or after 350 ms); its size is the biggest window in between.
 */

type Mode = 'classic' | 'flurry' | 'precision';
type Phase = 'idle' | 'countdown' | 'live' | 'between' | 'result';

const FIRE = 2.5;
const PRECISION_FIRE = 1.8;
const ARM = 1.5;
const COUNT_STEP = 650;
const ROUNDS = 5;
const ROUND_MS = 4000;
const BETWEEN_MS = 1500;
const SAMPLE_MS = 50;

const MODE_MS: Record<Mode, number> = { classic: 5000, flurry: 10000, precision: ROUND_MS };

const RANKS = [
  { min: 0, name: () => tr("Poke") },
  { min: 2, name: () => tr("Jab") },
  { min: 3.5, name: () => tr("Cross") },
  { min: 5, name: () => tr("Hook") },
  { min: 7, name: () => tr("Haymaker") },
  { min: 10, name: () => tr("Knockout") },
];

function rankIndex(g: number): number {
  let i = 0;
  RANKS.forEach((r, k) => { if (g >= r.min) i = k; });
  return i;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precision points for one punch: 100 dead on, 0 at half the target off. */
function precisionPoints(hit: number, target: number): number {
  return Math.max(0, Math.round(100 - (Math.abs(hit - target) / target) * 200));
}

function makeTargets(): number[] {
  const base = [2.6, 3.4, 4.2, 5.0, 5.8];
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.map(t => Math.round((t + (Math.random() - 0.5) * 0.5) * 10) / 10);
}

interface Engine {
  phase: Phase;
  mode: Mode;
  phaseAt: number;
  scale: number;
  live: number;
  peak: number;
  peakAt: number;
  samples: number[];
  marks: number[];
  punches: number;
  hardest: number;
  punch: { on: boolean; peak: number; start: number; end: number; at: number };
  round: number;
  targets: number[];
  hits: (number | null)[];
  gotSample: boolean;
  record: boolean;
}

function freshEngine(mode: Mode, best: number): Engine {
  return {
    phase: 'idle',
    mode,
    phaseAt: 0,
    scale: best > 11 ? 16 : best > 7 ? 12 : 8,
    live: 0,
    peak: 0,
    peakAt: 0,
    samples: [],
    marks: [],
    punches: 0,
    hardest: 0,
    punch: { on: false, peak: 0, start: 0, end: -1e9, at: -1 },
    round: 0,
    targets: [],
    hits: [],
    gotSample: false,
    record: false,
  };
}

// ── Gauge ────────────────────────────────────────────────────────────────

const CX = 150, CY = 132, R = 104;
const SWEEP = 240;
const START = 150; // degrees, SVG coords (clockwise from +x)
const ARC_LEN = (R * SWEEP * Math.PI) / 180;

function polar(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}
function angleFor(g: number, scale: number) {
  return START + (Math.min(Math.max(g, 0), scale) / scale) * SWEEP;
}
function arcPath(fromDeg: number, toDeg: number, r: number) {
  const a = polar(fromDeg, r);
  const b = polar(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function Gauge({ e, center, caption, sub }: { e: Engine; center: React.ReactNode; caption: React.ReactNode; sub?: React.ReactNode }) {
  const live = e.phase === 'live';
  const shown = live ? e.live : 0;
  const scale = e.scale;
  const liveFrac = Math.min(shown, scale) / scale;
  const peakFrac = Math.min(e.peak, scale) / scale;
  const target = e.mode === 'precision' && (e.phase === 'live' || e.phase === 'between') ? e.targets[e.round] : null;
  const ticks = [];
  for (let i = 0; i <= scale; i++) {
    const major = i % 2 === 0;
    const a = angleFor(i, scale);
    const p1 = polar(a, R + 9);
    const p2 = polar(a, R + (major ? 17 : 13));
    ticks.push(
      <line key={`t${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke="hsl(var(--foreground))" strokeOpacity={major ? 0.45 : 0.18} strokeWidth={major ? 1.5 : 1} strokeLinecap="round" />,
    );
    if (major) {
      const lp = polar(a, R + 28);
      ticks.push(
        <text key={`l${i}`} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central"
          className="font-mono" fontSize="10" fill="hsl(var(--muted-foreground))">{i}</text>,
      );
    }
  }
  const peakAngle = angleFor(e.peak, scale);
  const pk1 = polar(peakAngle, R - 9);
  const pk2 = polar(peakAngle, R + 9);

  return (
    <div className="relative w-full max-w-[340px] mx-auto">
      <svg viewBox="0 0 300 236" className="w-full h-auto overflow-visible" aria-hidden>
        <defs>
          <filter id="hh-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {ticks}
        {/* track */}
        <path d={arcPath(START, START + SWEEP, R)} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.07" strokeWidth="12" strokeLinecap="round" />
        {/* target band */}
        {target != null && (
          <path
            d={arcPath(angleFor(target - 0.3, scale), angleFor(target + 0.3, scale), R)}
            fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.55" strokeWidth="16" strokeLinecap="butt"
          />
        )}
        {/* peak hold (this round) */}
        {peakFrac > 0.004 && <path
          d={arcPath(START, START + SWEEP, R)}
          fill="none" stroke="hsl(var(--accent))" strokeOpacity="0.28" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${ARC_LEN * peakFrac} ${ARC_LEN}`}
          style={{ transition: 'stroke-dasharray 160ms ease-out' }}
        />}
        {/* live */}
        {liveFrac > 0.004 && <path
          d={arcPath(START, START + SWEEP, R)}
          fill="none" stroke="hsl(var(--accent))" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${ARC_LEN * liveFrac} ${ARC_LEN}`}
          style={{ transition: 'stroke-dasharray 90ms linear' }}
        />}
        {live && liveFrac > 0.02 && (
          <path
            d={arcPath(START, START + SWEEP, R)}
            fill="none" stroke="hsl(var(--accent))" strokeWidth="12" strokeLinecap="round" opacity="0.6" filter="url(#hh-glow)"
            strokeDasharray={`${ARC_LEN * liveFrac} ${ARC_LEN}`}
            style={{ transition: 'stroke-dasharray 90ms linear' }}
          />
        )}
        {e.peak > 0.05 && (
          <line x1={pk1.x} y1={pk1.y} x2={pk2.x} y2={pk2.y} stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-x-0 top-[26%] flex flex-col items-center pointer-events-none">
        {center}
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{caption}</div>
        {sub && <div className="mt-2">{sub}</div>}
      </div>
    </div>
  );
}

/** The last round's G trace, with each counted punch marked. */
function Trace({ e }: { e: Engine }) {
  const total = Math.round(MODE_MS[e.mode] / SAMPLE_MS);
  const W = 300, H = 44;
  const pts = e.samples.slice(0, total);
  if (pts.length < 2) return <div className="h-11" />;
  const x = (i: number) => (i / (total - 1)) * W;
  const y = (g: number) => H - 2 - (Math.min(g, e.scale) / e.scale) * (H - 6);
  let d = `M 0 ${y(pts[0]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${x(i).toFixed(1)} ${y(pts[i]).toFixed(1)}`;
  const area = `${d} L ${x(pts.length - 1).toFixed(1)} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-11" aria-hidden>
      <line x1="0" x2={W} y1={y(FIRE)} y2={y(FIRE)} stroke="hsl(var(--foreground))" strokeOpacity="0.12" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={area} fill="hsl(var(--accent))" fillOpacity="0.1" />
      <path d={d} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {e.marks.filter(i => i < pts.length).map(i => (
        <circle key={i} cx={x(i)} cy={y(pts[i])} r="2.4" fill="hsl(var(--foreground))" />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</div>
      <div className="font-mono text-lg font-semibold text-foreground leading-tight mt-0.5 truncate">{value}</div>
    </div>
  );
}

function RankLadder({ g }: { g: number }) {
  const at = g > 0 ? rankIndex(g) : -1;
  return (
    <div className="grid grid-cols-6 gap-1">
      {RANKS.map((r, i) => (
        <div key={i} className="flex flex-col items-center gap-1 min-w-0">
          <div className={cn('h-1 w-full rounded-full transition-colors duration-500', i <= at ? 'bg-accent' : 'bg-white/[0.08]')} />
          <div className={cn('text-[9px] leading-tight text-center truncate w-full', i === at ? 'text-foreground font-semibold' : 'text-muted-foreground/70')}>
            {r.name()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Game ─────────────────────────────────────────────────────────────────

export function HitHeavy() {
  const { scores } = useArcadeScores();
  const modeBests = useModeBests();
  const [mode, setMode] = useState<Mode>('classic');
  const [, render] = useReducer((n: number) => n + 1, 0);
  const engine = useRef<Engine>(freshEngine('classic', scores['hit-heavy']));
  const e = engine.current;
  const [noSensor, setNoSensor] = useState(false);
  const [denied, setDenied] = useState(false);

  const bestFor = (m: Mode) =>
    m === 'classic' ? scores['hit-heavy'] : m === 'flurry' ? modeBests['hit-heavy-flurry'] : modeBests['hit-heavy-precision'];

  const sensorOn = e.phase === 'countdown' || e.phase === 'live' || e.phase === 'between';

  const finishPunch = useCallback((g: number) => {
    const s = engine.current;
    if (s.mode === 'precision' && s.phase === 'live' && s.hits[s.round] == null) {
      s.hits[s.round] = g;
      s.phase = 'between';
      s.phaseAt = performance.now();
      haptics.medium();
    }
  }, []);

  const onSample = useCallback((g: number) => {
    const s = engine.current;
    s.gotSample = true;
    if (s.phase !== 'live') return;
    const now = performance.now();
    s.live = g;
    s.samples.push(g);
    if (g > s.peak) { s.peak = g; s.peakAt = now - s.phaseAt; }
    if (g > s.scale) s.scale = g > 12 ? 16 : 12;
    const p = s.punch;
    const fire = s.mode === 'precision' ? PRECISION_FIRE : FIRE;
    if (!p.on) {
      if (g >= fire && now - p.end > 140) {
        p.on = true; p.peak = g; p.start = now; p.at = s.samples.length - 1;
        if (g >= FIRE) { s.punches++; s.marks.push(p.at); }
        if (s.mode !== 'precision') haptics.light();
      }
    } else {
      if (g > p.peak) {
        p.peak = g;
        if (s.marks.length && s.marks[s.marks.length - 1] === p.at) s.marks[s.marks.length - 1] = s.samples.length - 1;
        p.at = s.samples.length - 1;
      }
      if (g < ARM || now - p.start > 350) {
        p.on = false; p.end = now;
        s.hardest = Math.max(s.hardest, p.peak);
        finishPunch(p.peak);
      }
    }
  }, [finishPunch]);

  const { permissionGranted, requestPermission } = useGForce(sensorOn, { display: false, onSample });

  const finish = useCallback(() => {
    const s = engine.current;
    s.phase = 'result';
    s.live = 0;
    if (s.mode === 'classic') s.record = saveScore('hit-heavy', round2(s.peak));
    else if (s.mode === 'flurry') s.record = saveModeBest('hit-heavy-flurry', s.punches);
    else {
      const total = s.targets.reduce((sum, t, i) => sum + (s.hits[i] != null ? precisionPoints(s.hits[i]!, t) : 0), 0);
      s.record = saveModeBest('hit-heavy-precision', total);
    }
    if (s.record) haptics.success();
  }, []);

  // One clock drives the phases and redraws at the sensor's rate.
  useEffect(() => {
    if (!sensorOn) return;
    const id = window.setInterval(() => {
      const s = engine.current;
      const now = performance.now();
      const since = now - s.phaseAt;
      if (s.phase === 'countdown' && since >= COUNT_STEP * 3) {
        s.phase = 'live';
        s.phaseAt = now;
        haptics.medium();
      } else if (s.phase === 'live') {
        if (!s.gotSample && since > 1500) setNoSensor(true);
        if (since >= MODE_MS[s.mode]) {
          if (s.mode === 'precision') {
            if (s.hits[s.round] == null) s.hits[s.round] = s.punch.on ? s.punch.peak : null;
            s.phase = 'between';
            s.phaseAt = now;
          } else {
            finish();
          }
        }
      } else if (s.phase === 'between' && since >= BETWEEN_MS) {
        if (s.round + 1 >= ROUNDS) finish();
        else {
          s.round++;
          s.phase = 'live';
          s.phaseAt = now;
          s.live = 0;
          s.peak = 0;
          s.samples = [];
          s.marks = [];
          s.punch = { on: false, peak: 0, start: 0, end: -1e9, at: -1 };
        }
      }
      render();
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [sensorOn, finish]);

  const start = useCallback(async () => {
    if (!permissionGranted) {
      const ok = await requestPermission();
      setDenied(!ok);
      if (!ok) return;
    }
    const s = freshEngine(mode, mode === 'classic' ? scores['hit-heavy'] : 0);
    if (mode === 'precision') { s.targets = makeTargets(); s.hits = Array(ROUNDS).fill(null); s.scale = 8; }
    s.phase = 'countdown';
    s.phaseAt = performance.now();
    engine.current = s;
    setNoSensor(false);
    render();
  }, [mode, permissionGranted, requestPermission, scores]);

  const reset = useCallback(() => {
    engine.current = freshEngine(mode, mode === 'classic' ? scores['hit-heavy'] : 0);
    render();
  }, [mode, scores]);

  const pickMode = (m: Mode) => {
    if (sensorOn) return;
    haptics.tick();
    setMode(m);
    engine.current = freshEngine(m, m === 'classic' ? scores['hit-heavy'] : 0);
  };

  // ── Derived view ──
  const now = performance.now();
  const since = now - e.phaseAt;
  const timeFrac = e.phase === 'live' ? Math.max(0, 1 - since / MODE_MS[e.mode]) : e.phase === 'countdown' ? 1 : 0;
  const count = 3 - Math.floor(since / COUNT_STEP);
  const best = bestFor(e.mode);
  const precisionTotal = e.targets.reduce((sum, t, i) => sum + (e.hits[i] != null ? precisionPoints(e.hits[i]!, t) : 0), 0);

  let center: React.ReactNode;
  let caption: React.ReactNode;
  let sub: React.ReactNode = null;
  const big = 'font-mono font-semibold tracking-tight text-foreground leading-none';

  if (e.phase === 'countdown') {
    center = <div key={count} className={cn(big, 'text-7xl text-accent animate-scale-in')}>{Math.max(1, count)}</div>;
    caption = tr("Get ready");
  } else if (e.phase === 'live' && since < 450 && !(e.mode === 'precision' && e.round > 0)) {
    center = <div className={cn(big, 'text-6xl text-accent animate-scale-in')}>{tr("Go")}</div>;
    caption = e.mode === 'precision' ? tr("Target {0} G", [e.targets[e.round].toFixed(1)]) : tr("Live");
  } else if (e.phase === 'live') {
    if (e.mode === 'flurry') {
      center = <div className={cn(big, 'text-7xl')}>{e.punches}</div>;
      caption = tr("Punches");
    } else if (e.mode === 'precision') {
      center = <div className={cn(big, 'text-6xl')}>{e.targets[e.round].toFixed(1)}<span className="text-2xl text-muted-foreground ml-1">G</span></div>;
      caption = tr("Target · round {0} of {1}", [e.round + 1, ROUNDS]);
    } else {
      center = <div className={cn(big, 'text-6xl')}>{e.peak.toFixed(2)}<span className="text-2xl text-muted-foreground ml-1">G</span></div>;
      caption = tr("Peak");
      if (e.peak >= 2) sub = <span className="text-xs font-semibold text-accent">{RANKS[rankIndex(e.peak)].name()}</span>;
    }
  } else if (e.phase === 'between') {
    const hit = e.hits[e.round];
    const pts = hit != null ? precisionPoints(hit, e.targets[e.round]) : 0;
    center = hit != null
      ? <div className={cn(big, 'text-6xl animate-scale-in')}>{hit.toFixed(1)}<span className="text-2xl text-muted-foreground ml-1">G</span></div>
      : <div className={cn(big, 'text-4xl text-muted-foreground')}>{tr("Too slow")}</div>;
    caption = tr("Target {0} G", [e.targets[e.round].toFixed(1)]);
    sub = <span className={cn('font-mono text-sm font-semibold', pts >= 80 ? 'text-accent' : 'text-foreground')}>+{pts}</span>;
  } else if (e.phase === 'result') {
    if (e.mode === 'classic') {
      center = <div className={cn(big, 'text-6xl animate-scale-in')}>{e.peak.toFixed(2)}<span className="text-2xl text-muted-foreground ml-1">G</span></div>;
      caption = e.peak > 0 ? RANKS[rankIndex(e.peak)].name() : tr("No hit");
    } else if (e.mode === 'flurry') {
      center = <div className={cn(big, 'text-7xl animate-scale-in')}>{e.punches}</div>;
      caption = tr("Punches");
    } else {
      center = <div className={cn(big, 'text-6xl animate-scale-in')}>{precisionTotal}</div>;
      caption = tr("Points out of {0}", [ROUNDS * 100]);
    }
    if (e.record) sub = <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 px-2.5 py-0.5 text-[11px] font-semibold text-accent"><Trophy className="w-3 h-3" />{tr("New personal best")}</span>;
  } else {
    center = <div className={cn(big, 'text-6xl text-muted-foreground/60')}>{e.mode === 'flurry' ? '0' : e.mode === 'precision' ? '0' : '0.00'}</div>;
    caption = e.mode === 'flurry' ? tr("Punches") : e.mode === 'precision' ? tr("Points") : tr("Peak");
  }

  const fmtBest = (m: Mode, v: number) =>
    v <= 0 ? '—' : m === 'classic' ? `${v.toFixed(2)} G` : m === 'flurry' ? String(v) : `${v}`;

  const MODES: { id: Mode; icon: typeof Zap; label: string; blurb: string }[] = [
    { id: 'classic', icon: Zap, label: tr("Classic"), blurb: tr("One big hit. Your hardest punch in 5 seconds counts.") },
    { id: 'flurry', icon: Flame, label: tr("Flurry"), blurb: tr("As many punches over 2.5 G as you can throw in 10 seconds.") },
    { id: 'precision', icon: Crosshair, label: tr("Precision"), blurb: tr("Five targets. Land each punch as close to its G as you can.") },
  ];
  const modeInfo = MODES.find(m => m.id === mode)!;

  return (
    <div className="flex-1 flex flex-col gap-4 pb-4 min-h-0">
      {/* Mode picker */}
      <div className={cn('grid grid-cols-3 gap-1 p-1 rounded-2xl bg-card/50 border border-white/[0.06]', sensorOn && 'opacity-50 pointer-events-none')}>
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => pickMode(m.id)}
            className={cn(
              'pressable flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition-colors',
              mode === m.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <m.icon className="w-3.5 h-3.5" />
            <span className="truncate">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Machine */}
      <div className="rounded-3xl bg-card/50 border border-white/[0.06] px-4 pt-4 pb-3 flex flex-col gap-3">
        <Gauge e={e} center={center} caption={caption} sub={sub} />

        {/* Time left */}
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: `${timeFrac * 100}%`, transition: e.phase === 'live' ? `width ${SAMPLE_MS}ms linear` : 'none' }} />
        </div>

        {e.mode === 'precision' && e.phase !== 'idle' ? (
          <div className="grid grid-cols-5 gap-1.5">
            {e.targets.map((t, i) => {
              const h = e.hits[i];
              const done = i < e.round || (i === e.round && (e.phase === 'between' || e.phase === 'result'));
              const pts = h != null ? precisionPoints(h, t) : 0;
              return (
                <div key={i} className={cn('rounded-lg border px-1 py-1.5 text-center transition-colors', i === e.round && e.phase !== 'result' ? 'border-accent/50 bg-accent/10' : 'border-white/[0.06] bg-white/[0.02]')}>
                  <div className="font-mono text-[11px] text-muted-foreground">{t.toFixed(1)}</div>
                  <div className={cn('font-mono text-sm font-semibold', done ? (pts >= 80 ? 'text-accent' : 'text-foreground') : 'text-muted-foreground/40')}>
                    {done ? pts : '·'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Trace e={e} />
        )}
      </div>

      {denied && (
        <p className="text-xs text-warning text-center">{tr("Motion access was turned down. Allow it for this app in your browser or phone settings, then try again.")}</p>
      )}

      {noSensor && (
        <p className="text-xs text-warning text-center">{tr("No motion readings yet. Hit Heavy needs a phone's motion sensor.")}</p>
      )}

      {/* Stats / ranks */}
      {e.phase === 'result' ? (
        <div className="flex flex-col gap-3 stagger-in">
          {e.mode === 'classic' && <div style={{ ['--i' as string]: 0 }}><RankLadder g={e.peak} /></div>}
          <div className="grid grid-cols-3 gap-2" style={{ ['--i' as string]: 1 }}>
            {e.mode === 'classic' && <>
              <Stat label={tr("Punches")} value={e.punches} />
              <Stat label={tr("Time to peak")} value={e.peak > 0 ? `${(e.peakAt / 1000).toFixed(1)} s` : '—'} />
              <Stat label={tr("Best")} value={fmtBest('classic', Math.max(best, e.record ? round2(e.peak) : 0))} />
            </>}
            {e.mode === 'flurry' && <>
              <Stat label={tr("Per second")} value={(e.punches / 10).toFixed(1)} />
              <Stat label={tr("Hardest")} value={e.hardest > 0 ? `${e.hardest.toFixed(1)} G` : '—'} />
              <Stat label={tr("Best")} value={fmtBest('flurry', Math.max(best, e.record ? e.punches : 0))} />
            </>}
            {e.mode === 'precision' && <>
              <Stat label={tr("Bullseyes")} value={e.targets.filter((t, i) => e.hits[i] != null && precisionPoints(e.hits[i]!, t) >= 90).length} />
              <Stat label={tr("Average")} value={Math.round(precisionTotal / ROUNDS)} />
              <Stat label={tr("Best")} value={fmtBest('precision', Math.max(best, e.record ? precisionTotal : 0))} />
            </>}
          </div>
        </div>
      ) : e.phase === 'idle' ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-2xl bg-card/50 border border-white/[0.06] px-4 py-3">
            <Target className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-foreground leading-snug">{modeInfo.blurb}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr("Hold the phone tight and punch the air. Keep your grip.")}</p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{tr("Best")}</div>
              <div className="font-mono text-sm font-semibold text-foreground">{fmtBest(mode, bestFor(mode))}</div>
            </div>
          </div>
          {mode === 'classic' && <RankLadder g={scores['hit-heavy']} />}
        </div>
      ) : null}

      <div className="mt-auto">
        {e.phase === 'result' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="xl" onClick={reset}>{tr("Modes")}</Button>
            <Button variant="accent" size="xl" onClick={start}>{tr("Again")}</Button>
          </div>
        ) : e.phase === 'idle' ? (
          <Button variant="accent" size="xl" className="w-full" onClick={start}>
            <Zap className="!size-5" />
            {permissionGranted ? tr("Hit it") : tr("Allow motion and start")}
          </Button>
        ) : (
          <Button variant="outline" size="xl" className="w-full" onClick={reset}>{tr("Stop")}</Button>
        )}
      </div>
    </div>
  );
}
