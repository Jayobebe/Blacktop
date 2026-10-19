/* eslint-disable react-refresh/only-export-components -- scenes export their running times for the tour */
import {
  Check,
  Fuel,
  Gauge,
  LifeBuoy,
  Lock,
  LockOpen,
  Map as MapIcon,
  Mic,
  Pause,
  Play,
  Route as RouteIcon,
  Shield,
  Siren,
  Users,
  Vibrate,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import type { SceneCueKind } from '@/lib/radioFx';
import { useSettings } from '@/features/settings';
import { formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import {
  A,
  AMBER,
  Arrow,
  BG,
  BURN,
  Base,
  BikePhoto,
  Chip,
  Defs,
  Frame,
  GREEN,
  INK,
  Ico,
  LINE,
  MUTED,
  PANEL,
  Panel,
  RED,
  Rings,
  Road,
  Route,
  T,
  VH,
  VW,
  Vignette,
  Wave,
  aa,
  bikeAt,
  clamp01,
  cues,
  timeAt,
  type SceneCue,
  easeInOut,
  easeOut,
  easeOutBack,
  frac,
  lerp,
  loopT,
  popAt,
  textW,
  useIds,
  useSceneTime,
  win,
  type Icon,
  type Pt,
  Mica,
} from '@/components/scene/kit';

/*
 * Demo tour scenes, part one: the intro, the live ride screen and the
 * anti-theft alarm. The map scenes (convoy, passenger, roads, hazards, rescue)
 * are drawn on the map kit, in scenesConvoy.tsx and scenesRoads.tsx. Each is a
 * short story on the shared 320×200 scene canvas, in the app's own look,
 * looping cleanly.
 */

const GREY = '#b4b4bb';
/** Font size that fits `label` into `maxW` scene units (never above `size`). */
const fit = (label: string, maxW: number, size = 7) => Math.min(size, maxW / Math.max(1, label.length * 0.56));
const DIM = '#7c7c85';

/** The rider's units, for any speed or distance a scene shows. */
function useUnits() {
  const { settings } = useSettings();
  const km = settings.distanceUnit === 'km';
  return {
    speed: (mph: number) => formatSpeed(mph, settings.speedUnit),
    speedLabel: getSpeedLabel(settings.speedUnit),
    dist: (mi: number) => formatDistance(mi, settings.distanceUnit),
    distLabel: getDistanceLabel(settings.distanceUnit),
    /** A distance ahead as the turn banner shows it (`shortDistance`): feet or metres, then miles or km. */
    ahead: (ft: number) => {
      if (!km) return ft < 1000 ? tr("{0} ft", [Math.max(50, Math.round(ft / 50) * 50)]) : tr("{0} mi", [(ft / 5280).toFixed(1)]);
      const m = ft * 0.3048;
      const step = m < 300 ? 10 : 50;
      return m < 1000 ? tr("{0} m", [Math.max(10, Math.round(m / step) * step)]) : tr("{0} km", [(m / 1000).toFixed(1)]);
    },
    amber: settings.amberSpeedThreshold,
    red: settings.redSpeedThreshold,
  };
}

/** Fade the whole scene in at the start of the loop and out at the end. */
const loopFade = (t: number, period: number) => clamp01(t / 0.4) * (1 - clamp01((t - (period - 0.45)) / 0.45));

// =============================================================================
// Intro: a rider runs the road and the app's pillars light up along it
// =============================================================================

const INTRO_P = 10;
const INTRO_ROAD = new Route([[-14, 162], [48, 154], [104, 132], [160, 140], [214, 116], [268, 102], [334, 76]], false, 16);
const INTRO_STOPS: { f: number; I: Icon; up: boolean }[] = [
  { f: 0.12, I: Users, up: true },
  { f: 0.27, I: Mic, up: false },
  { f: 0.42, I: RouteIcon, up: true },
  { f: 0.57, I: Gauge, up: false },
  { f: 0.72, I: LifeBuoy, up: true },
  { f: 0.87, I: Shield, up: false },
];

const introF = (t: number) => 0.02 + 0.96 * easeInOut(t / 8.4);
const INTRO_CUES = cues([0.3, 'whoosh'], ...INTRO_STOPS.map((s): [number | null, SceneCueKind] => [timeAt(introF, s.f, 0, 8.4), 'tap']), [8.2, 'success']);

export function IntroScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), INTRO_P);
  const f = 0.02 + 0.96 * easeInOut(t / 8.4);
  const rider = INTRO_ROAD.at(f);
  const labels = [tr("Convoy"), tr("Voice"), tr("Routes"), tr("Tracking"), tr("Safety"), tr("Privacy")];
  const underline = easeInOut((t - 0.3) / 1.2);
  return (
    <Frame sound={{ t, cues: INTRO_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, INTRO_P)}>
        <Road d={INTRO_ROAD.d} w={9} />
        <path d={INTRO_ROAD.slice(0, f, 70)} fill="none" style={{ stroke: A }} strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
        {INTRO_STOPS.map((s, i) => {
          const at = INTRO_ROAD.at(s.f).p;
          const k = easeOutBack((f - s.f) * 14);
          const label = labels[i];
          const w = 20 + textW(label);
          const cy = s.up ? at[1] - 32 : at[1] + 15;
          const x0 = Math.min(VW - w - 6, Math.max(6, at[0] - w / 2));
          const reached = f >= s.f;
          return (
            <g key={i}>
              <circle cx={at[0]} cy={at[1]} r={reached ? 2.6 : 2} style={{ fill: reached ? A : '#3a3a42' }} />
              {k > 0 && (
                <g transform={popAt([at[0], cy + 8.5], k)} opacity={clamp01(k)}>
                  <line x1={at[0]} y1={s.up ? cy + 17 : cy} x2={at[0]} y2={s.up ? at[1] - 3.5 : at[1] + 3.5} stroke="white" strokeOpacity={0.18} strokeWidth={1} />
                  <Chip x={x0} y={cy} label={label} I={s.I} />
                </g>
              )}
            </g>
          );
        })}
        <Arrow p={rider.p} a={rider.a} color={A} glow={id('glow')} />
        {/* The title above everything that moves, on its own faded backing. */}
        <Mica id={id} x={44} y={20} w={232} h={62} />
        <T x={160} y={56} anchor="middle" size={30} weight={800} spacing={6}>BLACKTOP</T>
        <rect x={160 - 72 * underline} y={64} width={144 * underline} height={1.6} rx={0.8} style={{ fill: A }} />
        <Chip x={8} y={8} label={tr("No signup required")} I={Lock} opacity={easeOut((t - 8.2) / 0.5)} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Live ride data: speed that glows past your thresholds, lean and the G circle
// =============================================================================

const LD_P = 10;
const leanAt = (s: number) => 44 * Math.sin((s / LD_P) * Math.PI * 6) * (0.6 + 0.4 * Math.sin(s * 0.7));
const longAt = (s: number) => 0.55 * Math.sin(s * 2.1 + 1) * (0.7 + 0.3 * Math.cos(s * 1.3));

export function LiveDataScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), LD_P);
  const mphAt = (s: number) => 62 + 30 * Math.sin((s / LD_P) * Math.PI * 2 - Math.PI / 2) + 4 * Math.sin(s * 3);
  const mph = mphAt(t);
  // A beep as the speed crosses the rider's amber and red thresholds (on the way up).
  const ldCues = cues([timeAt(mphAt, u.amber, 0, LD_P / 2), 'beep'], [timeAt(mphAt, u.red, 0, LD_P / 2), 'camera']);
  const color = mph >= u.red ? RED : mph >= u.amber ? AMBER : INK;
  const lean = leanAt(t);
  // Everything up to now, for the peaks.
  const past = Array.from({ length: 48 }, (_, i) => (t * i) / 47);
  const maxL = Math.max(0, ...past.map((s) => -leanAt(s)));
  const maxR = Math.max(0, ...past.map((s) => leanAt(s)));
  const maxMph = Math.max(...past.map((s) => 62 + 30 * Math.sin((s / LD_P) * Math.PI * 2 - Math.PI / 2) + 4 * Math.sin(s * 3)));
  const G: Pt = [268, 96];
  const GR = 34;
  const gScale = 1.2;
  const gAt = (s: number): Pt => [Math.tan((leanAt(s) * Math.PI) / 180) * 0.9, longAt(s)];
  const bins = 24;
  const env = Array.from({ length: bins }, () => 0);
  for (const s of past) {
    const [x, y] = gAt(s);
    const m = Math.hypot(x, y);
    const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * bins) % bins;
    env[b] = Math.max(env[b], m);
  }
  const envPts = env.map((m, b) => {
    const a = ((b + 0.5) / bins) * Math.PI * 2 - Math.PI;
    const r = (Math.min(m, gScale) / gScale) * GR;
    return `${(G[0] + Math.cos(a) * r).toFixed(1)},${(G[1] + Math.sin(a) * r).toFixed(1)}`;
  });
  const [gx, gy] = gAt(t);
  const leanArc = (deg: number, r: number): Pt => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [178 + Math.cos(a) * r, 118 + Math.sin(a) * r];
  };
  const needle = leanArc(lean, 38);
  const secs = 754 + Math.floor(t);

  return (
    <Frame sound={{ t, cues: ldCues }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, LD_P)}>
        {/* Speed */}
        <g filter={color === INK ? undefined : `url(#${id('glow')})`}>
          <T x={64} y={104} anchor="middle" size={58} weight={800} color={color} mono>{u.speed(mph)}</T>
        </g>
        <T x={64} y={120} anchor="middle" size={8} color={MUTED} weight={700} spacing={1}>{u.speedLabel}</T>

        {/* Lean */}
        <path d={`M${leanArc(-60, 44)[0]} ${leanArc(-60, 44)[1]} A44 44 0 0 1 ${leanArc(60, 44)[0]} ${leanArc(60, 44)[1]}`} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={6} strokeLinecap="round" />
        {[-45, -30, -15, 0, 15, 30, 45].map((d) => {
          const [a, b] = [leanArc(d, 50), leanArc(d, d % 45 === 0 ? 55 : 53)];
          return <line key={d} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="white" strokeOpacity={d === 0 ? 0.5 : 0.25} strokeWidth={1} />;
        })}
        {[-maxL, maxR].map((d, i) => {
          const [a, b] = [leanArc(Math.max(-60, Math.min(60, d)), 40), leanArc(Math.max(-60, Math.min(60, d)), 48)];
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} style={{ stroke: A }} strokeWidth={2} strokeLinecap="round" />;
        })}
        <line x1={178} y1={118} x2={needle[0]} y2={needle[1]} style={{ stroke: A }} strokeWidth={2.2} strokeLinecap="round" />
        <circle cx={178} cy={118} r={3.4} style={{ fill: A }} />
        <T x={178} y={138} anchor="middle" size={11} weight={800} mono>{`${Math.abs(Math.round(lean))}°`}</T>
        <T x={178} y={148} anchor="middle" size={6} color={MUTED}>{tr("Lean · max {0}° L / {1}° R", [Math.round(maxL), Math.round(maxR)])}</T>

        {/* Friction circle */}
        <circle cx={G[0]} cy={G[1]} r={GR} fill="none" stroke="white" strokeOpacity={0.14} />
        <circle cx={G[0]} cy={G[1]} r={GR / 2} fill="none" stroke="white" strokeOpacity={0.08} />
        <line x1={G[0] - GR} y1={G[1]} x2={G[0] + GR} y2={G[1]} stroke="white" strokeOpacity={0.08} />
        <line x1={G[0]} y1={G[1] - GR} x2={G[0]} y2={G[1] + GR} stroke="white" strokeOpacity={0.08} />
        <polygon points={envPts.join(' ')} style={{ fill: aa(0.14), stroke: A }} strokeWidth={1.1} strokeLinejoin="round" />
        <circle cx={G[0] + (gx / gScale) * GR} cy={G[1] + (gy / gScale) * GR} r={3.2} fill="white" />
        <T x={G[0]} y={G[1] + GR + 12} anchor="middle" size={6} color={MUTED}>{tr("Cornering and braking G")}</T>

        {/* Stats */}
        {[
          { label: tr("Distance"), value: `${u.dist(4.2 + t * 0.018)} ${u.distLabel}` },
          { label: tr("Time"), value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` },
          { label: tr("Max"), value: `${u.speed(maxMph)} ${u.speedLabel}` },
        ].map((s, i) => (
          <Panel key={i} x={8 + i * 102} y={160} w={98} h={32} r={7}>
            <T x={8} y={12} size={6} color={MUTED}>{s.label}</T>
            <T x={8} y={25} size={10} weight={800} mono>{s.value}</T>
          </Panel>
        ))}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Grabbing fuel? The anti-theft alarm for a quick stop: the first tap on the
// alarm sets the pattern, it arms, a nudge warns, a push counts down to the
// siren, and only the pattern stops it (the ride stays paused until play).
// =============================================================================

const AL_P = 12;
const AL_CUES: SceneCue[] = [
  [0.8, 'tap'],
  [1.1, 'tap'],
  [2.15, 'tap'],
  [2.75, 'success'],
  [3.95, 'lock'],
  [4.6, 'beep'],
  [6.1, 'caution'],
  [7.3, 'siren'],
  [8.3, 'tap'],
  [9.1, 'unlock'],
];

export const ALARM_SECONDS = AL_P;
export function AlarmScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), AL_P);
  return (
    <Frame sound={{ t, cues: AL_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <AlarmAct t={t} id={id} />
      <Vignette id={id} />
    </Frame>
  );
}

/** The phone on the bars, shown big beside the bike. */
const AL_PHONE = { x: 204, y: 8, w: 100, h: 184 };
const AL_SCREEN = { x: AL_PHONE.x + 4, y: AL_PHONE.y + 4, w: AL_PHONE.w - 8, h: AL_PHONE.h - 8 };
const AL_CX = AL_PHONE.x + AL_PHONE.w / 2;
const AL_LOCK: Pt = [AL_CX, 52];
/** The ride screen's alarm button: in the row of controls, between pause and the map. */
const AL_BTN: Pt = [AL_CX, 160];
/** The rescue button, on its own row above the controls. */
const AL_RESCUE: Pt = [AL_CX, 130];
/** The pattern pad's dots, row by row. */
const alDot = (i: number): Pt => [AL_CX + ((i % 3) - 1) * 24, 144 + (Math.floor(i / 3) - 1) * 24];
/** The rider's pattern: along the top, then down the right. */
const AL_PATTERN = [0, 1, 2, 5, 8];
const AL_BIKE = { cx: 88, floor: 176, height: 100 };
/** The rear tyre on the ground (the bike pivots on it when pushed) and the phone on the bars. */
const AL_PIVOT = bikeAt(AL_BIKE, 158, 840);
const AL_BAR = bikeAt(AL_BIKE, 498, 352);
/** Pattern draws: twice to set it the first time, then once to stop the siren. */
const AL_DRAWS = [
  { from: 1.1, dur: 0.75, until: 2 },
  { from: 2.15, dur: 0.6, until: 2.95 },
  { from: 8.3, dur: 0.8, until: 9.5 },
];

/** A finger drawing `pattern` at f (0..1): where it is, the line so far and the dots it has joined. */
function traceAt(pattern: number[], f: number) {
  const pts = pattern.map(alDot);
  const x = clamp01(f) * (pts.length - 1);
  const k = Math.min(pts.length - 2, Math.floor(x));
  const r = x - k;
  const tip: Pt = [lerp(pts[k][0], pts[k + 1][0], r), lerp(pts[k][1], pts[k + 1][1], r)];
  return { tip, line: [...pts.slice(0, k + 1), tip], joined: pattern.slice(0, k + 1 + (r > 0.8 ? 1 : 0)) };
}

function AlarmAct({ t, id }: { t: number; id: (n: string) => string }) {
  const u = useUnits();

  // The bike: a nudge wobbles it, a push lifts the front and rolls it on, let go at the siren.
  const nudgeK = t > 4.6 && t < 5.6 ? 1 - (t - 4.6) : 0;
  const wobble = Math.sin((t - 4.6) * Math.PI * 6) * nudgeK * 1.3;
  const push = easeInOut((t - 6.1) / 0.6) * (1 - easeInOut((t - 7.4) / 0.7));
  const tilt = wobble - push * 3;
  const roll = push * 6;
  const moved = (p: Pt): Pt => {
    const a = (tilt * Math.PI) / 180;
    const dx = p[0] - AL_PIVOT[0];
    const dy = p[1] - AL_PIVOT[1];
    return [AL_PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a) + roll, AL_PIVOT[1] + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const bar = moved(AL_BAR);
  // What the phone feels.
  const tiltRead = Math.abs(wobble) * 3.2 + push * 12;
  const gRead = 1 + 0.01 * Math.sin(t * 7) + Math.abs(wobble) * 0.12 + push * (0.25 + 0.2 * Math.abs(Math.sin(t * 13)));

  // What the phone shows.
  const phase = t < 0.95 ? 'ride' : t < 2.95 ? 'setup' : t < 3.95 ? 'arming' : t < 6.1 ? 'armed' : t < 7.3 ? 'entry' : t < 9.5 ? 'alarm' : 'ride';
  const paused = t >= 9.5;
  const nudging = t >= 4.6 && t < 6;
  const siren = t >= 7.3 && t < 9.1;
  const matched = (t >= 2.75 && t < 2.95) || (t >= 9.1 && t < 9.5);
  const draw = AL_DRAWS.find((d) => t >= d.from && t < d.until);
  const trace = draw ? traceAt(AL_PATTERN, (t - draw.from) / draw.dur) : null;
  const ink = matched ? GREEN : 'white';
  const ring = phase === 'arming' ? 1 - clamp01((t - 2.95) / 1) : phase === 'entry' ? 1 - clamp01((t - 6.1) / 1.2) : null;
  let finger: { p: Pt; o: number } | null = t >= 0.4 && t < 1 ? { p: AL_BTN, o: win(t, 0.4, 1, 0.15) } : null;
  for (const d of AL_DRAWS) {
    const end = d.from + d.dur;
    if (t >= d.from - 0.15 && t < end + 0.12) finger = { p: traceAt(AL_PATTERN, (t - d.from) / d.dur).tip, o: win(t, d.from - 0.15, end + 0.12, 0.12) };
  }
  let title = '';
  let sub = '';
  let subColor = MUTED;
  if (phase === 'setup') {
    title = tr("Set your unlock pattern");
    sub = t < 2 ? tr("Join at least 4 dots") : tr("Draw it again to confirm");
  } else if (phase === 'arming') {
    title = tr("Arming…");
  } else if (phase === 'armed') {
    title = tr("Alarm armed");
    sub = nudging ? tr("Movement detected") : tr("Draw your pattern to unlock");
    if (nudging) subColor = AMBER;
  } else if (phase === 'entry') {
    title = tr("Movement detected");
  } else if (phase === 'alarm') {
    title = tr("ALARM");
    sub = tr("Draw your pattern to stop it");
    subColor = AMBER;
  }
  const loud = phase === 'entry' || phase === 'alarm';
  const toast = tr("Alarm off");
  const toastW = 20 + textW(toast, 6);
  const spot = 'M52 0 L124 0 L168 176 L8 176 Z';

  return (
    <g opacity={loopFade(t, AL_P)}>
      <defs>
        <linearGradient id={id('al-floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15151a" />
          <stop offset="1" stopColor="#0a0a0c" />
        </linearGradient>
        <radialGradient id={id('al-spot')} cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="white" stopOpacity="0.1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('al-screen')}>
          <rect x={AL_SCREEN.x} y={AL_SCREEN.y} width={AL_SCREEN.w} height={AL_SCREEN.h} rx={11} />
        </clipPath>
      </defs>

      {/* Pulled in at a fuel station: the canopy's lit edge overhead, a pump beside the bike */}
      <rect x={0} y={0} width={198} height={9} fill="#141418" />
      <rect x={0} y={9} width={198} height={1.2} fill="white" opacity={0.2} />
      <g transform="translate(8 108)">
        <rect x={-2} y={66} width={32} height={3} rx={1} fill="#1f1f25" />
        <rect width={28} height={67} rx={3} fill="#17171c" stroke="#2c2c33" strokeWidth={0.8} />
        <rect x={4} y={6} width={20} height={10} rx={1.5} fill="#0b0b0e" stroke="#2c2c33" strokeWidth={0.5} />
        <rect x={6} y={10} width={9} height={2} rx={0.5} fill={GREEN} opacity={0.7} />
        <rect x={7} y={22} width={14} height={14} rx={3.5} fill="#2563eb" />
        <Ico I={Fuel} x={10} y={25} s={8} color="#fff" />
        <path d="M28 30 q8 4 6 18 q-1 7 -6 8" fill="none" stroke="#0f0f13" strokeWidth={2} strokeLinecap="round" />
        <rect x={26} y={40} width={5} height={10} rx={1.5} fill="#26262d" />
      </g>
      {/* Parked in a pool of light */}
      <rect x={0} y={AL_BIKE.floor} width={198} height={VH - AL_BIKE.floor} fill={`url(#${id('al-floor')})`} />
      <line x1={0} y1={AL_BIKE.floor} x2={198} y2={AL_BIKE.floor} stroke="white" strokeOpacity={0.08} />
      <path d={spot} fill={`url(#${id('al-spot')})`} />
      {siren && <path d={spot} fill={RED} opacity={0.06 + 0.05 * Math.sin(t * 14)} />}
      <ellipse cx={AL_BIKE.cx + roll} cy={AL_BIKE.floor + 2} rx={54} ry={4} fill="black" opacity={0.6} />
      <g transform={`translate(${roll.toFixed(2)} 0) rotate(${tilt.toFixed(2)} ${AL_PIVOT[0].toFixed(1)} ${AL_PIVOT[1].toFixed(1)})`}>
        <BikePhoto {...AL_BIKE} />
        <rect x={AL_BAR[0] - 2.4} y={AL_BAR[1] - 8} width={4.8} height={8} rx={1} fill="#0b0b0e" stroke="#3a3a42" strokeWidth={0.6} />
      </g>
      {(nudgeK > 0 || push > 0.05) && (
        <g stroke={push > 0.05 ? AMBER : 'white'} strokeOpacity={0.55 * Math.max(nudgeK, push)} strokeWidth={1} strokeLinecap="round" fill="none">
          <path d={`M${AL_BIKE.cx - 58} 128 q -5 8 0 16`} />
          <path d={`M${AL_BIKE.cx - 64} 124 q -7 12 0 24`} />
          <path d={`M${AL_BIKE.cx + 60} 128 q 5 8 0 16`} />
          <path d={`M${AL_BIKE.cx + 66} 124 q 7 12 0 24`} />
        </g>
      )}

      {/* The siren, from the phone */}
      {siren && <Rings p={[bar[0], bar[1] - 4]} phase={frac(t * 1.6)} color={RED} max={36} count={3} />}
      {siren && <Rings p={AL_LOCK} phase={frac(t * 1.6 + 0.3)} color={RED} max={78} count={3} />}

      {/* The phone on the bars, up close */}
      <line x1={bar[0] + 2.4} y1={bar[1] - 8} x2={AL_PHONE.x} y2={AL_PHONE.y + 16} stroke="white" strokeOpacity={0.1} />
      <line x1={bar[0] + 2.4} y1={bar[1]} x2={AL_PHONE.x} y2={AL_PHONE.y + AL_PHONE.h - 16} stroke="white" strokeOpacity={0.1} />
      <rect x={AL_PHONE.x} y={AL_PHONE.y} width={AL_PHONE.w} height={AL_PHONE.h} rx={15} fill="#121216" stroke="#2c2c33" strokeWidth={1} />
      <g clipPath={`url(#${id('al-screen')})`}>
        <rect x={AL_SCREEN.x} y={AL_SCREEN.y} width={AL_SCREEN.w} height={AL_SCREEN.h} fill={phase === 'ride' ? BG : '#000'} />
        {phase === 'ride' ? (
          <g>
            {paused && (
              <g>
                <rect x={AL_CX - 18} y={34} width={36} height={10} rx={3} fill={AMBER} fillOpacity={0.14} />
                <T x={AL_CX} y={41.2} anchor="middle" size={5.2} weight={700} color={AMBER} spacing={0.4}>{tr("PAUSED")}</T>
              </g>
            )}
            <T x={AL_CX} y={76} anchor="middle" size={34} weight={800} mono>{u.speed(0)}</T>
            <T x={AL_CX} y={86} anchor="middle" size={5.5} weight={700} color={MUTED} spacing={0.8}>{u.speedLabel}</T>
            {[
              { label: tr("Distance"), value: u.dist(12.4) },
              { label: tr("Time"), value: '0:48' },
              { label: tr("Max"), value: u.speed(71) },
            ].map((s, i) => (
              <g key={i}>
                <T x={AL_CX + (i - 1) * 29} y={100} anchor="middle" size={fit(s.label, 27, 4.4)} color={MUTED}>{s.label}</T>
                <T x={AL_CX + (i - 1) * 29} y={109} anchor="middle" size={7} weight={800} mono>{s.value}</T>
              </g>
            ))}
            <circle cx={AL_RESCUE[0]} cy={AL_RESCUE[1]} r={9} style={{ fill: BURN }} />
            <T x={AL_RESCUE[0]} y={AL_RESCUE[1] + 3.5} anchor="middle" size={10} weight={900} color="#fff">R</T>
            {[
              { I: paused ? Play : Pause, color: paused ? A : GREY, fill: paused ? aa(0.2) : '#1c1c22' },
              { I: Siren, color: BURN, fill: '#1c1c22' },
              { I: MapIcon, color: GREY, fill: '#1c1c22' },
            ].map((b, i) => (
              <g key={i}>
                <circle cx={AL_CX + (i - 1) * 26} cy={160} r={9.5} style={{ fill: b.fill }} />
                <Ico I={b.I} x={AL_CX + (i - 1) * 26 - 4.5} y={155.5} s={9} color={b.color} />
              </g>
            ))}
            {t < 1.3 && t > 0.8 && (
              <circle cx={AL_BTN[0]} cy={AL_BTN[1]} r={9.5 + ((t - 0.8) / 0.5) * 16} fill="none" style={{ stroke: BURN }} strokeWidth={1.2} opacity={0.7 * (1 - (t - 0.8) / 0.5)} />
            )}
            {paused && (
              <g opacity={win(t, 9.55, 11.5, 0.25)}>
                <rect x={AL_CX - toastW / 2} y={14} width={toastW} height={15} rx={5} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
                <Ico I={Check} x={AL_CX - toastW / 2 + 5} y={17.5} s={8} color={GREEN} />
                <T x={AL_CX - toastW / 2 + 16} y={24.2} size={6}>{toast}</T>
              </g>
            )}
          </g>
        ) : (
          <g>
            {siren && <rect x={AL_SCREEN.x} y={AL_SCREEN.y} width={AL_SCREEN.w} height={AL_SCREEN.h} fill={RED} opacity={0.2 + 0.14 * Math.sin(t * 14)} />}
            {ring != null && (
              <g transform={`rotate(-90 ${AL_LOCK[0]} ${AL_LOCK[1]})`}>
                <circle cx={AL_LOCK[0]} cy={AL_LOCK[1]} r={20} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={2} />
                <circle cx={AL_LOCK[0]} cy={AL_LOCK[1]} r={20} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${(125.7 * ring).toFixed(1)} 126`} />
              </g>
            )}
            <g filter={`url(#${id('glow')})`} opacity={loud ? 0.75 + 0.25 * Math.sin(t * 9) : 1}>
              <Ico I={Lock} x={AL_LOCK[0] - 13} y={AL_LOCK[1] - 13} s={26} color={BURN} sw={1.8} />
            </g>
            <T x={AL_CX} y={88} anchor="middle" size={fit(title, AL_SCREEN.w - 12, phase === 'alarm' ? 13 : 8)} weight={800} color={phase === 'alarm' ? RED : INK}>{title}</T>
            {sub && <T x={AL_CX} y={98} anchor="middle" size={fit(sub, AL_SCREEN.w - 12, 5.8)} color={subColor}>{sub}</T>}
            {trace && (
              <polyline points={trace.line.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={ink} strokeOpacity={0.75} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {Array.from({ length: 9 }, (_, i) => {
              const p = alDot(i);
              const on = !!trace && trace.joined.includes(i);
              return (
                <g key={i}>
                  {on && <circle cx={p[0]} cy={p[1]} r={5.8} fill={ink} fillOpacity={0.14} />}
                  <circle cx={p[0]} cy={p[1]} r={on ? 2.4 : 1.7} fill={on ? ink : 'white'} fillOpacity={on ? 1 : 0.55} />
                </g>
              );
            })}
          </g>
        )}
      </g>
      {finger && (
        <g opacity={finger.o}>
          <circle cx={finger.p[0]} cy={finger.p[1]} r={6} fill="white" fillOpacity={0.16} stroke="white" strokeOpacity={0.55} strokeWidth={0.8} />
        </g>
      )}

      {/* What the phone feels, and what it does about it */}
      <Panel x={8} y={8} w={100} h={30} r={6} opacity={win(t, 2.95, 9.4, 0.3)}>
        <T x={8} y={11} size={5.6} color={MUTED}>{tr("Tilt")}</T>
        <T x={8} y={24} size={10} weight={800} color={tiltRead > 8 ? RED : tiltRead > 3 ? AMBER : INK} mono>{`${tiltRead.toFixed(1)}°`}</T>
        <T x={54} y={11} size={5.6} color={MUTED}>{tr("G-force")}</T>
        <T x={54} y={24} size={10} weight={800} color={gRead - 1 > 0.3 ? RED : gRead - 1 > 0.08 ? AMBER : INK} mono>{gRead.toFixed(2)}</T>
      </Panel>
      <Chip x={8} y={46} label={tr("Alarm armed")} I={Lock} color={BURN} extra={5} opacity={win(t, 3.95, 4.62, 0.2)} />
      <Chip x={8} y={46} label={tr("Movement detected")} I={Vibrate} color={AMBER} tone={AMBER} extra={5} opacity={win(t, 4.6, 7.32, 0.2)} />
      <Chip x={8} y={46} label={tr("ALARM")} I={Siren} color={RED} tone={RED} extra={19} opacity={win(t, 7.3, 9.12, 0.2)}>
        <g transform="translate(9 0)">
          <Wave on={siren ? 1 : 0} t={t} color={RED} n={4} />
        </g>
      </Chip>
      <Chip x={8} y={46} label={toast} I={LockOpen} color={GREEN} tone={GREEN} extra={5} opacity={win(t, 9.1, 11.5, 0.3)} />
    </g>
  );
}

