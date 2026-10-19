/* eslint-disable react-refresh/only-export-components -- scenes export their running times for the tour */
import {
  Check,
  Gauge,
  QrCode,
  CornerUpRight,
  IdCard,
  Lock,
  Moon,
  Mountain,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Wrench,
  Zap,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import { useSettings } from '@/features/settings';
import { TIER_LADDER } from '@/features/cards/types';
import { formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import {
  A,
  AMBER,
  Arrow,
  BG,
  Bar,
  Base,
  BikePhoto,
  GarageBackdrop,
  NickSilhouette,
  bikeAt,
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
  Road,
  Route,
  T,
  VH,
  VW,
  Vignette,
  aa,
  clamp01,
  easeInOut,
  easeOut,
  easeOutBack,
  fitLines,
  frac,
  lerp,
  loopT,
  popAt,
  useIds,
  textW,
  useSceneTime,
  win,
  type SceneCue,
  type Icon,
  type Pt,
} from '@/components/scene/kit';

/*
 * Demo slide scenes, part two: after the ride, the garage, cards and racing.
 */

const loopFade = (t: number, period: number) => clamp01(t / 0.4) * (1 - clamp01((t - (period - 0.45)) / 0.45));
/** The receipt stocks, as the app prints them (index.css: .receipt, .receipt-track). */
const STOCK = {
  ride: { paper: '#f4f1e8', ink: '#1a1614' },
  track: { paper: '#ffe3f0', ink: '#7a1247' },
};
const PURPLE = '#a855f7';
/** Font size that fits `label` into `maxW` scene units (never above `size`). */
const fitW = (label: string, maxW: number, size = 7) => Math.min(size, maxW / Math.max(1, textW(label, 1)));

function useUnits() {
  const { settings } = useSettings();
  const km = settings.distanceUnit === 'km';
  return {
    speed: (mph: number) => formatSpeed(mph, settings.speedUnit),
    speedLabel: getSpeedLabel(settings.speedUnit),
    distLabel: getDistanceLabel(settings.distanceUnit),
    /** Whole-number distance (odometers, long rides). */
    miles: (mi: number) => Math.round(km ? mi * 1.609344 : mi).toLocaleString(),
    miles1: (mi: number) => (km ? mi * 1.609344 : mi).toFixed(1),
  };
}

/** A receipt printing out of a slot: `f` = how much has printed (0..1). */
function Receipt({
  x,
  y,
  w,
  h,
  f,
  paper,
  ink,
  title,
  rows,
  footer,
  sub,
  clip,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  f: number;
  paper: string;
  ink: string;
  title: string;
  sub: string;
  rows: [string, string][];
  footer: string[];
  clip: string;
}) {
  const shown = h * clamp01(f);
  // Torn edge along the bottom, drawn right to left.
  const n = Math.ceil(w / 6);
  let edge = '';
  for (let i = n; i >= 0; i--) {
    edge += ` L${(x + Math.min(w, i * 6)).toFixed(1)} ${(y + shown).toFixed(1)}`;
    if (i > 0) edge += ` L${(x + i * 6 - 3).toFixed(1)} ${(y + shown + 3).toFixed(1)}`;
  }
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={w} height={shown + 3} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path d={`M${x} ${y} H${x + w} V${(y + shown).toFixed(1)}${edge} Z`} fill={paper} />
        <g transform={`translate(${x} ${y})`}>
          <T x={w / 2} y={15} anchor="middle" size={8.5} weight={800} color={ink} spacing={1.2}>{title}</T>
          <T x={w / 2} y={24} anchor="middle" size={5} color={ink} opacity={0.7} spacing={1.2}>{sub}</T>
          <line x1={8} x2={w - 8} y1={30} y2={30} stroke={ink} strokeOpacity={0.5} strokeDasharray="2 2" />
          {rows.map(([k, v], i) => (
            <g key={k} transform={`translate(0 ${40 + i * 11})`}>
              <T x={8} y={0} size={5.8} color={ink} weight={600}>{k.toUpperCase()}</T>
              <T x={w - 8} y={0} anchor="end" size={5.8} color={ink} weight={800} mono>{v}</T>
            </g>
          ))}
          <line x1={8} x2={w - 8} y1={40 + rows.length * 11 - 5} y2={40 + rows.length * 11 - 5} stroke={ink} strokeOpacity={0.5} strokeDasharray="2 2" />
          {footer.map((line, i) => (
            <T key={i} x={w / 2} y={40 + rows.length * 11 + 5 + i * 8} anchor="middle" size={i ? 5 : 6} color={ink} weight={i ? 500 : 800} opacity={i ? 0.7 : 1} spacing={0.8}>{line}</T>
          ))}
          <g transform={`translate(${w / 2 - 34} ${h - 16})`}>
            {Array.from({ length: 28 }, (_, i) => (
              <rect key={i} x={i * 2.45} width={i % 3 === 0 ? 1.6 : 0.8} height={10} fill={ink} />
            ))}
          </g>
        </g>
      </g>
    </g>
  );
}

// =============================================================================
// After the ride: the receipt prints and flies into History with the ride's
// line, corner grade and badges; then the 3D flyover plays it back
// =============================================================================

const AR_P = 12;
const AR_TRACE = new Route([[160, 76], [172, 58], [190, 64], [204, 44], [226, 52], [238, 70], [256, 60], [276, 72], [290, 56]], false, 10);
/** Where the receipt lands: the ride's entry in History. */
const AR_HISTORY: Pt = [229, 56];
/** The flyover: a loop out of town and back, seen from behind the marker. */
const AR_FLY = new Route([[0, -70], [46, -54], [70, -8], [46, 38], [6, 62], [-40, 50], [-66, 8], [-52, -42]], true, 14);
const AR_FLY_ROADS = ['M-150 -24 L150 -66', 'M-96 120 L110 -130', 'M-150 44 L150 74', 'M22 -150 L-14 150', 'M-150 -96 L150 -110'];
/** Blocks of town either side of the roads, for the ground to read as a map from up high. */
const AR_FLY_BLOCKS = Array.from({ length: 42 }, (_, i) => ({ x: ((i * 53) % 290) - 145, y: ((i * 97 + 31) % 290) - 145, w: 10 + (i % 3) * 5, h: 8 + (i % 4) * 3 }));
/** The town under the ride's name as the flyover passes through (place names stay as they are). */
const AR_TOWNS: { from: number; name: string }[] = [
  { from: 0, name: 'Brighton' },
  { from: 0.32, name: 'Lewes' },
  { from: 0.74, name: 'Brighton' },
];
const AR_FLY_FROM = 6.4;
const AR_FLY_FOR = 5.2;
const AR_FLY_TAP = 6.0;
const AR_FLY_CHIP = { x: 146, y: 170 };

const AR_CUES: SceneCue[] = [
  [0.6, 'print'], [3.6, 'tap'], [4.0, 'tap'], [4.4, 'tap'], [4.8, 'tap'], [5.4, 'whoosh'],
  [AR_FLY_TAP, 'tap'], [AR_FLY_FROM, 'whoosh'],
];

export function AfterRideScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), AR_P);
  const f = easeInOut((t - 0.6) / 2.5);
  // Into History: the receipt shrinks into the ride's entry, which glows as it lands.
  const fly = easeInOut((t - 5.4) / 0.6);
  const landed = win(t, 5.9, 6.6, 0.25);
  const rows: [string, string][] = [
    [tr("Max Spd"), `${u.speed(104)} ${u.speedLabel}`],
    [tr("Max Lean"), '44°'],
    [tr("Distance"), `${u.miles1(45.2)} ${u.distLabel.toUpperCase()}`],
    [tr("Duration"), '1:23:45'],
    [tr("Avg Spd"), `${u.speed(32)} ${u.speedLabel}`],
    [tr("Corners"), '64'],
  ];
  const trace = easeInOut((t - 1.2) / 2);
  const corners = [0.92, 0.84, 0.97, 0.78, 0.88];
  const badges: { I: Icon; name: string; at: number }[] = [
    { I: Zap, name: 'Speed Demon', at: 3.6 },
    { I: TrendingUp, name: 'Lean Fiend', at: 4.0 },
    { I: CornerUpRight, name: 'Corner Carver', at: 4.4 },
    { I: Moon, name: 'Night Owl', at: 4.8 },
  ];

  // The flyover, chase camera: the world turns so the marker always heads up the screen.
  const flyIn = easeOut((t - AR_FLY_FROM + 0.25) / 0.45);
  const p = clamp01((t - AR_FLY_FROM) / AR_FLY_FOR);
  const here = AR_FLY.at(p).p;
  const ahead = AR_FLY.at(p + 0.012).p;
  const behind = AR_FLY.at(p - 0.012).p;
  const heading = (Math.atan2(ahead[1] - behind[1], ahead[0] - behind[0]) * 180) / Math.PI;
  const town = [...AR_TOWNS].reverse().find((s) => p >= s.from) ?? AR_TOWNS[0];
  const townFade = Math.min(1, ...AR_TOWNS.filter((s) => s.from > 0).map((s) => Math.abs(p - s.from) / 0.035));
  const chipW = 20 + textW(tr("3D flyover"));
  const tapAt: Pt = [AR_FLY_CHIP.x + chipW / 2, AR_FLY_CHIP.y + 8.5];
  const tapK = clamp01((t - AR_FLY_TAP) / 0.5);
  const rideName = tr("Evening ride around {0}", ['Brighton']);

  return (
    <Frame sound={{ t, cues: AR_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, AR_P)}>
        {/* The printer and the receipt */}
        <g opacity={1 - flyIn}>
          <rect x={14} y={8} width={120} height={10} rx={4} fill="#26262c" stroke={LINE} />
          <rect x={20} y={14} width={108} height={1.4} fill="#050506" />
        </g>
        {fly < 1 && (
          <g
            transform={`translate(${lerp(74, AR_HISTORY[0], fly).toFixed(1)} ${lerp(99, AR_HISTORY[1], fly).toFixed(1)}) scale(${(1 - 0.88 * fly).toFixed(3)}) translate(-74 -99)`}
            opacity={1 - fly * fly}
          >
            <Receipt
              clip={id('r0')}
              x={20}
              y={15}
              w={108}
              h={168}
              f={f}
              paper={STOCK.ride.paper}
              ink={STOCK.ride.ink}
              title={tr("BLACKTOP STORE")}
              sub={tr("— RIDE RECEIPT —")}
              rows={rows}
              footer={[tr("THANK YOU FOR THE RIDE"), tr("ORDER #4C1A9F")]}
            />
          </g>
        )}

        {/* The flyover plays where the receipt was */}
        {flyIn > 0 && (
          <g opacity={flyIn} transform={`translate(74 100) scale(${(0.92 + 0.08 * flyIn).toFixed(3)}) translate(-74 -100)`}>
            <defs>
              <clipPath id={id('fly-clip')}>
                <rect x={14} y={12} width={120} height={176} rx={10} />
              </clipPath>
              <linearGradient id={id('fly-sky')} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={BG} stopOpacity={1} />
                <stop offset="1" stopColor={BG} stopOpacity={0} />
              </linearGradient>
            </defs>
            <rect x={14} y={12} width={120} height={176} rx={10} fill="#0d0d11" />
            <g clipPath={`url(#${id('fly-clip')})`}>
              <g transform={`translate(74 136) scale(1.7 0.95) rotate(${(-90 - heading).toFixed(2)}) translate(${(-here[0]).toFixed(2)} ${(-here[1]).toFixed(2)})`}>
                {AR_FLY_BLOCKS.map((b, i) => (
                  <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={1.5} fill="#16161b" />
                ))}
                {AR_FLY_ROADS.map((d) => (
                  <path key={d} d={d} fill="none" stroke="#2a2a31" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                ))}
                <path d={AR_FLY.d} fill="none" stroke="#33333b" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <path d={AR_FLY.d} fill="none" style={{ stroke: A }} strokeOpacity={0.3} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                {p > 0.002 && (
                  <path d={AR_FLY.slice(0, p, 60)} fill="none" style={{ stroke: A }} strokeWidth={2.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${id('glow')})`} />
                )}
              </g>
              <rect x={14} y={12} width={120} height={64} fill={`url(#${id('fly-sky')})`} />
              <rect x={14} y={150} width={120} height={38} fill={`url(#${id('fly-sky')})`} transform="rotate(180 74 169)" />
              <Arrow p={[74, 136]} a={-90} color={A} glow={id('glow')} />
            </g>
            <rect x={14} y={12} width={120} height={176} rx={10} fill="none" stroke={LINE} />
            {/* The ride's name, and the town it's in at this moment */}
            <T x={74} y={27} anchor="middle" size={fitW(rideName, 104, 6.6)} weight={800}>{rideName}</T>
            <T x={74} y={36} anchor="middle" size={5.6} color={MUTED} opacity={townFade}>{town.name}</T>
            {/* The player */}
            <g transform="translate(22 170)">
              <circle cx={6} cy={4} r={6} style={{ fill: A }} />
              <path d="M4.2 1.4 L8.6 4 L4.2 6.6 Z" fill="#111" />
              <rect x={16} y={3} width={82} height={2} rx={1} fill="white" fillOpacity={0.15} />
              <rect x={16} y={3} width={82 * p} height={2} rx={1} style={{ fill: A }} />
              <circle cx={16 + 82 * p} cy={4} r={2.4} fill={INK} />
            </g>
          </g>
        )}

        {/* History: the ride, its line and its corners */}
        <Panel x={146} y={8} w={166} h={96} stroke={landed > 0 ? aa(0.35 + 0.5 * landed) : LINE} sw={landed > 0 ? 1.2 : 0.8}>
          <T x={8} y={14} weight={700}>{tr("Today")}</T>
          <T x={158} y={14} anchor="end" size={6.5} color={MUTED} mono>{`${u.miles1(45.2)} ${u.distLabel} · 1:23:45`}</T>
          <path d={AR_TRACE.slice(0, Math.max(0.001, trace), 50)} transform="translate(-146 -8)" fill="none" style={{ stroke: A }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(-146 -8)">
            <circle cx={AR_TRACE.at(0).p[0]} cy={AR_TRACE.at(0).p[1]} r={2.4} fill={INK} />
            {trace > 0.98 && <circle cx={AR_TRACE.at(1).p[0]} cy={AR_TRACE.at(1).p[1]} r={2.4} style={{ fill: A }} />}
          </g>
          <T x={8} y={80} size={6} color={MUTED}>{tr("Corner report")}</T>
          {corners.map((c, i) => {
            const k = easeOut((t - 2.6 - i * 0.15) / 0.5);
            return <rect key={i} x={8 + i * 11} y={91 - 7 * c * k} width={7} height={7 * c * k} rx={1.5} style={{ fill: c > 0.9 ? A : aa(0.5) }} />;
          })}
          <T x={158} y={90} anchor="end" size={16} weight={800} opacity={easeOut((t - 3.2) / 0.5)}>A−</T>
        </Panel>

        {/* Badges banked */}
        <Panel x={146} y={110} w={166} h={52}>
          <T x={8} y={13} size={6} color={MUTED}>{tr("Badges earned")}</T>
          {badges.map((b, i) => {
            const k = easeOutBack((t - b.at) / 0.4);
            const c: Pt = [24 + i * 39, 30];
            return (
              <g key={b.name} transform={popAt(c, k)} opacity={clamp01(k)}>
                <circle cx={c[0]} cy={c[1]} r={10} style={{ fill: aa(0.15), stroke: A }} strokeWidth={1} />
                <Ico I={b.I} x={c[0] - 5.5} y={c[1] - 5.5} s={11} />
                <T x={c[0]} y={c[1] + 18} anchor="middle" size={4.8} color={MUTED}>{b.name}</T>
              </g>
            );
          })}
        </Panel>
        <Chip x={AR_FLY_CHIP.x} y={AR_FLY_CHIP.y} label={tr("3D flyover")} I={Mountain} tone={t > AR_FLY_TAP ? aa(0.7) : undefined} opacity={easeOut((t - 5.2) / 0.4)} />
        <Chip x={VW - 8} y={170} right label={tr("Overlay video")} I={Video} opacity={easeOut((t - 5.6) / 0.4)} />
        {tapK > 0 && tapK < 1 && (
          <circle cx={tapAt[0]} cy={tapAt[1]} r={8 + tapK * 18} fill="none" style={{ stroke: A }} strokeWidth={1.2} opacity={0.8 * (1 - tapK)} />
        )}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Mecha-Nick's garage: the bike on its stand, the miles rolling up from rides,
// the chain coming due (the app's own reminder), serviced and stamped in the
// paper logbook, and the logbook handed on to a new keeper by QR
// =============================================================================

const GA_P = 12;
/** The logbook's paper and inks (LogbookView). */
const PAPER = '#f6eed9';
const PAPER_DARK = '#e6d9b8';
const INK_BROWN = '#2b2118';
const INK_BLUE = '#1f2a5a';
const STAMP = { ok: '#2f6b2f', soon: '#a86a12' };
const GA_REMIND = 4.4;
const GA_DONE = 6.8;
const GA_TURN = 8.4;
const GA_HAND = 9.5;
const GA_GONE = 11.0;

const GA_CUES: SceneCue[] = [
  [1.3, 'tap'],
  [2.9, 'tap'],
  [GA_REMIND, 'ping'],
  [GA_DONE, 'impact'],
  [GA_DONE + 0.15, 'success'],
  [GA_TURN, 'whoosh'],
  [GA_HAND, 'tap'],
  [GA_GONE, 'success'],
];

/** For the tour: how long the garage scene runs. */
export const GARAGE_SECONDS = GA_P;
/** The bike on the workshop floor. */
const GA_BIKE = { cx: 80, floor: 188, height: 98 };

export function GarageScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), GA_P);
  // Miles land from each ride, then the reminder, the service, the stamp, the hand-over.
  const ridden = 12480 + 54 * easeOut((t - 1.3) / 0.6) + 66 * easeOut((t - 2.9) / 0.6);
  const odo = Math.round(ridden);
  const serviced = t >= GA_DONE;
  const stampK = serviced ? clamp01((t - GA_DONE) / 0.18) : 0;
  const remind = win(t, GA_REMIND, 6.0, 0.3);
  const turn = clamp01((t - GA_TURN) / 0.5);
  const page = turn < 0.5 ? 'record' : 'keeper';
  const pageScale = turn < 0.5 ? 1 - turn * 2 : (turn - 0.5) * 2;
  const qr = easeOutBack((t - GA_HAND - 0.2) / 0.4);
  const live = clamp01((t - GA_HAND - 0.2) / 1.6);
  const gone = t >= GA_GONE;
  const lines: [number, number, string][] = [
    [1.0, 4.0, tr("Every trip lands in here.")],
    [6.0, 8.2, tr("Chain's due. Lube it and I'll write it up.")],
    [8.3, GA_P - 0.5, tr("Selling? The history goes with the bike.")],
  ];
  const line = lines.find(([a, b]) => t >= a && t < b);
  // Mecha-Nick: breathing, a nod and a lean while he talks, over to the chain to do it, and back.
  const walkTo = easeInOut((t - 5.7) / 0.5);
  const walkBack = easeInOut((t - 7.15) / 0.55);
  const away = walkTo * (1 - walkBack);
  const walking = (t > 5.7 && t < 6.2) || (t > 7.15 && t < 7.7);
  const crouch = win(t, 6.2, 7.1, 0.2);
  const nickX = lerp(146, 120, away);
  const step = walking ? Math.abs(Math.sin(t * Math.PI * 4)) * 1.6 : 0;
  const talkLean = line ? Math.sin(t * 5) * 1.4 : 0;
  const nickLean = talkLean - 4 * crouch;
  const nickSquash = (1 + 0.008 * Math.sin(t * 2.4)) * (1 - 0.07 * crouch);
  const chain = bikeAt(GA_BIKE, 190, 700);
  const clank = crouch > 0.5 ? Math.max(0, Math.sin(t * 16)) : 0;
  const bubble = line ? win(t, line[0], line[1], 0.25) : 0;
  const said = fitLines(line?.[2] ?? '', 90, 6.2, 2);
  const bubbleH = said.lines.length > 1 ? 30 + said.size + 1.8 : 30;
  const due = 12610;
  const items: { name: string; every: number; last: number; ok: boolean }[] = [
    { name: tr("Chain lube"), every: 500, last: serviced ? odo : 12110, ok: serviced },
    { name: tr("Oil"), every: 4000, last: 10320, ok: true },
    { name: tr("Tyres"), every: 6000, last: 9850, ok: true },
    { name: tr("Brakes"), every: 8000, last: 7900, ok: true },
  ];
  const leftToService = Math.max(0, due + 40 - odo);
  const notifTitle = tr("🔧 {0} due soon", [tr("Chain lube")]);
  const notifBody = tr("{0}: due in {1} {2}.", ['V4 Ducati', u.miles(leftToService / 1), u.distLabel]);
  // Under the hand-over: what stays, then who it went to (two lines before it shrinks).
  const keeperNote = fitLines(
    gone ? tr("{0} has the logbook now", ['Sam']) : qr > 0 ? `${tr("Handing over to")} Sam…` : tr("Your own ride history and totals stay with you."),
    108,
    5.2,
  );

  return (
    <Frame sound={{ t, cues: GA_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={VH} fill={BG} />
      <g opacity={loopFade(t, GA_P)}>
        {/* The workshop the app's garage stands in, Nick at the back of the bike */}
        <GarageBackdrop id={id} dim={0.32} />
        <NickSilhouette x={nickX} floor={184 - step} height={118} lean={nickLean} squash={nickSquash} />
        <ellipse cx={GA_BIKE.cx} cy={GA_BIKE.floor + 1.5} rx={54} ry={3.6} fill="black" opacity={0.6} />
        <BikePhoto {...GA_BIKE} />
        {clank > 0.4 && (
          <g transform={`translate(${chain[0].toFixed(1)} ${chain[1].toFixed(1)})`} opacity={(clank - 0.4) / 0.6}>
            {[-40, 0, 40].map((a) => (
              <line key={a} x1={0} y1={-4} x2={0} y2={-9} style={{ stroke: A }} strokeWidth={1.2} strokeLinecap="round" transform={`rotate(${a})`} />
            ))}
          </g>
        )}

        {/* The bike's miles */}
        <g transform="translate(8 8)">
          <rect width={98} height={17} rx={5} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
          <Ico I={Gauge} x={6} y={4} s={9} />
          <T x={19} y={11.6} size={6.6} weight={700}>V4 Ducati</T>
          <T x={92} y={11.6} anchor="end" size={6.6} weight={800} mono>{`${u.miles(odo)} ${u.distLabel}`}</T>
        </g>
        {[1.3, 2.9].map((at, i) => {
          const k = clamp01((t - at) / 1.2);
          if (k <= 0 || k >= 1) return null;
          return (
            <T key={i} x={92} y={34 - 10 * easeOut(k)} anchor="end" size={6} weight={800} color={GREEN} opacity={1 - k * k} mono>
              {`+${u.miles(i ? 66 : 54)} ${u.distLabel}`}
            </T>
          );
        })}

        {/* Mecha-Nick talks: a second line before the words shrink, the bubble growing upwards, clear of his head */}
        {bubble > 0.01 && line && (
          <g opacity={bubble} transform={`translate(${(nickX - 92).toFixed(1)} ${(30 - (bubbleH - 30) - 6 * (1 - easeOut((t - line[0]) / 0.3))).toFixed(1)})`}>
            <rect width={104} height={bubbleH} rx={8} fill="white" />
            <path d={`M96 ${bubbleH} l2 7 l-9 -7 z`} fill="white" />
            <T x={8} y={9.5} size={4.4} weight={700} color="#71717a" spacing={0.8}>{tr("Mecha-Nick").toUpperCase()}</T>
            {said.lines.map((l, i) => (
              <T key={i} x={8} y={21 + i * (said.size + 1.8)} size={said.size} weight={600} color="#18181b">{l}</T>
            ))}
          </g>
        )}

        {/* The logbook, open */}
        <g transform="rotate(-1.5 246 100)">
          <rect x={180} y={12} width={132} height={178} rx={3} fill="#000" opacity={0.35} transform="translate(2 3)" />
          <g transform={`translate(180 0) scale(${Math.max(0.001, pageScale).toFixed(3)} 1) translate(-180 0)`}>
            <rect x={180} y={12} width={132} height={178} rx={3} fill={PAPER} />
            <line x1={180.6} y1={14} x2={180.6} y2={188} stroke={INK_BROWN} strokeOpacity={0.25} strokeWidth={1.2} />
            {page === 'record' ? (
              <g transform="translate(190 26)">
                <T x={0} y={0} size={6.4} weight={900} color={INK_BROWN} spacing={1.4}>{tr("Service record").toUpperCase()}</T>
                <line x1={0} y1={4} x2={112} y2={4} stroke={INK_BROWN} strokeOpacity={0.7} strokeWidth={1.1} />
                {items.map((it, i) => {
                  const y = 18 + i * 30;
                  const stamped = i > 0 || serviced;
                  const ok = it.ok;
                  const color = ok ? STAMP.ok : STAMP.soon;
                  const label = ok ? tr("OK") : tr("Due soon");
                  const slam = i === 0 && serviced ? 1.6 - 0.6 * stampK : 1;
                  return (
                    <g key={i} transform={`translate(0 ${y})`}>
                      <T x={0} y={0} size={6.2} weight={800} color={INK_BROWN}>{it.name}</T>
                      {stamped || !ok ? (
                        <g transform={`translate(${112 - textW(label, 4.8) / 2 - 4} -2) rotate(-4) scale(${slam.toFixed(3)})`} opacity={i === 0 && serviced ? stampK : 1}>
                          <rect x={-textW(label, 4.8) / 2 - 3} y={-5} width={textW(label, 4.8) + 6} height={8} rx={1} fill="none" stroke={color} strokeWidth={0.8} />
                          <T x={0} y={1.4} anchor="middle" size={4.8} weight={900} color={color} spacing={0.6}>{label.toUpperCase()}</T>
                        </g>
                      ) : null}
                      <T x={0} y={9} size={4.8} color="rgba(43,33,24,0.7)" mono>
                        {`${tr("every")} ${u.miles(it.every)} ${u.distLabel} ${tr("· last")} ${u.miles(it.last)} ${u.distLabel}`}
                      </T>
                      {i === 0 && serviced && (
                        <g opacity={clamp01((t - GA_DONE - 0.3) / 0.5)}>
                          <T x={0} y={18} size={5.6} color={INK_BLUE}>
                            <tspan fontStyle="italic" fontFamily="Georgia, 'Times New Roman', serif">{tr("“{0}”", [tr("Chain adjusted & lubed")])}</tspan>
                          </T>
                        </g>
                      )}
                    </g>
                  );
                })}
                <rect x={0} y={128} width={112} height={22} rx={2} fill={PAPER_DARK} />
                <T x={56} y={137} anchor="middle" size={4.6} color="rgba(43,33,24,0.75)">{tr("Odometer")}</T>
                <T x={56} y={146} anchor="middle" size={6.4} weight={800} color={INK_BROWN} mono>{`${u.miles(odo)} ${u.distLabel}`}</T>
              </g>
            ) : (
              <g transform="translate(190 26)">
                <T x={0} y={0} size={6.4} weight={900} color={INK_BROWN} spacing={1.4}>{tr("Change of keeper").toUpperCase()}</T>
                <line x1={0} y1={4} x2={112} y2={4} stroke={INK_BROWN} strokeOpacity={0.7} strokeWidth={1.1} />
                <foreignObject x={0} y={9} width={112} height={44}>
                  <p style={{ margin: 0, fontSize: 5.4, lineHeight: 1.35, color: INK_BROWN }}>
                    {tr("Selling or passing it on? The new keeper scans your code and gets this logbook, its trading card and its stats.")}
                  </p>
                </foreignObject>
                {qr > 0 ? (
                  <g transform={`translate(56 98) scale(${Math.max(0.001, qr).toFixed(3)})`}>
                    <circle r={34} fill="none" stroke={INK_BROWN} strokeOpacity={0.15} strokeWidth={2} />
                    <circle r={34} fill="none" stroke={gone ? STAMP.ok : INK_BROWN} strokeWidth={2} strokeDasharray={`${(213.6 * (1 - live)).toFixed(1)} 214`} transform="rotate(-90)" />
                    <g transform="translate(-22 -22)">
                      <rect width={44} height={44} rx={3} fill="white" />
                      {GA_QR.map((on, i) => (on ? <rect key={i} x={2 + (i % 15) * 2.67} y={2 + Math.floor(i / 15) * 2.67} width={2.7} height={2.7} fill={INK_BROWN} /> : null))}
                    </g>
                    {gone && (
                      <g>
                        <circle r={12} fill={STAMP.ok} />
                        <path d="M-5 0 l3.5 3.5 l7 -7" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                  </g>
                ) : (
                  <g transform="translate(30 84)">
                    <rect width={52} height={30} rx={4} fill={INK_BROWN} />
                    <Ico I={QrCode} x={20} y={5} s={12} color={PAPER} />
                    <T x={26} y={25} anchor="middle" size={5} weight={900} color={PAPER} spacing={0.8}>{tr("Hand over").toUpperCase()}</T>
                  </g>
                )}
                {keeperNote.lines.map((l, i) => (
                  <T key={i} x={56} y={146 + i * (keeperNote.size + 1.6)} anchor="middle" size={keeperNote.size} color="rgba(43,33,24,0.75)">
                    {l}
                  </T>
                ))}
              </g>
            )}
          </g>
        </g>
        <Tap p={[250, 125]} t={t} at={GA_HAND} />
        {/* The reminder, as the app sends it */}
        {remind > 0.01 && (
          <g opacity={remind} transform={`translate(0 ${(-8 * (1 - easeOut((t - GA_REMIND) / 0.35))).toFixed(1)})`}>
            <g transform="translate(79 8)">
              <rect width={162} height={30} rx={9} style={{ fill: 'rgba(24,24,30,0.97)', stroke: `${AMBER}88` }} strokeWidth={0.9} />
              <rect x={6} y={6} width={18} height={18} rx={5} fill={AMBER} fillOpacity={0.18} />
              <Ico I={Wrench} x={10} y={10} s={10} color={AMBER} />
              <T x={30} y={13} size={fitW(notifTitle, 106, 6.8)} weight={800}>{notifTitle}</T>
              <T x={30} y={23} size={fitW(notifBody, 124, 5.8)} color={MUTED}>{notifBody}</T>
              <T x={155} y={13} anchor="end" size={5} color={MUTED}>{tr("now")}</T>
            </g>
          </g>
        )}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** The hand-over code's look. */
const GA_QR = Array.from({ length: 15 * 15 }, (_, i) => {
  const r = Math.floor(i / 15);
  const c = i % 15;
  const finder = (fr: number, fc: number) => {
    const y = r - fr;
    const x = c - fc;
    if (x < 0 || y < 0 || x > 4 || y > 4) return null;
    return x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2);
  };
  const f = finder(0, 0) ?? finder(0, 10) ?? finder(10, 0);
  if (f != null) return f;
  return frac(Math.sin(i * 12.9898 + 4.1) * 43758.5453) > 0.5;
});

/** A finger tap at `p` around `at`. */
function Tap({ p, t, at }: { p: Pt; t: number; at: number }) {
  const k = clamp01((t - at + 0.25) / 0.6);
  if (k <= 0 || k >= 1) return null;
  return (
    <g opacity={win(t, at - 0.25, at + 0.35, 0.12)}>
      <circle cx={p[0]} cy={p[1]} r={5 + 11 * k} fill="none" stroke="white" strokeOpacity={0.8 * (1 - k)} strokeWidth={1} />
      <circle cx={p[0]} cy={p[1]} r={5} fill="white" fillOpacity={0.18} stroke="white" strokeOpacity={0.6} strokeWidth={0.8} />
    </g>
  );
}

// =============================================================================
// Trading cards: the card climbs every tier from Locked to Orion
// =============================================================================

const TC_STEP = 1.45;
const TIER_FINISH: Record<string, [string, string, string]> = {
  // [light, dark, edge]
  locked: ['#2b2b31', '#131317', '#4a4a52'],
  bronze: ['#c98a55', '#5c3514', '#e0a878'],
  silver: ['#e3e6ea', '#7b8591', '#f4f6f8'],
  gold: ['#f6d56b', '#9c6a12', '#ffe9a3'],
  platinum: ['#dfe7ee', '#8c9aa7', '#ffffff'],
  diamond: ['#b8f1ff', '#2c8fb5', '#e6fbff'],
  ruby: ['#ff5f7e', '#7e0a22', '#ff9fb2'],
  obsidian: ['#3c3548', '#08070b', '#8a7aa8'],
  polyatomic: ['#7cf7c8', '#6d4dff', '#c8fff0'],
  orion: ['#a78bfa', '#140a3f', '#e3d7ff'],
};

/** A flip for every tier up, a flourish on the last. */
const TC_CUES: SceneCue[] = [...TIER_LADDER.slice(1).map((_, i): SceneCue => [(i + 1) * TC_STEP, 'whoosh']), [(TIER_LADDER.length - 1) * TC_STEP + 0.5, 'success']];

export function TradingCardsScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const n = TIER_LADDER.length;
  const period = n * TC_STEP + 1.6;
  const tp = loopT(t, period);
  const idx = Math.min(n - 1, Math.floor(tp / TC_STEP));
  const tier = TIER_LADDER[idx];
  const [light, dark, edge] = TIER_FINISH[tier.id] ?? TIER_FINISH.locked;
  const since = tp - idx * TC_STEP;
  const flip = idx > 0 ? Math.abs(Math.cos(clamp01(since / 0.5) * Math.PI)) : 1;
  const shine = clamp01((since - 0.3) / 0.8);
  const locked = tier.id === 'locked';
  const next = TIER_LADDER[idx + 1];
  const rides = lerp(tier.minRides, next ? next.minRides : tier.minRides, clamp01(since / TC_STEP));
  const C: Pt = [96, 104];
  const W = 92;
  const H = 128;
  const x0 = C[0] - W / 2;
  const y0 = C[1] - H / 2;
  const starry = tier.id === 'orion' || tier.id === 'obsidian';
  // Bottom line: the tier's full name left, its ride count right; type shrinks rather than cuts.
  const chipLabel = tier.label.toUpperCase();
  const ridesLabel = tier.minRides === 0 ? tr("0 RIDES") : tr("{0}+ RIDES", [tier.minRides]);
  const chipSize = Math.min(5.4, 40 / (textW(chipLabel, 1) * 1.08));
  const ridesSize = 32 / (textW(ridesLabel, 1) * 1.05);

  return (
    <Frame sound={{ t: tp, cues: TC_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <defs>
        <linearGradient id={id('finish')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.55" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('card')}>
          <rect x={x0} y={y0} width={W} height={H} rx={8} />
        </clipPath>
        <clipPath id={id('photo')}>
          <rect x={x0 + 7} y={y0 + 22} width={W - 14} height={52} rx={4} />
        </clipPath>
        <filter id={id('silhouette')}>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" />
        </filter>
      </defs>
      <g opacity={loopFade(tp, period)}>
        {/* The card */}
        <g transform={`translate(${C[0]} ${C[1]}) scale(${Math.max(0.02, flip).toFixed(3)} 1) translate(${-C[0]} ${-C[1]})`}>
          <ellipse cx={C[0]} cy={y0 + H + 10} rx={48} ry={5} fill="black" opacity={0.6} />
          <g clipPath={`url(#${id('card')})`}>
            <rect x={x0} y={y0} width={W} height={H} fill={`url(#${id('finish')})`} />
            {starry &&
              Array.from({ length: 22 }, (_, i) => (
                <circle key={i} cx={x0 + frac(Math.sin(i * 12.9) * 437.5) * W} cy={y0 + frac(Math.sin(i * 78.2) * 912.1) * H} r={0.5 + frac(i * 0.37) * 0.8} fill="white" opacity={0.4 + 0.4 * Math.sin(t * 2 + i)} />
              ))}
            {!locked && shine > 0 && shine < 1 && (
              <rect x={x0 - W + shine * W * 2.4} y={y0 - 20} width={W * 0.5} height={H + 40} fill={`url(#${id('shine')})`} transform={`rotate(20 ${C[0]} ${C[1]})`} />
            )}
          </g>
          <rect x={x0} y={y0} width={W} height={H} rx={8} fill="none" stroke={edge} strokeWidth={2} />
          <T x={x0 + 8} y={y0 + 14} size={6.5} weight={800} color="#fff" spacing={0.6}>V4 DUCATI</T>
          {/* Tier badge (the name sits on the bottom line, where it fits whole) */}
          <circle cx={x0 + W - 13.5} cy={y0 + 11.5} r={5.5} fill="black" fillOpacity={0.35} />
          <Ico I={locked ? Lock : Sparkles} x={x0 + W - 16.5} y={y0 + 8.5} s={6} color="#fff" />
          <rect x={x0 + 7} y={y0 + 22} width={W - 14} height={52} rx={4} fill="black" fillOpacity={0.35} stroke="white" strokeOpacity={0.12} />
          <g clipPath={`url(#${id('photo')})`}>
            <BikePhoto cx={C[0]} floor={y0 + 70} height={46} filter={locked ? `url(#${id('silhouette')})` : undefined} />
          </g>
          {locked && <Ico I={Lock} x={C[0] - 6} y={y0 + 42} s={12} color="rgba(255,255,255,0.8)" />}
          {['SPD', 'DST', 'TIME', 'RIDES'].map((s, i) => (
            <g key={s} transform={`translate(${x0 + 7 + (i % 2) * ((W - 14) / 2 + 1)} ${y0 + 80 + Math.floor(i / 2) * 17})`}>
              <rect width={(W - 16) / 2} height={15} rx={3} fill="black" fillOpacity={0.4} stroke="white" strokeOpacity={0.1} />
              <T x={4} y={6} size={4} color="rgba(255,255,255,0.6)" spacing={0.5}>{s}</T>
              <T x={4} y={12.5} size={5.5} weight={800} color="#fff" mono>{locked ? '—' : ['142', '1.1k', '3d', String(Math.round(rides))][i]}</T>
            </g>
          ))}
          <T x={x0 + 8} y={y0 + H - 7} size={chipSize} weight={800} color="#fff" spacing={0.4}>{chipLabel}</T>
          <T x={x0 + W - 8} y={y0 + H - 7} anchor="end" size={Math.min(5, ridesSize)} weight={700} color="rgba(255,255,255,0.85)" spacing={0.4}>
            {ridesLabel}
          </T>
        </g>

        {/* The ladder */}
        <T x={172} y={34} size={Math.min(16, (VW - 8 - 172) / textW(tier.label, 1))} weight={800}>{tier.label}</T>
        <T x={172} y={46} size={7} color={MUTED}>{tier.minRides === 0 ? tr("Ride it to unlock the card") : tr("{0}+ rides", [tier.minRides])}</T>
        {TIER_LADDER.map((tt, i) => {
          const [l, d, e] = TIER_FINISH[tt.id] ?? TIER_FINISH.locked;
          const x = 172 + (i % 5) * 28;
          const y = 62 + Math.floor(i / 5) * 40;
          const on = i === idx;
          const done = i < idx;
          return (
            <g key={tt.id} transform={`translate(${x} ${y})`} opacity={on || done ? 1 : 0.35}>
              <defs>
                <linearGradient id={id(`t${i}`)} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={l} />
                  <stop offset="1" stopColor={d} />
                </linearGradient>
              </defs>
              <rect width={20} height={27} rx={3} fill={`url(#${id(`t${i}`)})`} stroke={on ? A : e} strokeWidth={on ? 1.6 : 0.8} />
              {done && <Ico I={Check} x={6} y={9} s={8} color="#fff" />}
              <T x={10} y={35} anchor="middle" size={Math.min(4.3, 25 / textW(tt.label, 1))} color={on ? INK : MUTED}>{tt.label}</T>
            </g>
          );
        })}
        <T x={172} y={160} size={6} color={MUTED}>{tr("Rides on this vehicle")}</T>
        <T x={312} y={160} anchor="end" size={9} weight={800} mono>{Math.round(rides)}</T>
        <Bar x={172} y={166} w={140} h={3.5} f={next ? (rides - tier.minRides) / Math.max(1, next.minRides - tier.minRides) : 1} />
        <Chip x={172} y={176} label={tr("Share & scan by QR")} I={IdCard} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Track Day: laps against the clock with coloured sectors, and the pit crew's
// board spoken in the helmet
// =============================================================================

const TD_LAP = 8.4;
const TD_CIRCUIT = new Route(
  [[40, 40], [100, 26], [150, 34], [168, 62], [140, 86], [110, 100], [124, 128], [166, 136], [178, 164], [148, 184], [80, 184], [36, 164], [22, 118], [26, 72]],
  true,
  14,
);
const TD_SECTORS = [
  { color: PURPLE, time: '29.184' },
  { color: GREEN, time: '31.402' },
  { color: AMBER, time: '31.832' },
];

/** Two laps: a beep at the line and each sector split, the pit board called over the radio, and a flourish for the personal best. */
const TD_CUES: SceneCue[] = [
  ...[0, TD_LAP].flatMap((lap): SceneCue[] => [
    [lap + 0.05, 'beep'], [lap + TD_LAP / 3, 'beep'], [lap + (2 * TD_LAP) / 3, 'beep'], [lap + 0.4, 'radioIn'], [lap + 1.4, 'radioOut'],
  ]),
  [TD_LAP + 0.1, 'success'],
];
/** The live gap to the best lap through the lap: a touch down in sector one, then gaining. */
const TD_DELTA: [number, number][] = [[0, 0], [1 / 3, 0.042], [2 / 3, -0.118], [1, -0.214]];
const deltaAt = (f: number) => {
  for (let i = 0; i < TD_DELTA.length - 1; i++) {
    const [a, va] = TD_DELTA[i];
    const [b, vb] = TD_DELTA[i + 1];
    if (f <= b) return lerp(va, vb, (f - a) / (b - a));
  }
  return TD_DELTA[TD_DELTA.length - 1][1];
};
/** The circuit's board once the lap is in: you're third. Made-up riders. */
const TD_BOARD: [string, string][] = [['Rico', '1:31.902'], ['Sam', '1:32.104']];

export function TrackDayScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const lapT = loopT(t, TD_LAP);
  const f = lapT / TD_LAP;
  const at = TD_CIRCUIT.at(f);
  const sector = Math.min(2, Math.floor(f * 3));
  const lapTime = 92.418 * f;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  const second = loopT(t, TD_LAP * 2) >= TD_LAP;
  const board = second ? tr("BOX") : tr("PUSH");
  const sf = TD_CIRCUIT.at(0);
  // Over the line: the lap that's just in, in purple, before the clock carries on.
  const pb = second && lapT < 1.7;
  const delta = deltaAt(f);
  const boardK = second ? win(lapT, 0.5, TD_LAP, 0.4) : 0;

  return (
    <Frame sound={{ t: loopT(t, TD_LAP * 2), cues: TD_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <Road d={TD_CIRCUIT.d} w={9} />
      {TD_SECTORS.map((s, i) =>
        i <= sector ? (
          <path key={i} d={TD_CIRCUIT.slice(i / 3, i === sector ? f : (i + 1) / 3, 40)} fill="none" stroke={s.color} strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
        ) : null,
      )}
      {[1 / 3, 2 / 3].map((s) => {
        const p = TD_CIRCUIT.at(s);
        return (
          <g key={s} transform={`translate(${p.p[0]} ${p.p[1]}) rotate(${p.a + 90})`}>
            <line x1={-7} x2={7} stroke="white" strokeOpacity={0.5} strokeWidth={1.2} />
          </g>
        );
      })}
      <g transform={`translate(${sf.p[0]} ${sf.p[1]}) rotate(${sf.a + 90})`}>
        {[-6, -3, 0, 3].map((x, i) => (
          <rect key={x} x={x} y={-2.5} width={3} height={2.5} fill={i % 2 ? '#111' : '#fff'} />
        ))}
        {[-6, -3, 0, 3].map((x, i) => (
          <rect key={`b${x}`} x={x} y={0} width={3} height={2.5} fill={i % 2 ? '#fff' : '#111'} />
        ))}
      </g>
      <Arrow p={at.p} a={at.a} color={A} glow={id('glow')} />

      {/* Live timing */}
      <Panel x={196} y={8} w={116} h={80}>
        <T x={58} y={13} anchor="middle" size={6} color={pb ? PURPLE : MUTED} weight={700} spacing={1.5}>{pb ? tr("Personal best") : tr("Lap {0}", [second ? 7 : 6])}</T>
        <T x={58} y={34} anchor="middle" size={17} weight={800} mono color={pb ? PURPLE : INK}>{pb ? fmt(92.418) : fmt(lapTime)}</T>
        <T x={58} y={46} anchor="middle" size={9} weight={800} color={pb || delta < 0 ? GREEN : RED} mono>
          {pb ? '−0.214' : `${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}`}
        </T>
        {TD_SECTORS.map((s, i) => {
          const done = i < sector;
          return (
            <g key={i} transform={`translate(${6 + i * 36} 54)`}>
              <rect width={32} height={20} rx={4} fill={done ? s.color : '#141418'} fillOpacity={done ? 0.22 : 1} stroke={done ? s.color : LINE} strokeWidth={0.8} />
              <T x={16} y={8} anchor="middle" size={4.8} color={MUTED} weight={700}>{`S${i + 1}`}</T>
              <T x={16} y={16} anchor="middle" size={6} weight={800} color={done ? s.color : MUTED} mono>{done ? s.time : '—'}</T>
            </g>
          );
        })}
      </Panel>

      {/* The pit board */}
      <g transform="translate(196 96)">
        <rect width={116} height={50} rx={6} fill="#050506" style={{ stroke: A }} strokeWidth={1.6} />
        <T x={58} y={14} anchor="middle" size={5.5} color={A} weight={800} spacing={2}>{tr("PIT BOARD")}</T>
        <T x={58} y={38} anchor="middle" size={20} weight={900} spacing={2}>{board}</T>
      </g>
      <g opacity={1 - boardK}>
        <Chip x={196} y={154} label={tr("Pit crew · live")} I={Users} />
        <Chip x={196} y={175} label={tr("Calls spoken in your helmet")} I={Sparkles} opacity={0.9} />
      </g>
      {/* The lap goes on the circuit's board */}
      {boardK > 0.01 && (
        <g opacity={boardK}>
          <Panel x={196} y={150} w={116} h={42} r={6}>
            {[...TD_BOARD, [tr("You"), '1:32.418'] as [string, string]].map(([who, time], i) => (
              <g key={i} transform={`translate(6 ${4 + i * 12})`}>
                {i === 2 && <rect x={-3} y={-1} width={110} height={11} rx={3} fill={PURPLE} fillOpacity={0.18} />}
                <T x={0} y={7.4} size={5.6} weight={800} color={i === 2 ? PURPLE : MUTED} mono>{`P${i + 1}`}</T>
                <T x={14} y={7.4} size={5.8} weight={i === 2 ? 800 : 600}>{who}</T>
                <T x={104} y={7.4} anchor="end" size={5.8} weight={700} mono color={i === 2 ? PURPLE : INK}>{time}</T>
              </g>
            ))}
          </Panel>
        </g>
      )}
      <Vignette id={id} />
    </Frame>
  );
}
