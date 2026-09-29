import {
  Mic,
  WifiOff,
  Radio,
  LifeBuoy,
  Flag,
  Timer,
  GraduationCap,
  Store,
  Mountain,
  Wrench,
  Bell,
  Mail,
  Check,
  BookOpen,
  Crown,
  Palette,
  Infinity as InfinityIcon,
  Share2,
  Camera,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import {
  VW,
  VH,
  A,
  aa,
  BG,
  INK,
  MUTED,
  PANEL,
  LINE,
  RED,
  AMBER,
  GREEN,
  useSceneTime,
  clamp01,
  lerp,
  frac,
  easeInOut,
  easeOut,
  win,
  rnd,
  sigmoid,
  mmss,
  Route,
  inside,
  Frame,
  useIds,
  Defs,
  Base,
  Vignette,
  Road,
  T,
  Ico,
  textW,
  Chip,
  Wave,
  Dot,
  Arrow,
  Rings,
  type Pt,
  type Icon,
} from '@/components/scene/kit';
import bikeAsset from '@/assets/demo-bike.png.asset.json';
import type { EnterpriseTier } from '../types';
import { tierName } from '../lib/tiers';

/**
 * Animated scenes for the Enterprise page's packages: a small live map or
 * console where the package's headline features play out. Each scene is one
 * SVG on a fixed 320×200 canvas (so nothing stretches), everything moves on
 * smoothed paths with eased timing, and the loops are seamless. Only the open
 * package's scene runs (~30 fps); with reduced motion it holds a still frame.
 */

// =============================================================================
// TrackPack: a whole race — circuit, live timing tower, race control, pit calls
// =============================================================================

const CIRCUIT = new Route(
  [[40, 42], [96, 26], [150, 30], [180, 52], [170, 82], [130, 90], [106, 106], [118, 128], [162, 134], [184, 158], [162, 182], [90, 184], [42, 170], [22, 132], [24, 86]],
  true,
  18,
);
const LAP_S = 8.5;
const RACERS = [
  { code: 'VEL', color: '#f4f4f5', off: 0.0, w: 0.83, ph: 0.2, me: false },
  { code: '#7', color: A, off: -0.028, w: 0.61, ph: 2.1, me: true },
  { code: 'KOR', color: '#c9c9d1', off: -0.058, w: 0.97, ph: 4.0, me: false },
  { code: 'DUN', color: '#a1a1aa', off: -0.092, w: 0.74, ph: 1.3, me: false },
  { code: 'ARI', color: '#7c7c86', off: -0.13, w: 0.88, ph: 5.2, me: false },
];
// Best overall (accent), personal best (white), slower (grey)
const SECTOR_COLORS = [A, '#f4f4f5', '#4b4b53'];

function TrackScene() {
  const id = useIds();
  const t = useSceneTime(6);
  const s = RACERS.map((r) => r.off + t / LAP_S + 0.017 * Math.sin(t * r.w + r.ph) + 0.006 * Math.sin(t * r.w * 2.3 + r.ph * 3));
  const lead = Math.max(...s);
  const rank = s.map((si, i) => s.reduce((acc, sj, j) => (j === i ? acc : acc + sigmoid((sj - si) / 0.004)), 0));
  const me = RACERS.findIndex((r) => r.me);
  const meS = s[me];
  const meF = frac(meS);
  const mePos = CIRCUIT.at(meF);
  const lapNo = (Math.floor(lead) % 12) + 1;

  const cyc = t % 18;
  const yellow = win(cyc, 5.5, 9.5, 0.5);
  const pit = win(cyc, 12, 15.6, 0.4);
  const sf = CIRCUIT.at(0);

  // Mini sectors for #7: each done sector this lap gets a colour from its lap and number.
  const meLap = Math.floor(meS);
  const meSector = Math.floor(meF * 3);
  const delta = ((((meLap * 53) % 13) - 6) / 10).toFixed(1);

  const TX = 204;
  const ROW0 = 36;
  const ROW_H = 21;

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      {/* Circuit */}
      <path d={CIRCUIT.d} fill="none" stroke="#34343c" strokeWidth={12} strokeLinejoin="round" />
      <path d={CIRCUIT.d} fill="none" stroke="#1a1a1f" strokeWidth={9.5} strokeLinejoin="round" />
      <path d={CIRCUIT.d} fill="none" stroke="white" strokeOpacity={0.08} strokeWidth={0.7} strokeDasharray="3 4" />
      {/* Yellow flag: sector 2 lights up */}
      <path d={CIRCUIT.slice(1 / 3, 2 / 3, 40)} fill="none" stroke="#facc15" strokeWidth={9.5} strokeLinecap="round" opacity={0.42 * yellow} />
      {/* Sector ticks and start/finish */}
      {[1 / 3, 2 / 3].map((f) => {
        const { p, a } = CIRCUIT.at(f);
        return <line key={f} x1={-7} x2={7} transform={`translate(${p[0]} ${p[1]}) rotate(${a + 90})`} stroke="white" strokeOpacity={0.35} strokeWidth={1} />;
      })}
      <g transform={`translate(${sf.p[0]} ${sf.p[1]}) rotate(${sf.a + 90})`}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={-6 + (i % 4) * 3} y={-2 + Math.floor(i / 4) * 2} width={3} height={2} fill={(i + Math.floor(i / 4)) % 2 ? '#111' : '#eee'} />
        ))}
      </g>
      {/* #7's trail */}
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={CIRCUIT.slice(meF - 0.07 + i * 0.0117, meF - 0.07 + (i + 1) * 0.0117, 4)} fill="none" style={{ stroke: A }} strokeWidth={3} strokeLinecap="round" opacity={0.12 + i * 0.13} />
      ))}
      {/* Riders (back to front) */}
      {RACERS.map((r, i) => (r.me ? null : <Dot key={r.code} p={CIRCUIT.at(frac(s[i])).p} color={r.color} r={3.6} />))}
      <Arrow p={mePos.p} a={mePos.a} color={A} glow={id('glow')} s={0.95} />

      {/* Race control */}
      <g opacity={yellow} transform={`translate(0 ${lerp(-8, 0, yellow)})`}>
        <rect x={8} y={8} width={textW(tr("Yellow flag")) + 44} height={17} rx={5} fill="#facc15" />
        <Ico I={Flag} x={14} y={12} s={9} color="#111" />
        <T x={27} y={19.4} color="#111" weight={800}>{`${tr("Yellow flag").toUpperCase()} · S2`}</T>
      </g>
      {/* Pit wall → helmet */}
      <g opacity={pit} transform={`translate(0 ${lerp(8, 0, pit)})`}>
        <rect x={8} y={175} width={textW(tr("PUSH")) + 70} height={17} rx={5} fill={PANEL} style={{ stroke: A }} strokeWidth={0.9} />
        <Ico I={Radio} x={14} y={179} s={9} />
        <T x={27} y={186.4} color={MUTED}>PIT → #7</T>
        <T x={62} y={186.4} color={A} weight={800} spacing={0.6}>{tr("PUSH")}</T>
      </g>
      {pit > 0.05 && <Rings p={mePos.p} phase={t * 1.4} color={A} max={16} />}

      {/* Live timing tower */}
      <rect x={TX} y={8} width={108} height={184} rx={7} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
      <circle cx={TX + 11} cy={20} r={2.6} fill={RED} opacity={0.55 + 0.45 * Math.abs(Math.sin(t * 3))} />
      <T x={TX + 18} y={22.6} weight={800} spacing={0.8}>{tr("Live").toUpperCase()}</T>
      <T x={TX + 100} y={22.6} anchor="end" color={MUTED} mono>{tr("Lap {0}", [`${lapNo}/12`])}</T>
      <line x1={TX + 6} x2={TX + 102} y1={29} y2={29} stroke={LINE} />
      {RACERS.map((r, i) => {
        const y = ROW0 + rank[i] * ROW_H;
        const pos = Math.round(rank[i]) + 1;
        const gap = s[i] === lead ? `${Math.floor((LAP_S * 12 + (lapNo * 7) % 9) / 60)}:${(((LAP_S * 12 + (lapNo * 7) % 9) % 60) + 0.3).toFixed(1).padStart(4, '0')}` : `+${((lead - s[i]) * LAP_S * 12).toFixed(1)}`;
        return (
          <g key={r.code} transform={`translate(${TX + 5} ${y.toFixed(2)})`}>
            {r.me && <rect x={0} y={-1} width={98} height={ROW_H - 3} rx={4} style={{ fill: aa(0.14) }} />}
            <T x={8} y={11.8} anchor="middle" mono weight={800} color={r.me ? A : INK}>{pos}</T>
            <rect x={16} y={3} width={2} height={11} rx={1} style={{ fill: r.color }} />
            <T x={23} y={11.8} weight={700}>{r.code}</T>
            <T x={94} y={11.8} anchor="end" mono color={pos === 1 ? INK : MUTED}>{gap}</T>
          </g>
        );
      })}
      {/* #7 mini sectors and delta */}
      <line x1={TX + 6} x2={TX + 102} y1={146} y2={146} stroke={LINE} />
      <T x={TX + 8} y={158} color={MUTED} size={6.5} weight={700} spacing={0.6}>#7</T>
      {[0, 1, 2].map((k) => {
        const done = k < meSector;
        const col = SECTOR_COLORS[Math.floor(rnd(meLap * 3 + k) * 3)];
        return (
          <g key={k} transform={`translate(${TX + 24 + k * 26} 152)`}>
            <rect width={23} height={7} rx={2} style={{ fill: done ? col : 'rgba(255,255,255,0.06)' }} stroke={k === meSector ? INK : 'none'} strokeOpacity={0.5 + 0.5 * Math.sin(t * 6)} strokeWidth={0.8} />
            <T x={11.5} y={170} anchor="middle" size={6} color={MUTED} weight={600}>{`S${k + 1}`}</T>
          </g>
        );
      })}
      <T x={TX + 8} y={186} color={MUTED} size={6.5}>Δ</T>
      <T x={TX + 18} y={186.5} mono weight={800} size={9} color={Number(delta) <= 0 ? GREEN : RED}>{`${Number(delta) > 0 ? '+' : ''}${delta}`}</T>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Showroom: a timed test ride inside a geofence, then the ride summary
// =============================================================================

const SHOW_STREETS: string[] = [
  'M0 34 L320 34',
  'M0 104 L320 104',
  'M0 174 L320 174',
  'M56 0 L56 200',
  'M138 0 L138 200',
  'M214 0 L214 200',
  'M292 0 L292 200',
];
const TEST = new Route([[70, 172], [52, 138], [56, 100], [92, 70], [134, 46], [188, 38], [238, 50], [294, 88], [288, 140], [250, 168], [190, 174], [128, 172]], true, 16);
const FENCE = new Route([[26, 18], [150, 12], [252, 22], [264, 86], [258, 150], [236, 190], [120, 193], [32, 188], [16, 110]], true, 10);
const SHOW_CYCLE = 15;
const driveAt = (c: number) => easeInOut((c - 0.8) / 10.4);

function ShowroomScene() {
  const id = useIds();
  const t = useSceneTime(3);
  const cyc = t % SHOW_CYCLE;
  const f = driveAt(cyc);
  const car = TEST.at(f);
  const reset = 1 - easeOut((cyc - 14.4) / 0.5);
  // How far outside the fence, smoothed over the last moment.
  const out = [0, 1, 2, 3, 4].reduce((acc, k) => acc + (inside(TEST.at(driveAt(cyc - k * 0.09)).p, FENCE.pts) ? 0 : 1), 0) / 5;
  const left = 45 * 60 - f * 38 * 60;
  const summary = win(cyc, 11.4, 14.7, 0.5);
  const dealer = TEST.at(0).p;
  const gaugeLen = 2 * Math.PI * 8;

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      {/* City blocks: a park and the streets */}
      <rect x={146} y={112} width={60} height={54} rx={4} fill="#131317" />
      {SHOW_STREETS.map((d) => (
        <Road key={d} d={d} w={5} />
      ))}
      {/* Geofence */}
      <path d={FENCE.d} style={{ fill: aa(0.05) }} />
      <path d={FENCE.d} fill="none" style={{ stroke: A }} strokeWidth={1.1} strokeDasharray="4 3" opacity={0.75 * (1 - out)} strokeDashoffset={-t * 6} />
      <path d={FENCE.d} fill="none" stroke={RED} strokeWidth={1.4} strokeDasharray="4 3" opacity={out} strokeDashoffset={-t * 6} />
      {/* Route: planned, then driven */}
      <path d={TEST.d} fill="none" style={{ stroke: aa(0.22) }} strokeWidth={3} strokeLinejoin="round" />
      <path d={TEST.d} pathLength={1} strokeDasharray={`${f} 1`} fill="none" style={{ stroke: A }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" filter={`url(#${id('glow')})`} opacity={reset} />
      {/* Dealership */}
      <g transform={`translate(${dealer[0] - 9} ${dealer[1] - 9})`}>
        <rect width={18} height={18} rx={5} style={{ fill: A }} />
        <Ico I={Store} x={4} y={4} s={10} color="#111" />
      </g>
      {/* The customer's bike */}
      {f > 0.001 && f < 0.999 && <Arrow p={car.p} a={car.a} color={out > 0.5 ? RED : '#f4f4f5'} glow={id('glow')} />}

      {/* Test-ride timer */}
      <g transform="translate(8 8)">
        <rect width={Math.max(84, textW(tr("Test ride"), 6.5) + 40)} height={30} rx={6} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
        <circle cx={15} cy={15} r={8} fill="none" stroke="#2c2c33" strokeWidth={2.2} />
        <circle cx={15} cy={15} r={8} fill="none" style={{ stroke: A }} strokeWidth={2.2} strokeDasharray={`${(left / 2700) * gaugeLen} ${gaugeLen}`} transform="rotate(-90 15 15)" strokeLinecap="round" />
        <Ico I={Timer} x={11} y={11} s={8} />
        <T x={29} y={12.5} size={6.5} color={MUTED} weight={600}>{tr("Test ride")}</T>
        <T x={29} y={24} size={9.5} weight={800} mono>{mmss(left)}</T>
      </g>

      {/* Geofence alert */}
      <Chip x={VW / 2 - (20 + textW(tr("Left the test area"))) / 2} y={8} label={tr("Left the test area")} I={LifeBuoy} color={RED} tone={RED} opacity={out} dy={lerp(-10, 0, out)} />

      {/* Ride summary */}
      <g transform={`translate(${lerp(330, 190, easeOut(summary * 1.2))} 44)`} opacity={summary}>
        <rect width={122} height={112} rx={8} fill={PANEL} style={{ stroke: aa(0.6) }} strokeWidth={0.9} />
        <T x={10} y={16} size={6.5} weight={800} color={A} spacing={0.8}>{tr("Ride summary").toUpperCase()}</T>
        <Ico I={Share2} x={104} y={9} s={9} color={MUTED} />
        <T x={10} y={33} size={6.5} color={MUTED}>{tr("Peak lean")}</T>
        <T x={10} y={52} size={20} weight={800} mono>41°</T>
        {/* Lean gauge */}
        <g transform="translate(88 50)">
          <path d="M-18 0 A18 18 0 0 1 18 0" fill="none" stroke="#2c2c33" strokeWidth={3} strokeLinecap="round" />
          <path d="M-18 0 A18 18 0 0 1 18 0" pathLength={1} strokeDasharray={`${0.68 * easeOut((cyc - 11.8) / 0.8)} 1`} fill="none" style={{ stroke: A }} strokeWidth={3} strokeLinecap="round" />
        </g>
        {/* Route thumbnail */}
        <rect x={10} y={62} width={102} height={40} rx={5} fill="#131318" />
        <g transform="translate(14 64) scale(0.3 0.19)">
          <path d={TEST.d} fill="none" style={{ stroke: A }} strokeWidth={9} strokeLinejoin="round" />
        </g>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Workshop: one service visit — ticket on the left, the bay on the right
// =============================================================================

const WS_CYCLE = 16;
const WS_STAGES = [0, 3, 6, 11];
const QR = Array.from({ length: 81 }, (_, i) => {
  const [r, c] = [Math.floor(i / 9), i % 9];
  const finder = (rr: number, cc: number) => rr < 3 && cc < 3;
  if (finder(r, c) || finder(r, 8 - c) || finder(8 - r, c)) return !(r % 8 === 1 && c % 8 === 1) && !(r === 1 && c === 7) && !(r === 7 && c === 1);
  return rnd(i * 3.7) > 0.52;
});

// Bay geometry. The bike stands in for the rider's own vehicle photo (the only
// photo in the scene); everything else is drawn, in the app's own style.
const BAY = { x: 158, y: 8, w: 154, h: 184, floor: 176 };
const BIKE = { w: 104, h: (104 * 1094) / 704, bottom: 0.763 };

function WorkshopScene() {
  const id = useIds();
  const t = useSceneTime(0.2);
  const c = t % WS_CYCLE;
  const stage = WS_STAGES.filter((s) => c >= s).length - 1;
  // Continuous stepper position (eases between stages)
  const step = WS_STAGES.reduce((acc, s, i) => (i === 0 ? acc : acc + easeInOut((c - s) / 0.6)), 0);
  const labels = [tr("Checked in"), tr("Awaiting approval"), tr("In progress"), tr("Ready to collect")];

  // Bay choreography
  const rollIn = easeOut((c - 0.2) / 1.5);
  const rollOut = easeInOut((c - 15.1) / 0.9);
  const bikeX = lerp(330, 196, rollIn) + lerp(0, 150, rollOut);
  const bikeY = BAY.floor - BIKE.h * BIKE.bottom + Math.sin(c * 20) * 0.6 * (rollIn < 1 ? 1 - rollIn : 0);
  const screen = easeInOut((c - 6.2) / 0.8) * (1 - easeInOut((c - 11) / 0.7));
  const screenMoving = Math.sin(Math.PI * clamp01((c - 6.2) / 0.8)) + Math.sin(Math.PI * clamp01((c - 11) / 0.7));
  const weld = win(c, 7.3, 9.0, 0.2);
  const wrench = win(c, 9.0, 10.7, 0.2);
  const flicker = weld * (0.55 + 0.45 * rnd(Math.floor(c * 24)));
  // Mecha-Nick, seen only as a shadow on the screen: torch held at the engine,
  // then the wrench going.
  const mechX = bikeX - 12;
  const armAngle = weld > 0.01 ? 18 + Math.sin(c * 2.2) * 3 : -8 + wrench * Math.sin(c * 14) * 26;
  const mechLean = wrench * Math.sin(c * 14 + 0.6) * 2.2;
  const weldPt: Pt = [bikeX + 44, bikeY + BIKE.h * 0.56];
  const viewfinder = win(c, 3.2, 4.3, 0.3);
  const flash = win(c, 3.95, 4.3, 0.08);
  const photoFly = easeInOut((c - 4.2) / 0.8);
  const approved = c > 5.3;
  const shine = clamp01((c - 11.8) / 0.9);
  const notify = win(c, 11.3, 13.8, 0.4);
  const progress = clamp01((c - 6) / 5);
  const stamp = easeOut((c - 13.8) / 0.25);
  const tagDrop = easeOut((c - 1.7) / 0.5);
  const tagSwing = Math.sin(c * 5) * 14 * Math.exp(-Math.max(0, c - 2.2) * 1.6);

  // Clank marks while wrenching (on each downstroke), at the wrench
  const clank = wrench * Math.max(0, Math.sin(c * 14));
  const armRad = (armAngle * Math.PI) / 180;
  const hand: Pt = [mechX + 6 + Math.cos(armRad) * 40, BAY.floor - 58 + Math.sin(armRad) * 40];

  const panelX = 8;
  const panelW = 142;

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <linearGradient id={id('wall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141418" />
          <stop offset="1" stopColor="#0d0d10" />
        </linearGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17171c" />
          <stop offset="1" stopColor="#0c0c0f" />
        </linearGradient>
        <radialGradient id={id('lamp')} cx="50%" cy="0%" r="95%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('weld')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.22" stopColor="#e2e8f0" stopOpacity="0.65" />
          <stop offset="1" stopColor="#94a3b8" stopOpacity="0" />
        </radialGradient>
        <pattern id={id('slats')} width="7" height="10" patternUnits="userSpaceOnUse">
          <rect x="6" width="1" height="10" fill="white" opacity="0.045" />
        </pattern>
        <filter id={id('shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <clipPath id={id('bay')}>
          <rect x={BAY.x} y={BAY.y} width={BAY.w} height={BAY.h} rx={7} />
        </clipPath>
        <clipPath id={id('photo')}>
          <rect x={0} y={0} width={46} height={34} rx={2} />
        </clipPath>
        <mask id={id('bikeMask')} style={{ maskType: 'alpha' }}>
          <image href={bikeAsset.url} x={bikeX} y={bikeY} width={BIKE.w} height={BIKE.h} />
        </mask>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={VW} height={VH} fill={BG} />

      {/* ---- The bay ---- */}
      <g clipPath={`url(#${id('bay')})`}>
        <rect x={BAY.x} y={BAY.y} width={BAY.w} height={BAY.floor - BAY.y} fill={`url(#${id('wall')})`} />
        <rect x={BAY.x} y={BAY.floor} width={BAY.w} height={BAY.y + BAY.h - BAY.floor} fill={`url(#${id('floor')})`} />
        <line x1={BAY.x} x2={BAY.x + BAY.w} y1={BAY.floor} y2={BAY.floor} stroke="white" strokeOpacity={0.07} />
        {/* Light bar and its wash */}
        <path d={`M${BAY.x + 44} ${BAY.y} L${BAY.x + 110} ${BAY.y} L${BAY.x + 154} ${BAY.floor} L${BAY.x} ${BAY.floor} Z`} fill={`url(#${id('lamp')})`} />
        <rect x={BAY.x + 57} y={BAY.y + 1} width={40} height={2} rx={1} style={{ fill: A }} opacity={0.8} />
        <rect x={BAY.x + 57} y={BAY.y + 1} width={40} height={2} rx={1} style={{ fill: A }} filter={`url(#${id('glow')})`} opacity={0.5} />

        {/* The bike on the floor */}
        <ellipse cx={bikeX + BIKE.w / 2} cy={BAY.floor + 2} rx={BIKE.w * 0.42} ry={3} fill="black" opacity={0.55} />
        <image href={bikeAsset.url} x={bikeX} y={bikeY} width={BIKE.w} height={BIKE.h} />
        {/* Ready: a shine across the bike, and a few glints */}
        {shine > 0 && shine < 1 && (
          <g mask={`url(#${id('bikeMask')})`}>
            <rect x={lerp(bikeX - 60, bikeX + BIKE.w + 20, shine)} y={bikeY} width={40} height={BIKE.h} fill={`url(#${id('shine')})`} />
          </g>
        )}
        {stage === 3 &&
          [
            [0.3, 0.42, 0],
            [0.78, 0.36, 0.4],
            [0.58, 0.58, 0.8],
          ].map(([fx, fy, d], i) => {
            const k = win(c, 12.2 + d, 13.4 + d, 0.3);
            return (
              <path
                key={i}
                d="M0 -5 L1 -1 L5 0 L1 1 L0 5 L-1 1 L-5 0 L-1 -1 Z"
                fill="white"
                opacity={k}
                transform={`translate(${bikeX + BIKE.w * fx} ${bikeY + BIKE.h * fy}) scale(${0.6 + k * 0.6}) rotate(${c * 90})`}
              />
            );
          })}
        {/* Ticket tag on the handlebar */}
        <g
          transform={`translate(${bikeX + BIKE.w * 0.66} ${bikeY + BIKE.h * 0.32}) rotate(${tagSwing.toFixed(1)})`}
          opacity={tagDrop * (1 - rollOut) * (1 - screen)}
        >
          <line x1={0} y1={-8 + (1 - tagDrop) * -10} x2={0} y2={0} stroke="white" strokeOpacity={0.6} strokeWidth={0.6} />
          <rect x={-11} y={0} width={22} height={11} rx={2} style={{ fill: stage === 3 ? GREEN : A }} />
          <T x={0} y={8} anchor="middle" size={6} weight={800} color="#111" mono>#2041</T>
        </g>
        {/* Quote: the worn part, framed and photographed */}
        <g opacity={viewfinder}>
          {[
            [0, 0, 1, 1],
            [1, 0, -1, 1],
            [0, 1, 1, -1],
            [1, 1, -1, -1],
          ].map(([cx, cy, sx, sy], i) => {
            const bx = bikeX + 22 + cx * 50;
            const by = bikeY + BIKE.h * 0.44 + cy * 36;
            return <path key={i} d={`M${bx} ${by + sy * 8} L${bx} ${by} L${bx + sx * 8} ${by}`} fill="none" style={{ stroke: A }} strokeWidth={1.4} />;
          })}
        </g>
        <rect x={BAY.x} y={BAY.y} width={BAY.w} height={BAY.h} fill="white" opacity={flash * 0.85} />

        {/* In progress: Mecha-Nick works behind a frosted screen. He's only a
            shadow on it: torch at the engine, then the wrench going. */}
        {screen > 0.001 && (
          <g>
            {/* The screen, lit from behind by the bay lights */}
            <rect x={BAY.x} y={BAY.y + 6} width={BAY.w * screen} height={BAY.floor - BAY.y - 4} fill="rgba(52,52,60,0.8)" />
            {/* Mecha-Nick's shadow on it */}
            <clipPath id={id('screenClip')}>
              <rect x={BAY.x} y={BAY.y + 6} width={BAY.w * screen} height={BAY.floor - BAY.y - 4} />
            </clipPath>
            <g clipPath={`url(#${id('screenClip')})`}>
              <g opacity={0.72} filter={`url(#${id('shadow')})`} transform={`rotate(${mechLean.toFixed(2)} ${mechX} ${BAY.floor})`}>
                <rect x={mechX - 8} y={BAY.floor - 34} width={6} height={34} rx={2.5} fill="#050507" />
                <rect x={mechX + 2} y={BAY.floor - 34} width={6} height={34} rx={2.5} fill="#050507" transform={`rotate(-6 ${mechX + 5} ${BAY.floor - 34})`} />
                <rect x={mechX - 10} y={BAY.floor - 66} width={20} height={36} rx={7} fill="#050507" />
                <circle cx={mechX + 1} cy={BAY.floor - 75} r={7.5} fill="#050507" />
                <g transform={`rotate(${armAngle.toFixed(2)} ${mechX + 6} ${BAY.floor - 58})`}>
                  <rect x={mechX + 4} y={BAY.floor - 61} width={30} height={5.5} rx={2.7} fill="#050507" />
                  {weld > 0.01 ? (
                    <rect x={mechX + 32} y={BAY.floor - 60} width={12} height={2.4} rx={1.2} fill="#050507" />
                  ) : (
                    <path d={`M${mechX + 32} ${BAY.floor - 58.2} l9 0 m0 0 l3 -3 m-3 3 l3 3`} stroke="#050507" strokeWidth={2.4} strokeLinecap="round" fill="none" />
                  )}
                </g>
              </g>
            </g>
            <rect x={BAY.x} y={BAY.y + 6} width={BAY.w * screen} height={BAY.floor - BAY.y - 4} fill={`url(#${id('slats')})`} />
            <line
              x1={BAY.x + BAY.w * screen}
              x2={BAY.x + BAY.w * screen}
              y1={BAY.y + 6}
              y2={BAY.floor + 2}
              style={{ stroke: A }}
              strokeWidth={1.4}
              opacity={0.35 + 0.65 * clamp01(screenMoving)}
              filter={`url(#${id('glow')})`}
            />
            <line x1={BAY.x} x2={BAY.x + BAY.w} y1={BAY.y + 6} y2={BAY.y + 6} stroke="white" strokeOpacity={0.12} />
          </g>
        )}
        {/* Weld light through the screen, sparks from under it */}
        {weld > 0 && (
          <>
            <circle cx={weldPt[0]} cy={weldPt[1]} r={42} fill={`url(#${id('weld')})`} opacity={flicker * 0.85} style={{ mixBlendMode: 'screen' }} />
            {Array.from({ length: 16 }, (_, i) => {
              const P = 0.7;
              const age = (c + (i * P) / 16) % P;
              const gen = Math.floor((c + (i * P) / 16) / P);
              const seed = i * 13.1 + gen * 7.7;
              const vx = (rnd(seed) - 0.5) * 90;
              const vy = -(25 + rnd(seed + 1) * 45);
              const ox = bikeX + 30 + rnd(seed + 2) * 30;
              const oy = BAY.floor - 2;
              const x = ox + vx * age;
              const y = Math.min(BAY.floor + 6, oy + vy * age + 0.5 * 260 * age * age);
              const tx = x - vx * 0.02;
              const ty = y - (vy + 260 * age) * 0.02;
              return <line key={i} x1={tx} y1={ty} x2={x} y2={y} stroke={rnd(seed + 3) > 0.5 ? '#fde68a' : '#fdba74'} strokeWidth={1} strokeLinecap="round" opacity={weld * (1 - age / P)} />;
            })}
          </>
        )}
        {/* Clank marks at the wrench on each downstroke */}
        {clank > 0.6 && (
          <g transform={`translate(${hand[0]} ${hand[1] - 8})`} opacity={(clank - 0.6) / 0.4}>
            {[-35, 0, 35].map((a) => (
              <line key={a} x1={0} y1={-3} x2={0} y2={-8} stroke="white" strokeWidth={1.1} strokeLinecap="round" transform={`rotate(${a})`} />
            ))}
          </g>
        )}
      </g>
      <rect x={BAY.x} y={BAY.y} width={BAY.w} height={BAY.h} rx={7} fill="none" stroke={LINE} />

      {/* ---- The ticket ---- */}
      <rect x={panelX} y={8} width={panelW} height={184} rx={7} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
      <Ico I={Wrench} x={panelX + 9} y={16} s={9} />
      <T x={panelX + 22} y={23.5} weight={700}>{tr("Service ticket")}</T>
      <T x={panelX + panelW - 9} y={23.5} anchor="end" color={MUTED} mono>#2041</T>
      <line x1={panelX + 8} x2={panelX + panelW - 8} y1={32} y2={32} stroke={LINE} />
      {/* Stepper */}
      <line x1={panelX + 20} x2={panelX + panelW - 20} y1={46} y2={46} stroke="#2c2c33" strokeWidth={2} strokeLinecap="round" />
      <line x1={panelX + 20} x2={panelX + 20 + ((panelW - 40) * step) / 3} y1={46} y2={46} style={{ stroke: A }} strokeWidth={2} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => {
        const x = panelX + 20 + ((panelW - 40) * i) / 3;
        const on = step >= i - 0.02;
        return (
          <g key={i}>
            {i === stage && <circle cx={x} cy={46} r={6 + 4 * frac(t * 0.9)} fill="none" style={{ stroke: A }} opacity={1 - frac(t * 0.9)} />}
            <circle cx={x} cy={46} r={5.5} style={{ fill: on ? A : '#1c1c22' }} stroke={on ? 'none' : '#3a3a42'} />
            {on && <path d={`M${x - 2.4} ${46} l1.7 1.8 l3.2 -3.6`} fill="none" stroke="#111" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      })}
      <T x={panelX + 12} y={68} color={A} weight={800} size={8}>{labels[stage]}</T>

      {/* Stage detail */}
      <g opacity={win(c, 0, 3, 0.3)}>
        <g transform={`translate(${panelX + 12} 78)`}>
          <rect width={52} height={52} rx={4} fill="#f4f4f5" />
          {QR.map((on, i) => (on ? <rect key={i} x={4 + (i % 9) * 4.9} y={4 + Math.floor(i / 9) * 4.9} width={4.6} height={4.6} fill="#111" /> : null))}
          <rect x={2} y={lerp(4, 46, easeInOut((c - 0.4) / 1.8))} width={48} height={1.6} style={{ fill: A }} opacity={c < 2.4 ? 1 : 0} filter={`url(#${id('glow')})`} />
        </g>
        <T x={panelX + 72} y={92} size={6.5} color={MUTED}>#2041</T>
        <g opacity={easeOut((c - 2.4) / 0.3)}>
          <circle cx={panelX + 79} cy={106} r={6} fill={GREEN} />
          <path d={`M${panelX + 76.3} 106 l1.9 2 l3.4 -3.8`} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <g opacity={win(c, 3, 6, 0.3)}>
        {/* The photo flies from the bay onto the ticket */}
        <g transform={`translate(${lerp(bikeX + 20, panelX + 12, photoFly)} ${lerp(bikeY + BIKE.h * 0.44, 80, photoFly)}) rotate(${lerp(8, -4, photoFly)})`} opacity={photoFly > 0 ? 1 : 0}>
          <rect x={-3} y={-3} width={52} height={46} rx={2} fill="#f4f4f5" />
          <g clipPath={`url(#${id('photo')})`}>
            <rect width={46} height={34} fill="#222" />
            <image href={bikeAsset.url} x={-36} y={-110} width={BIKE.w * 1.4} height={BIKE.h * 1.4} />
          </g>
        </g>
        <g transform={`translate(${panelX + 72} 92)`}>
          <Ico I={Camera} x={0} y={-7} s={8} color={MUTED} />
          <rect x={0} y={8} width={56} height={17} rx={5} style={{ fill: approved ? GREEN : A }} opacity={approved ? 1 : 0.75 + 0.25 * Math.sin(t * 6)} />
          {approved ? (
            <path d="M22.5 16.5 l3 3 l6 -6.5" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <T x={28} y={19.3} anchor="middle" size={7} weight={800} color="#111">{tr("Approve")}</T>
          )}
        </g>
      </g>
      <g opacity={win(c, 6, 11, 0.3)}>
        <g transform={`translate(${panelX + 12} 84)`}>
          <g transform={`rotate(${Math.sin(c * 14) * 18 * wrench} 9 9)`}>
            <Ico I={Wrench} x={0} y={0} s={18} />
          </g>
          <T x={28} y={15} size={16} weight={800} mono>{`${Math.round(progress * 100)}%`}</T>
          <rect x={0} y={30} width={panelW - 24} height={4} rx={2} fill="#2c2c33" />
          <rect x={0} y={30} width={(panelW - 24) * progress} height={4} rx={2} style={{ fill: A }} />
        </g>
      </g>
      <g opacity={win(c, 11, WS_CYCLE, 0.3)}>
        <Ico I={BookOpen} x={panelX + 12} y={76} s={9} />
        <T x={panelX + 25} y={83.5} weight={700}>{tr("Logbook")}</T>
        {[tr("Oil and filter"), tr("Chain adjusted"), tr("Brake pads")].map((job, i) => {
          const k = easeOut((c - 12.2 - i * 0.5) / 0.4);
          return (
            <g key={job} transform={`translate(${panelX + 12 + (1 - k) * 12} ${92 + i * 17})`} opacity={k}>
              <rect width={panelW - 24} height={14} rx={3.5} style={{ fill: aa(0.1) }} />
              <path d="M5 7 l2 2 l4 -4.4" fill="none" style={{ stroke: A }} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
              <T x={16} y={9.8} size={7}>{job}</T>
            </g>
          );
        })}
        {/* Mecha-Nick's stamp lands on the entry */}
        <g transform={`translate(${panelX + panelW - 30} 164) rotate(-12) scale(${lerp(1.8, 1, stamp)})`} opacity={stamp}>
          <circle r={15} fill="none" style={{ stroke: A }} strokeWidth={1.6} />
          <circle r={11.5} fill="none" style={{ stroke: A }} strokeWidth={0.7} />
          <T x={0} y={-2} anchor="middle" size={5.5} weight={800} color={A}>M. NICK</T>
          <T x={0} y={5.5} anchor="middle" size={4.2} weight={700} color={A} spacing={0.4}>{tr("CERTIFIED")}</T>
        </g>
      </g>

      {/* Ready: the rider's phone lights up */}
      <g transform={`translate(${VW / 2 - 90} ${lerp(-40, 8, easeOut(notify * 1.3))})`} opacity={notify}>
        <rect width={180} height={30} rx={8} fill="rgba(28,28,33,0.97)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />
        <rect x={7} y={7} width={16} height={16} rx={4} style={{ fill: A }} />
        <Ico I={Bell} x={10.5} y={10.5} s={9} color="#111" />
        <T x={30} y={14} size={6.5} color={MUTED} weight={700}>Blacktop</T>
        <T x={30} y={24} size={7.5} weight={700}>{tr("Ready to collect")}</T>
        <Ico I={Mail} x={162} y={11} s={9} color={MUTED} />
      </g>
    </Frame>
  );
}

// =============================================================================
// Academy: tether radar, priority comms, Mod 1 speed trap
// =============================================================================

// Kept clear of the speed-trap inset (bottom right).
const ACAD = new Route([[40, 150], [66, 112], [108, 94], [150, 70], [200, 52], [252, 46], [292, 62], [300, 90], [262, 104], [214, 106], [180, 130], [140, 160], [90, 180], [52, 176]], true, 16);
const ACAD_M = 2400; // route length in metres, for the tether readout
const FIELDS: string[] = ['M0 0 L120 0 L96 70 L0 92 Z', 'M150 0 L320 0 L320 50 L200 44 Z', 'M180 160 L320 150 L320 200 L170 200 Z'];

function AcademyScene() {
  const id = useIds();
  const t = useSceneTime(2);
  const f = t / 34;
  const lag = 0.085 * Math.pow(Math.sin(Math.PI * frac(t / 13)), 2);
  const studentsF = [f - 0.034, f - 0.068, f - 0.102 - lag];
  const gapM = Math.round((0.034 + lag) * ACAD_M);
  const state = gapM > 240 ? 2 : gapM > 150 ? 1 : 0;
  const tetherColor = state === 2 ? RED : state === 1 ? AMBER : A;
  const I = ACAD.at(f);
  const lagger = ACAD.at(studentsF[2]).p;
  const talk = win(t % 9, 1, 5, 0.3);
  const mx = (I.p[0] + lagger[0]) / 2;
  const my = Math.min(I.p[1], lagger[1]) - 22;
  // Quadratic midpoint for the label
  const lx = 0.25 * I.p[0] + 0.5 * mx + 0.25 * lagger[0];
  const ly = 0.25 * I.p[1] + 0.5 * my + 0.25 * lagger[1];

  // Speed trap run: accelerate to the gate, then the emergency stop
  const run = t % 4.6;
  const pass = Math.floor(t / 4.6) % 2 === 0;
  const vGate = pass ? 50.8 : 47.2;
  const xGate = 262;
  const bx = run < 2.2 ? lerp(218, xGate, Math.pow(run / 2.2, 1.6)) : lerp(xGate, pass ? 294 : 290, easeOut((run - 2.2) / 1.2));
  const shown = run < 2.2 ? (vGate * Math.min(1, Math.pow(run / 2.2, 0.6))).toFixed(1) : vGate.toFixed(1);
  const verdict = easeOut((run - 2.3) / 0.3) * (1 - easeOut((run - 4.3) / 0.3));

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      {FIELDS.map((d) => (
        <path key={d} d={d} fill="#131317" opacity={0.9} />
      ))}
      <Road d="M0 120 L320 108" w={4} />
      <Road d="M210 0 L200 200" w={4} />
      <Road d={ACAD.d} w={6} />
      <path d={ACAD.d} fill="none" style={{ stroke: aa(0.35) }} strokeWidth={1.4} strokeDasharray="1 5" strokeLinecap="round" />

      {/* Tether */}
      <path d={`M${I.p[0]} ${I.p[1]} Q${mx} ${my} ${lagger[0]} ${lagger[1]}`} fill="none" stroke={tetherColor} strokeWidth={1.4} strokeDasharray="3 3" strokeDashoffset={-t * 12} />
      {/* Students, then the instructor */}
      {studentsF.map((sf, i) => (
        <Dot key={i} p={ACAD.at(sf).p} color={i === 2 && state ? tetherColor : ['#f4f4f5', '#c9c9d1', '#a1a1aa'][i]} halo={i === 2 ? state / 2 : 0} haloColor={tetherColor} />
      ))}
      {talk > 0.05 && <Rings p={I.p} phase={t * 1.3} color={A} max={18} />}
      <Arrow p={I.p} a={I.a} color={A} glow={id('glow')} />
      {/* Tether readout, over the markers */}
      <g transform={`translate(${lx - 17} ${ly - 7})`}>
        <rect width={34} height={14} rx={7} fill={PANEL} stroke={tetherColor} strokeWidth={0.9} />
        <T x={17} y={9.8} anchor="middle" size={7} weight={800} mono color={state ? tetherColor : INK}>{`${gapM} m`}</T>
      </g>

      {/* Priority comms */}
      <g transform="translate(8 8)">
        <rect width={textW(tr("Instructor")) + textW(tr("Priority"), 6) + 58} height={17} rx={5} fill={PANEL} stroke={talk > 0.5 ? aa(0.7) : LINE} strokeWidth={0.8} />
        <Ico I={Mic} x={6} y={4} s={9} color={talk > 0.3 ? A : MUTED} />
        <T x={19} y={11.4}>{tr("Instructor")}</T>
        <g transform={`translate(${23 + textW(tr("Instructor"))} 3.5)`}>
          <rect width={textW(tr("Priority"), 6) + 8} height={10} rx={3} style={{ fill: talk > 0.3 ? A : '#2a2a30' }} />
          <T x={4} y={7.4} size={6} weight={800} color={talk > 0.3 ? '#111' : MUTED}>{tr("Priority").toUpperCase()}</T>
        </g>
        <g transform={`translate(${textW(tr("Instructor")) + textW(tr("Priority"), 6) + 36} 0)`}>
          <Wave on={talk} t={t} />
        </g>
      </g>

      {/* Mod 1 speed trap */}
      <g transform="translate(206 118)">
        <rect width={106} height={74} rx={7} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
        <Ico I={Timer} x={8} y={7} s={9} />
        <T x={21} y={14.5} weight={700}>Mod 1</T>
        <T x={98} y={14.8} anchor="end" mono weight={800} size={9}>{`${shown} km/h`}</T>
      </g>
      <rect x={214} y={146} width={90} height={16} rx={2} fill="#17171c" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <circle cx={218 + i * 10.5} cy={146} r={1.1} fill="#5a5a63" />
          <circle cx={218 + i * 10.5} cy={162} r={1.1} fill="#5a5a63" />
        </g>
      ))}
      <line x1={xGate} x2={xGate} y1={144} y2={164} style={{ stroke: A }} strokeWidth={1.2} strokeDasharray="2 1.5" />
      <rect x={278} y={147} width={24} height={14} fill="white" opacity={0.04} />
      <circle cx={bx} cy={154} r={3.4} style={{ fill: A }} stroke="white" strokeWidth={1} />
      <g opacity={verdict} transform={`translate(${259 - (textW(pass ? tr("PASS") : tr("TOO SLOW"), 7) + 12) / 2} ${170 + (1 - verdict) * 4})`}>
        <rect width={textW(pass ? tr("PASS") : tr("TOO SLOW"), 7) + 12} height={14} rx={4} fill={pass ? GREEN : RED} />
        <T x={6} y={9.8} size={7} weight={800} color="#fff" spacing={0.5}>{pass ? tr("PASS") : tr("TOO SLOW")}</T>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Touring: a mountain loop in no signal — broadcast, sweep radar, guide ping
// =============================================================================

const PASS = new Route(
  [[36, 186], [104, 178], [58, 160], [122, 146], [72, 128], [134, 112], [100, 92], [150, 70], [194, 62], [232, 80], [196, 100], [258, 116], [206, 134], [268, 150], [214, 168], [286, 184], [160, 192]],
  true,
  16,
);
const RIDER_GAP = 0.03;

function TouringScene() {
  const id = useIds();
  const t = useSceneTime(1);
  const lf = t / 46;
  const L = PASS.at(lf);
  const riders = [1, 2, 3, 4].map((k) => PASS.at(lf - k * RIDER_GAP).p);
  const sweepGap = RIDER_GAP * 5 + 0.012 * Math.sin(t * 0.5);
  const S = PASS.at(lf - sweepGap);
  const tailM = Math.round((sweepGap - RIDER_GAP * 4) * 5200);

  const bc = t % 8;
  const broadcast = win(bc, 0.4, 3.6, 0.3);
  const ringR = [0, 0.45, 0.9].map((d) => clamp01((bc - 0.5 - d) / 1.8) * 90);
  const heard = (p: Pt) => ringR.some((r) => r > 0 && Math.abs(Math.hypot(p[0] - L.p[0], p[1] - L.p[1]) - r) < 7);

  const pc = t % 11;
  const ping = win(pc, 6, 9.6, 0.3);
  const pinger = riders[1];

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <linearGradient id={id('ridge1')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23232b" />
          <stop offset="1" stopColor="#141418" />
        </linearGradient>
        <linearGradient id={id('ridge2')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1b21" />
          <stop offset="1" stopColor="#0f0f13" />
        </linearGradient>
      </defs>
      <rect width={VW} height={VH} fill="#0a0a0d" />
      {/* Ridges behind the pass */}
      <path d="M0 120 L40 92 L80 104 L130 58 L172 40 L214 62 L256 50 L300 84 L320 76 L320 200 L0 200 Z" fill={`url(#${id('ridge1')})`} />
      <path d="M130 58 L172 40 L214 62 L200 64 L172 50 L150 62 Z" fill="white" opacity={0.08} />
      <path d="M0 150 L60 128 L110 140 L170 118 L230 132 L290 116 L320 124 L320 200 L0 200 Z" fill={`url(#${id('ridge2')})`} opacity={0.8} />
      <Road d={PASS.d} w={5} />
      <path d={PASS.d} fill="none" style={{ stroke: aa(0.3) }} strokeWidth={1.2} strokeDasharray="1 5" strokeLinecap="round" />

      {/* Broadcast rings from the leader */}
      {ringR.map((r, i) =>
        r > 0 && r < 90 ? <circle key={i} cx={L.p[0]} cy={L.p[1]} r={r} fill="none" style={{ stroke: A }} strokeWidth={1.2} opacity={broadcast * (1 - r / 90) * 0.8} /> : null,
      )}
      {/* Sweep to the tail */}
      <path d={PASS.slice(lf - sweepGap, lf - RIDER_GAP * 4, 18)} fill="none" stroke="white" strokeWidth={1.1} strokeDasharray="2 3" opacity={0.45} />
      {/* Guide ping: lines to the leader and the sweep */}
      {ping > 0.02 && (
        <>
          <line x1={pinger[0]} y1={pinger[1]} x2={L.p[0]} y2={L.p[1]} stroke={RED} strokeWidth={1.1} strokeDasharray="3 3" strokeDashoffset={t * 14} opacity={ping} />
          <line x1={pinger[0]} y1={pinger[1]} x2={S.p[0]} y2={S.p[1]} stroke={RED} strokeWidth={1.1} strokeDasharray="3 3" strokeDashoffset={t * 14} opacity={ping} />
          <Rings p={pinger} phase={t * 1.6} color={RED} max={20} />
        </>
      )}
      {riders.map((p, i) => (
        <Dot key={i} p={p} color={i === 1 && ping > 0.3 ? RED : '#d4d4d8'} r={3.4} halo={heard(p) ? 1 : 0} haloColor={A} />
      ))}
      <Arrow p={S.p} a={S.a} color="#f4f4f5" s={0.85} />
      <Arrow p={L.p} a={L.a} color={A} glow={id('glow')} />

      <Chip x={8} y={8} label={tr("Offline maps")} I={WifiOff} color={MUTED} extra={12}>
        <circle cx={4} cy={8.5} r={3.4} fill={GREEN} />
        <path d="M2.4 8.5 l1.1 1.2 l2 -2.3" fill="none" stroke="#fff" strokeWidth={1} strokeLinecap="round" />
      </Chip>
      <Chip x={VW - 8} y={8} right label={tr("Leader broadcast")} I={Radio} tone={broadcast > 0.5 ? aa(0.7) : LINE} extra={16}>
        <g transform="translate(0 0)">
          <Wave on={broadcast} t={t} n={4} />
        </g>
      </Chip>
      {/* Stacked under the top chips: the loop's bottom straight runs along the foot of the frame */}
      <Chip x={8} y={29} label={tr("Tail rider {0}", [`${tailM} m`])} I={Mountain} />
      <Chip x={VW - 8} y={29} right label={tr("Guide ping sent")} I={LifeBuoy} color={RED} tone={RED} opacity={ping} dy={lerp(-6, 0, ping)} />
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Billion: every module in orbit round one core, in your colours
// =============================================================================

const ORBIT: { tier: EnterpriseTier; I: Icon }[] = [
  { tier: 'track_pro', I: Flag },
  { tier: 'showroom', I: Store },
  { tier: 'workshop', I: Wrench },
  { tier: 'academy', I: GraduationCap },
  { tier: 'touring', I: Mountain },
];
const STARS = Array.from({ length: 46 }, (_, i) => [rnd(i) * VW, rnd(i + 99) * VH, 0.3 + rnd(i + 7) * 0.9] as const);
const SWATCHES = [32, 200, 330, 150];

function BillionScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const C: Pt = [160, 92];
  const RX = 112;
  const RY = 40;
  const spin = t * 0.28;
  const hue = (32 + t * 16) % 360;
  const brand = `hsl(${hue} 88% 60%)`;
  const brandA = (o: number) => `hsl(${hue} 88% 60% / ${o})`;
  const active = ((Math.floor(t / 1.8) % ORBIT.length) + ORBIT.length) % ORBIT.length;
  const sig = frac(t / 1.8);
  const nodes = ORBIT.map((m, i) => {
    const a = spin + (i * Math.PI * 2) / ORBIT.length;
    const depth = (Math.sin(a) + 1) / 2;
    return { ...m, i, p: [C[0] + RX * Math.cos(a), C[1] + RY * Math.sin(a)] as Pt, depth };
  });
  const act = nodes[active];
  const pulse: Pt = [lerp(act.p[0], C[0], easeInOut(sig)), lerp(act.p[1], C[1], easeInOut(sig))];
  const swatch = SWATCHES.reduce((best, h, i) => (Math.abs(((hue - h + 540) % 360) - 180) < Math.abs(((hue - SWATCHES[best] + 540) % 360) - 180) ? i : best), 0);
  const label = tierName(act.tier);

  const orbitBack = `M${C[0] - RX} ${C[1]} A${RX} ${RY} 0 0 1 ${C[0] + RX} ${C[1]}`;
  const orbitFront = `M${C[0] + RX} ${C[1]} A${RX} ${RY} 0 0 1 ${C[0] - RX} ${C[1]}`;

  const back = nodes.filter((n) => n.depth < 0.5);
  const front = nodes.filter((n) => n.depth >= 0.5);
  const drawNode = (n: (typeof nodes)[number]) => {
    const on = n.i === active;
    const s = 0.72 + 0.42 * n.depth;
    return (
      <g key={n.tier} transform={`translate(${n.p[0].toFixed(1)} ${n.p[1].toFixed(1)}) scale(${s.toFixed(3)})`} opacity={0.5 + 0.5 * n.depth}>
        {on && <circle r={17} style={{ fill: aa(0.25) }} filter={`url(#${id('soft')})`} />}
        <circle r={12} style={{ fill: on ? A : '#18181d' }} stroke={on ? 'none' : 'rgba(255,255,255,0.14)'} />
        <Ico I={n.I} x={-6} y={-6} s={12} color={on ? '#111' : MUTED} sw={2} />
      </g>
    );
  };

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <radialGradient id={id('core')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={brand} stopOpacity="0.45" />
          <stop offset="1" stopColor={brand} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={VW} height={VH} fill="#08080b" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={0.08 + 0.12 * Math.abs(Math.sin(t * 0.8 + i))} />
      ))}
      <ellipse cx={C[0]} cy={C[1]} rx={70} ry={48} fill={`url(#${id('core')})`} />

      {/* Back half of the orbit, back modules, spokes */}
      <path d={orbitBack} fill="none" stroke="white" strokeOpacity={0.12} strokeWidth={0.8} strokeDasharray="2 3" />
      <ellipse cx={C[0]} cy={C[1]} rx={RX * 0.6} ry={RY * 0.6} fill="none" stroke="white" strokeOpacity={0.05} />
      {nodes.map((n) => (
        <line key={n.tier} x1={C[0]} y1={C[1]} x2={n.p[0]} y2={n.p[1]} style={{ stroke: A }} strokeOpacity={n.i === active ? 0.7 : 0.08 + 0.08 * n.depth} strokeWidth={n.i === active ? 1 : 0.6} />
      ))}
      {back.map(drawNode)}

      {/* The core */}
      <circle cx={C[0]} cy={C[1]} r={24 + Math.sin(t * 2) * 1.2} fill="none" stroke={brandA(0.35)} strokeWidth={1} />
      <circle cx={C[0]} cy={C[1]} r={20} fill="#0d0d11" stroke={brand} strokeWidth={2} />
      <Ico I={Crown} x={C[0] - 9} y={C[1] - 10} s={18} color={brand} sw={1.8} />
      <circle cx={pulse[0]} cy={pulse[1]} r={2.2} style={{ fill: A }} filter={`url(#${id('glow')})`} opacity={1 - sig * 0.3} />

      {/* Front half */}
      <path d={orbitFront} fill="none" stroke="white" strokeOpacity={0.2} strokeWidth={0.8} strokeDasharray="2 3" />
      {front.map(drawNode)}

      {/* The module on air */}
      <g transform={`translate(${C[0]} 158)`}>
        <T x={0} y={0} anchor="middle" size={6} color={MUTED} weight={700} spacing={1}>{`${active + 1} / ${ORBIT.length}`}</T>
        <T x={0} y={13} anchor="middle" size={10} weight={800}>{label}</T>
      </g>

      {/* Custom branding: swatches, the live one ringed */}
      <g transform="translate(8 8)">
        <rect width={textW(tr("Custom branding")) + 64} height={17} rx={5} fill={PANEL} stroke={LINE} strokeWidth={0.8} />
        <Ico I={Palette} x={6} y={4} s={9} color={brand} />
        <T x={19} y={11.4}>{tr("Custom branding")}</T>
        {SWATCHES.map((h, i) => (
          <circle key={h} cx={textW(tr("Custom branding")) + 27 + i * 9} cy={8.5} r={3} fill={`hsl(${h} 88% 60%)`} stroke={i === swatch ? '#fff' : 'none'} strokeWidth={1} />
        ))}
      </g>
      <Chip x={VW - 8} y={8} right label={tr("Priority comms relay")} I={Radio} />
      <Chip x={8} y={175} label={tr("Unlimited seats")} I={InfinityIcon} />
      <Chip x={VW - 8} y={175} right label={tierName('billion')} I={Crown} color={brand} tone={brandA(0.6)} />
    </Frame>
  );
}

export function TierShowcase({ tier }: { tier: EnterpriseTier }) {
  switch (tier) {
    case 'academy':
      return <AcademyScene />;
    case 'showroom':
      return <ShowroomScene />;
    case 'workshop':
      return <WorkshopScene />;
    case 'touring':
      return <TouringScene />;
    case 'track_pro':
      return <TrackScene />;
    case 'billion':
      return <BillionScene />;
  }
}

