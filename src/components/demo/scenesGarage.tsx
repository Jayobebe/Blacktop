import {
  BookOpen,
  Check,
  CornerUpRight,
  Flag,
  Ghost,
  IdCard,
  Lock,
  Moon,
  Mountain,
  Sparkles,
  Timer,
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
import bikeAsset from '@/assets/demo-bike.png.asset.json';
import {
  A,
  AMBER,
  Arrow,
  BG,
  Bar,
  Base,
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
  frac,
  lerp,
  loopT,
  popAt,
  useIds,
  useSceneTime,
  win,
  type Icon,
  type Pt,
} from '@/components/scene/kit';

/*
 * Demo slide scenes, part two: after the ride, the garage, cards and racing.
 */

const loopFade = (t: number, period: number) => clamp01(t / 0.4) * (1 - clamp01((t - (period - 0.45)) / 0.45));
const PAPER = '#EDEAE3';
const PINK = '#F6C7DB';
const INKDARK = '#1c1a17';
const PURPLE = '#a855f7';

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

// The demo bike image: 704×1094 with the bike between x 40–665 and y 270–840.
const IMG = { w: 704, h: 1094, top: 270, bottom: 840, left: 40, right: 665 };

/** The demo bike scaled so the bike itself is `height` tall, its wheels resting at (cx, floor). */
function BikePhoto({ cx, floor, height, filter, opacity }: { cx: number; floor: number; height: number; filter?: string; opacity?: number }) {
  const s = height / (IMG.bottom - IMG.top);
  const w = IMG.w * s;
  const h = IMG.h * s;
  const x = cx - ((IMG.left + IMG.right) / 2) * s;
  const y = floor - IMG.bottom * s;
  return <image href={bikeAsset.url} x={x} y={y} width={w} height={h} filter={filter} opacity={opacity} preserveAspectRatio="xMidYMid meet" />;
}

/** A receipt printing out of a slot: `f` = how much has printed (0..1). */
function Receipt({
  x,
  y,
  w,
  h,
  f,
  paper,
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
          <T x={w / 2} y={15} anchor="middle" size={8.5} weight={800} color={INKDARK} spacing={1.2}>{title}</T>
          <T x={w / 2} y={24} anchor="middle" size={5} color={INKDARK} opacity={0.7} spacing={1.2}>{sub}</T>
          <line x1={8} x2={w - 8} y1={30} y2={30} stroke={INKDARK} strokeOpacity={0.5} strokeDasharray="2 2" />
          {rows.map(([k, v], i) => (
            <g key={k} transform={`translate(0 ${40 + i * 11})`}>
              <T x={8} y={0} size={5.8} color={INKDARK} weight={600}>{k.toUpperCase()}</T>
              <T x={w - 8} y={0} anchor="end" size={5.8} color={INKDARK} weight={800} mono>{v}</T>
            </g>
          ))}
          <line x1={8} x2={w - 8} y1={40 + rows.length * 11 - 5} y2={40 + rows.length * 11 - 5} stroke={INKDARK} strokeOpacity={0.5} strokeDasharray="2 2" />
          {footer.map((line, i) => (
            <T key={i} x={w / 2} y={40 + rows.length * 11 + 5 + i * 8} anchor="middle" size={i ? 5 : 6} color={INKDARK} weight={i ? 500 : 800} opacity={i ? 0.7 : 1} spacing={0.8}>{line}</T>
          ))}
          <g transform={`translate(${w / 2 - 34} ${h - 16})`}>
            {Array.from({ length: 28 }, (_, i) => (
              <rect key={i} x={i * 2.45} width={i % 3 === 0 ? 1.6 : 0.8} height={10} fill={INKDARK} />
            ))}
          </g>
        </g>
      </g>
    </g>
  );
}

// =============================================================================
// After the ride: the receipt prints, the ride lands in History with its
// corner grade and badges; a time-attack ride prints on pink stock
// =============================================================================

const AR_P = 14;
const AR_TRACE = new Route([[160, 76], [172, 58], [190, 64], [204, 44], [226, 52], [238, 70], [256, 60], [276, 72], [290, 56]], false, 10);

export function AfterRideScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), AR_P);
  const first = t < 7.2;
  const f = first ? easeInOut((t - 0.6) / 2.6) : easeInOut((t - 7.6) / 2.4);
  const slide = first ? easeInOut((t - 6.6) / 0.6) : 0;
  const trace = easeInOut((t - 1.2) / 2);
  const corners = [0.92, 0.84, 0.97, 0.78, 0.88];
  const badges: { I: Icon; name: string; at: number }[] = [
    { I: Zap, name: 'Speed Demon', at: 3.6 },
    { I: TrendingUp, name: 'Lean Fiend', at: 4.0 },
    { I: CornerUpRight, name: 'Corner Carver', at: 4.4 },
    { I: Moon, name: 'Night Owl', at: 4.8 },
  ];

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, AR_P)}>
        {/* The printer and the receipt */}
        <rect x={14} y={8} width={120} height={10} rx={4} fill="#26262c" stroke={LINE} />
        <rect x={20} y={14} width={108} height={1.4} fill="#050506" />
        <g transform={`translate(${-slide * 40} ${-slide * 20})`} opacity={1 - slide}>
          {first ? (
            <Receipt
              clip={id('r1')}
              x={20}
              y={15}
              w={108}
              h={168}
              f={f}
              paper={PAPER}
              title={tr("BLACKTOP STORE")}
              sub={tr("— RIDE RECEIPT —")}
              rows={[
                [tr("Max Spd"), `${u.speed(104)} ${u.speedLabel}`],
                [tr("Max Lean"), '44°'],
                [tr("Distance"), `${u.miles1(45.2)} ${u.distLabel.toUpperCase()}`],
                [tr("Duration"), '1:23:45'],
                [tr("Avg Spd"), `${u.speed(32)} ${u.speedLabel}`],
                [tr("Corners"), '64'],
              ]}
              footer={[tr("THANK YOU FOR THE RIDE"), tr("ORDER #4C1A9F")]}
            />
          ) : (
            <Receipt
              clip={id('r2')}
              x={20}
              y={15}
              w={108}
              h={168}
              f={f}
              paper={PINK}
              title={tr("BLACKTOP STORE")}
              sub={tr("— TIME ATTACK RECEIPT —")}
              rows={[
                [tr("Max Spd"), `${u.speed(118)} ${u.speedLabel}`],
                [tr("Distance"), `${u.miles1(29.5)} ${u.distLabel.toUpperCase()}`],
                [tr("Duration"), '3:41'],
                [tr("Target"), '3:58'],
                [tr("Delta"), '-0:17'],
              ]}
              footer={[tr("WON · SPECTRE UNLOCKED"), tr("3x SPEED DEMON")]}
            />
          )}
        </g>

        {/* History: the ride, its line and its corners */}
        <Panel x={146} y={8} w={166} h={96}>
          <T x={8} y={14} weight={700}>{tr("Today")}</T>
          <T x={158} y={14} anchor="end" size={6.5} color={MUTED} mono>{`${u.miles1(45.2)} ${u.distLabel} · 1:23:45`}</T>
          <path d={AR_TRACE.slice(0, Math.max(0.001, trace), 50)} transform="translate(-146 -8)" fill="none" style={{ stroke: A }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(-146 -8)">
            <circle cx={AR_TRACE.at(0).p[0]} cy={AR_TRACE.at(0).p[1]} r={2.4} fill={INK} />
            {trace > 0.98 && <circle cx={AR_TRACE.at(1).p[0]} cy={AR_TRACE.at(1).p[1]} r={2.4} style={{ fill: A }} />}
          </g>
          <T x={8} y={82} size={6} color={MUTED}>{tr("Corner report")}</T>
          {corners.map((c, i) => {
            const k = easeOut((t - 2.6 - i * 0.15) / 0.5);
            return <rect key={i} x={8 + i * 11} y={88 - 10 * c * k} width={7} height={10 * c * k} rx={1.5} style={{ fill: c > 0.9 ? A : aa(0.5) }} />;
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
        <Chip x={146} y={170} label={tr("3D flyover")} I={Mountain} opacity={easeOut((t - 5.2) / 0.4)} />
        <Chip x={VW - 8} y={170} right label={tr("Overlay MP4")} I={Video} opacity={easeOut((t - 5.6) / 0.4)} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Mecha-Nick's garage: the bike on the ramp, its miles rolling up, the chain
// coming due, serviced, and the logbook written
// =============================================================================

const GA_P = 12;

export function GarageScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), GA_P);
  const odo = 12480 + Math.round(132 * easeInOut((t - 0.4) / 5.4));
  const serviced = t > 8.2;
  const chain = serviced ? 0.04 + 0.02 * clamp01((t - 8.2) / 3) : 0.7 + 0.32 * easeInOut((t - 0.4) / 5.6);
  const chainColor = serviced ? GREEN : chain > 0.97 ? RED : chain > 0.85 ? AMBER : GREEN;
  const due = win(t, 5.6, 8.4, 0.3);
  const log = easeOut((t - 8.6) / 0.5);
  const items = [
    { name: tr("Chain"), f: chain, color: chainColor },
    { name: tr("Oil"), f: 0.42 + 0.06 * easeInOut(t / 6), color: GREEN },
    { name: tr("Tyres"), f: 0.58 + 0.05 * easeInOut(t / 6), color: GREEN },
    { name: tr("Brakes"), f: 0.31 + 0.04 * easeInOut(t / 6), color: GREEN },
  ];

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15151a" />
          <stop offset="1" stopColor="#0a0a0c" />
        </linearGradient>
        <radialGradient id={id('spot')} cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="white" stopOpacity="0.1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <filter id={id('grey')}>
          <feColorMatrix type="saturate" values="0.15" />
        </filter>
      </defs>
      <rect width={VW} height={VH} fill={BG} />
      <g opacity={loopFade(t, GA_P)}>
        {/* The bay */}
        <rect x={0} y={172} width={150} height={28} fill={`url(#${id('floor')})`} />
        <line x1={0} y1={172} x2={150} y2={172} stroke="white" strokeOpacity={0.08} />
        <path d="M40 0 L110 0 L150 172 L0 172 Z" fill={`url(#${id('spot')})`} />
        <ellipse cx={76} cy={174} rx={54} ry={4} fill="black" opacity={0.6} />
        <BikePhoto cx={76} floor={174} height={104} />
        <Chip x={8} y={8} label={tr("V4 Ducati · Active")} I={Sparkles} />
        <Chip x={8} y={148} label={tr("Chain due soon")} I={Wrench} color={AMBER} tone={AMBER} opacity={due} />

        {/* The vehicle's card */}
        <Panel x={156} y={8} w={156} h={184}>
          <T x={10} y={18} size={11} weight={800}>V4 Ducati</T>
          <T x={10} y={28} size={6.5} color={MUTED}>Ducati Streetfighter V4</T>
          <T x={10} y={44} size={6} color={MUTED}>{tr("Odometer")}</T>
          <T x={146} y={46} anchor="end" size={13} weight={800} mono>{`${u.miles(odo)} ${u.distLabel}`}</T>
          {items.map((it, i) => (
            <g key={i} transform={`translate(10 ${60 + i * 18})`}>
              <T x={0} y={0} size={6.5}>{it.name}</T>
              {i === 0 && serviced && <T x={136} y={0} anchor="end" size={6} color={GREEN} weight={700}>{tr("Serviced")}</T>}
              {i === 0 && !serviced && chain > 0.97 && <T x={136} y={0} anchor="end" size={6} color={RED} weight={700}>{tr("Due")}</T>}
              <Bar x={0} y={4} w={136} h={3.5} f={it.f} color={it.color} />
            </g>
          ))}
          {/* Logbook entry */}
          <g transform="translate(10 136)" opacity={log}>
            <line x1={0} y1={-6} x2={136} y2={-6} stroke={LINE} />
            <Ico I={BookOpen} x={0} y={0} s={10} />
            <T x={15} y={7.5} weight={700}>{tr("Logbook")}</T>
            <T x={0} y={22} size={6.2}>{tr("Chain adjusted & lubed")}</T>
            <T x={0} y={32} size={5.8} color={MUTED} mono>{`${u.miles(12612)} ${u.distLabel} · ${tr("Today")}`}</T>
          </g>
        </Panel>
      </g>
      <Vignette id={id} />
    </Frame>
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

  return (
    <Frame>
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
          <rect x={x0 + W - 8 - 30} y={y0 + 6} width={30} height={11} rx={5.5} fill="black" fillOpacity={0.35} />
          <Ico I={locked ? Lock : Sparkles} x={x0 + W - 35} y={y0 + 8.5} s={6} color="#fff" />
          <T x={x0 + W - 12} y={y0 + 14.5} anchor="end" size={4.6} weight={800} color="#fff">{tier.label.toUpperCase().slice(0, 7)}</T>
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
          <T x={C[0]} y={y0 + H - 7} anchor="middle" size={5} weight={700} color="rgba(255,255,255,0.85)" spacing={0.8}>
            {tier.minRides === 0 ? tr("0 RIDES") : tr("{0}+ RIDES", [tier.minRides])}
          </T>
        </g>

        {/* The ladder */}
        <T x={172} y={34} size={16} weight={800}>{tier.label}</T>
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
              <T x={10} y={35} anchor="middle" size={4.3} color={on ? INK : MUTED}>{tt.label.slice(0, 8)}</T>
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
// Card challenges: ready up, race the setter's line with a live delta, beat
// it, and their Spectre card rises out of the fog
// =============================================================================

const CC_P = 11;
const CC_ROUTE = new Route([[30, 170], [66, 158], [90, 124], [132, 112], [176, 118], [212, 90], [244, 64], [288, 44]], false, 16);
const CC_RUN = [1.3, 6.3];
const CC_TARGET = 238;
const CC_TIME = 221;

export function CardChallengeScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), CC_P);
  const run = clamp01((t - CC_RUN[0]) / (CC_RUN[1] - CC_RUN[0]));
  const prog = 1 - Math.pow(1 - run, 1.3);
  const at = CC_ROUTE.at(prog);
  const clock = CC_TIME * run;
  const delta = clock - CC_TARGET * run;
  const counting = t < CC_RUN[0];
  const count = Math.max(1, Math.ceil((CC_RUN[0] - t) / 0.42));
  const finished = t >= CC_RUN[1];
  const burst = clamp01((t - CC_RUN[1]) / 0.6);
  const spectre = win(t, 6.8, 10.5, 0.5);
  const rise = easeOutBack((t - 6.8) / 0.8);
  const end = CC_ROUTE.at(1).p;
  const start = CC_ROUTE.at(0).p;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <defs>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe5ec" />
          <stop offset="0.5" stopColor="#8f9aa8" />
          <stop offset="1" stopColor="#3b4450" />
        </linearGradient>
        <filter id={id('ghost')}>
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.75" />
          </feComponentTransfer>
        </filter>
        <clipPath id={id('sp')}>
          <rect x={125} y={48} width={70} height={98} rx={7} />
        </clipPath>
      </defs>
      <g opacity={loopFade(t, CC_P)}>
        <Road d="M0 100 L90 124" w={3.5} />
        <Road d="M176 118 L220 200" w={3.5} />
        <Road d={CC_ROUTE.d} w={7} />
        <path d={CC_ROUTE.d} fill="none" style={{ stroke: A }} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 4" />
        {run > 0 && <path d={CC_ROUTE.slice(0, prog, 60)} fill="none" style={{ stroke: A }} strokeWidth={3} strokeLinecap="round" />}
        {/* Start: the dropped card */}
        <g transform={`translate(${start[0] - 7} ${start[1] - 22})`}>
          <rect width={14} height={18} rx={2.5} fill={PANEL} style={{ stroke: A }} strokeWidth={1} />
          <Ico I={Timer} x={3} y={4.5} s={8} />
        </g>
        {/* Finish */}
        <g transform={`translate(${end[0]} ${end[1]})`}>
          {finished && <circle r={6 + burst * 22} fill="none" stroke={GREEN} strokeWidth={1.5} opacity={1 - burst} />}
          <circle r={5} fill={GREEN} />
          <Ico I={Flag} x={-3.5} y={-3.5} s={7} color="#111" />
        </g>
        {run > 0 && !finished && <Arrow p={at.p} a={at.a} color={INK} />}

        {counting ? (
          <g transform={popAt([160, 96], easeOutBack((1 - frac((CC_RUN[0] - t) / 0.42)) * 2.5))}>
            <T x={160} y={112} anchor="middle" size={46} weight={800} color={A} mono>{count}</T>
          </g>
        ) : (
          <Panel x={112} y={8} w={96} h={40} r={8} stroke={aa(0.7)}>
            <T x={48} y={11} anchor="middle" size={5.5} color={MUTED} weight={700} spacing={1}>{tr("Time attack").toUpperCase()}</T>
            <T x={48} y={26} anchor="middle" size={14} weight={800} mono>{fmt(clock)}</T>
            <T x={48} y={35} anchor="middle" size={6.5} weight={800} color={delta <= 0 ? GREEN : RED} mono>
              {finished ? tr("Target 3:58 · -0:17") : `${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(1)}`}
            </T>
          </Panel>
        )}

        {/* Beaten: the setter's Spectre card */}
        {spectre > 0 && (
          <g opacity={spectre}>
            <rect width={VW} height={VH} fill="black" opacity={0.55} />
            <g transform={`translate(0 ${((1 - clamp01(rise)) * 26).toFixed(1)}) ${popAt([160, 97], 0.75 + 0.25 * clamp01(rise))}`}>
              <rect x={125} y={48} width={70} height={98} rx={7} fill={`url(#${id('metal')})`} />
              <g clipPath={`url(#${id('sp')})`}>
                <BikePhoto cx={160} floor={118} height={44} filter={`url(#${id('ghost')})`} opacity={0.85} />
                {[0, 1].map((k) => (
                  <ellipse key={k} cx={125 + 70 * frac(t * 0.12 + k * 0.5)} cy={112 + k * 14} rx={46} ry={12} fill="white" opacity={0.18} filter={`url(#${id('soft')})`} />
                ))}
                <rect x={125 - 70 + 140 * frac(t * 0.35)} y={40} width={22} height={120} fill="white" opacity={0.15} transform="rotate(18 160 97)" />
              </g>
              <rect x={125} y={48} width={70} height={98} rx={7} fill="none" stroke="#e5eaf0" strokeWidth={1.4} />
              <rect x={130} y={53} width={36} height={11} rx={5.5} fill="white" fillOpacity={0.12} stroke="white" strokeOpacity={0.35} />
              <Ico I={Ghost} x={133} y={55.5} s={6} color="#f1f5f9" />
              <T x={141} y={61} size={5} weight={800} color="#f1f5f9" spacing={0.6}>{tr("Spectre").toUpperCase()}</T>
              <T x={160} y={138} anchor="middle" size={9} weight={800} color="#f8fafc" mono>-0:17</T>
            </g>
          </g>
        )}
        <Chip
          x={VW - 8}
          y={175}
          right
          label={finished ? tr("3x Speed Demon + Spectre") : tr("Target 3:58")}
          I={finished ? Check : Timer}
          color={finished ? GREEN : A}
          tone={finished ? GREEN : undefined}
        />
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

export function TrackDayScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const lapT = loopT(t, TD_LAP);
  const f = lapT / TD_LAP;
  const at = TD_CIRCUIT.at(f);
  const sector = Math.min(2, Math.floor(f * 3));
  const lapTime = 92.418 * f;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  const board = loopT(t, TD_LAP * 2) < TD_LAP ? tr("PUSH") : tr("BOX");
  const sf = TD_CIRCUIT.at(0);

  return (
    <Frame>
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
        <T x={58} y={13} anchor="middle" size={6} color={MUTED} weight={700} spacing={1.5}>{tr("Lap {0}", [6])}</T>
        <T x={58} y={34} anchor="middle" size={17} weight={800} mono>{fmt(lapTime)}</T>
        <T x={58} y={46} anchor="middle" size={9} weight={800} color={GREEN} mono>−0.214</T>
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
      <Chip x={196} y={154} label={tr("Pit crew · live")} I={Users} />
      <Chip x={196} y={175} label={tr("Calls spoken in your helmet")} I={Sparkles} opacity={0.9} />
      <Vignette id={id} />
    </Frame>
  );
}
