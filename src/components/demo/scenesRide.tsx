import {
  AlertTriangle,
  Bell,
  Bike,
  Check,
  Clock,
  CloudLightning,
  CloudRain,
  Copy,
  CornerUpRight,
  Crown,
  Eye,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Ghost,
  Hand,
  Handshake,
  Lock,
  LockOpen,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  OctagonX,
  Pause,
  Play,
  Route as RouteIcon,
  Shield,
  Siren,
  ThumbsUp,
  Trophy,
  UserRound,
  Users,
  Vibrate,
  Wrench,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import type { SceneCueKind } from '@/lib/radioFx';
import { useSettings } from '@/features/settings';
import { HAZARD_CATEGORIES, HAZARD_TYPES } from '@/features/hazards';
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
  Dot,
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
  SKY,
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
  cycle,
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
} from '@/components/scene/kit';

/*
 * Demo slide scenes, part one: getting out and riding. Each is a short story
 * on the shared 320×200 scene canvas, in the app's own look, looping cleanly.
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
    /** A short distance ahead, in feet or metres. */
    ahead: (ft: number) =>
      km ? tr("{0} m", [Math.max(10, Math.round((ft * 0.3048) / 10) * 10)]) : tr("{0} ft", [Math.max(10, Math.round(ft / 10) * 10)]),
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
  { f: 0.72, I: Trophy, up: true },
  { f: 0.87, I: Shield, up: false },
];

const introF = (t: number) => 0.02 + 0.96 * easeInOut(t / 8.4);
const INTRO_CUES = cues([0.3, 'whoosh'], ...INTRO_STOPS.map((s): [number | null, SceneCueKind] => [timeAt(introF, s.f, 0, 8.4), 'tap']), [8.2, 'success']);

export function IntroScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), INTRO_P);
  const f = 0.02 + 0.96 * easeInOut(t / 8.4);
  const rider = INTRO_ROAD.at(f);
  const labels = [tr("Convoy"), tr("Voice"), tr("Routes"), tr("Tracking"), tr("Badges"), tr("Privacy")];
  const underline = easeInOut((t - 0.3) / 1.2);
  return (
    <Frame sound={{ t, cues: INTRO_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, INTRO_P)}>
        <T x={160} y={56} anchor="middle" size={30} weight={800} spacing={6}>BLACKTOP</T>
        <rect x={160 - 72 * underline} y={64} width={144 * underline} height={1.6} rx={0.8} style={{ fill: A }} />
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
        <Chip x={8} y={8} label={tr("No signup required")} I={Lock} opacity={easeOut((t - 8.2) / 0.5)} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Ride together: the lobby code and crew on the left, the convoy riding on the
// right; a rider drops back, the leader sends Regroup, the group closes up
// =============================================================================

const RT_P = 14;
const RT_ROAD = new Route([[136, 204], [150, 172], [176, 152], [204, 132], [222, 104], [246, 84], [278, 66], [298, 40], [320, 18]], false, 14);
const RT_STREETS = ['M128 118 L204 132', 'M232 170 L222 104', 'M312 124 L246 84', 'M160 60 L246 84'];
const RT_QR = Array.from({ length: 49 }, (_, i) => {
  const r = Math.floor(i / 7);
  const c = i % 7;
  const finder = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
  return finder || frac(Math.sin(i * 91.7 + 3.1) * 4375.5) > 0.5;
});

const RT_CUES: SceneCue[] = [[0.4, 'radioIn'], [1.3, 'tap'], [3.3, 'radioOut'], [6.3, 'ping'], [7.9, 'success']];

export function RideTogetherScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), RT_P);
  const members = [
    { name: tr("You"), color: A },
    { name: 'Marcus', color: INK },
    { name: 'Sarah', color: GREY },
    { name: 'Jake', color: DIM },
  ];
  const base = 0.14 + 0.6 * (t / RT_P);
  const lag = 0.13 * easeInOut((t - 5.6) / 2.4) * (1 - easeInOut((t - 9.4) / 2.6));
  const fs = [base, base - 0.055, base - 0.11, base - 0.165 - lag];
  const speaking = cycle(t, 1.7, 4);
  const behind = win(t, 6.3, 11.4, 0.4);
  const regroup = win(t, 6.9, 10.6, 0.35);
  const sent = t > 7.9;
  const copied = t > 1.3 && t < 3.2;

  return (
    <Frame sound={{ t, cues: RT_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, RT_P)}>
        {/* The convoy on the road */}
        {RT_STREETS.map((d, i) => <Road key={i} d={d} w={3.5} />)}
        <Road d={RT_ROAD.d} w={7} />
        <path d={RT_ROAD.slice(fs[3], fs[0] + 0.25, 40)} fill="none" style={{ stroke: A }} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
        {fs
          .map((f, i) => ({ f, i, at: RT_ROAD.at(f) }))
          .reverse()
          .map(({ i, at }) =>
            i === 0 ? (
              <Arrow key={i} p={at.p} a={at.a} color={A} glow={id('glow')} />
            ) : (
              <Dot key={i} p={at.p} color={members[i].color} r={3.8} halo={speaking === i ? 1 : 0} haloColor={members[i].color} />
            ),
          )}
        {behind > 0 && (
          <g opacity={behind}>
            <Rings p={RT_ROAD.at(fs[3]).p} phase={frac(t * 0.8)} color={AMBER} max={14} />
          </g>
        )}

        {/* Convoy status strip */}
        <Panel x={128} y={8} w={184} h={18} r={5}>
          <Ico I={Users} x={6} y={4.5} s={9} />
          <T x={18} y={12}>4</T>
          <Ico I={Gauge} x={34} y={4.5} s={9} />
          <T x={46} y={12} mono>{`${u.speed(52)} ${u.speedLabel}`}</T>
          <Ico I={Clock} x={96} y={4.5} s={9} />
          <T x={108} y={12} mono>{tr("ETA {0}", ['14:32'])}</T>
        </Panel>
        <Chip x={128} y={30} label={tr("1 rider behind")} I={AlertTriangle} color={AMBER} tone={AMBER} opacity={behind} />

        {/* Leader's regroup card */}
        <Panel x={184} y={152} w={128} h={40} opacity={regroup} stroke={sent ? aa(0.6) : LINE}>
          <Ico I={Flag} x={8} y={8} s={10} />
          <T x={23} y={16} weight={700}>{sent ? tr("Regroup sent") : tr("Riders dropped back")}</T>
          <T x={8} y={31} size={6.5} color={MUTED}>{sent ? tr("The whole convoy sees it") : tr("Tap to call a regroup")}</T>
        </Panel>

        {/* The lobby: code, QR, crew */}
        <Panel x={8} y={8} w={112} h={184}>
          <T x={9} y={15} size={6} color={MUTED} weight={700} spacing={1}>{tr("Convoy Code").toUpperCase()}</T>
          <T x={9} y={35} size={16} weight={800} spacing={1.5} mono>XK7M9P</T>
          <g transform="translate(92 24)">
            <rect width={14} height={14} rx={4} style={{ fill: copied ? A : '#1c1c22' }} />
            <Ico I={copied ? Check : Copy} x={3} y={3} s={8} color={copied ? '#111' : MUTED} />
          </g>
          <g transform="translate(9 44)">
            <rect width={34} height={34} rx={3} fill="#f4f4f5" />
            {RT_QR.map((on, i) =>
              on ? <rect key={i} x={2.5 + (i % 7) * 4.1} y={2.5 + Math.floor(i / 7) * 4.1} width={4.1} height={4.1} fill="#111" /> : null,
            )}
          </g>
          <T x={50} y={56} size={6.5} color={MUTED}>{tr("Scan to join")}</T>
          <T x={50} y={68} size={6.5} color={MUTED}>{tr("or share the code")}</T>
          <T x={9} y={94} size={6} color={MUTED} weight={700} spacing={1}>{tr("Members (4/8)").toUpperCase()}</T>
          {members.map((m, i) => {
            const y = 100 + i * 21;
            const on = speaking === i;
            return (
              <g key={i} transform={`translate(4 ${y})`}>
                <rect width={104} height={17} rx={5} fill={on ? aa(0.12) : 'transparent'} stroke={on ? aa(0.5) : 'transparent'} strokeWidth={0.8} />
                <circle cx={10} cy={8.5} r={4.2} style={{ fill: m.color }} />
                {i === 0 && <Ico I={Crown} x={17} y={4} s={8} />}
                <T x={i === 0 ? 28 : 19} y={11.4} color={i === 0 ? A : INK}>{m.name}</T>
                <g transform="translate(84 0)">
                  <Wave on={on ? 1 : 0} t={t} n={5} />
                </g>
              </g>
            );
          })}
        </Panel>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Nearby riders: opt-in radar, a handshake, pair up, then two convoys merge
// =============================================================================

const NB_P = 12;
const NB_ME: Pt = [118, 110];

const NB_CUES: SceneCue[] = [[1.1, 'ping'], [4.2, 'ping'], [5.5, 'tap'], [5.7, 'success'], [6.5, 'radioIn'], [8.1, 'whoosh'], [8.7, 'success']];

export function NearbyScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), NB_P);
  const list = win(t, 1.1, 4.2, 0.35);
  const request = win(t, 4.2, 6.6, 0.3);
  const accepted = t > 5.5;
  const paired = easeInOut((t - 5.6) / 1.2);
  const merged = easeInOut((t - 8.1) / 1.3);
  const ben: Pt = [NB_ME[0] + 52 * Math.cos(0.8 + t * 0.12), NB_ME[1] + 34 * Math.sin(0.8 + t * 0.12)];
  const anaFrom: Pt = [62, 52];
  const ana: Pt = [lerp(anaFrom[0], NB_ME[0] - 16, paired), lerp(anaFrom[1], NB_ME[1] - 12, paired)];
  const eve: Pt[] = [
    [236, 150],
    [248, 160],
    [228, 164],
  ].map(([x, y], i) => [lerp(x, NB_ME[0] + 18 + i * 9, merged), lerp(y, NB_ME[1] + 16 + (i % 2) * 8, merged)] as Pt);
  const merge = win(t, 8.6, 11.6, 0.3);

  return (
    <Frame sound={{ t, cues: NB_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, NB_P)}>
        <Road d="M-10 150 C 60 140, 100 118, 160 112 S 260 80, 330 60" w={6} />
        <Road d="M96 210 C 104 160, 112 130, 118 110 S 130 40, 136 -10" w={4} />
        <Road d="M200 210 L236 150 L320 132" w={3.5} />
        {/* The nearby ring: a faint dashed outline */}
        <circle cx={NB_ME[0]} cy={NB_ME[1]} r={70} fill="none" style={{ stroke: A }} strokeOpacity={0.3} strokeDasharray="3 4" />
        <Dot p={ben} color={GREY} r={3.6} />
        <Dot p={ana} color={accepted ? A : INK} r={3.6} halo={accepted ? 0.6 : 0} />
        {eve.map((p, i) => <Dot key={i} p={p} color={merged > 0.5 ? A : DIM} r={3.4} />)}
        {paired > 0 && <line x1={ana[0]} y1={ana[1]} x2={NB_ME[0]} y2={NB_ME[1]} style={{ stroke: A }} strokeOpacity={0.6 * paired} strokeWidth={1.2} strokeDasharray="2 2" />}
        <Dot p={NB_ME} color={A} r={4.6} halo={0.5 + 0.5 * Math.sin(t * 3)} />

        {/* Handshake button with how many riders are close */}
        <g transform="translate(290 26)">
          <circle r={13} fill={PANEL} style={{ stroke: A }} strokeWidth={1} />
          {request > 0 && (
            <circle r={13} fill="none" style={{ stroke: A }} strokeWidth={2} strokeDasharray={`${81.7 * (1 - clamp01((t - 4.2) / 2.4))} 82`} transform="rotate(-90)" />
          )}
          <Ico I={Handshake} x={-6.5} y={-6.5} s={13} />
          <circle cx={10} cy={-10} r={6} style={{ fill: A }} />
          <T x={10} y={-7.6} anchor="middle" size={7} color="#111" weight={800}>{merged > 0.5 ? '1' : '3'}</T>
        </g>

        {/* Riders and convoys nearby */}
        <Panel x={164} y={44} w={148} h={56} opacity={list}>
          {[
            { I: UserRound, name: 'Ben', sub: tr("400 ft"), cta: tr("Invite") },
            { I: Users, name: tr("Eve's convoy"), sub: tr("0.6 mi · 3 riders"), cta: tr("Merge") },
          ].map((r, i) => (
            <g key={i} transform={`translate(6 ${6 + i * 24})`}>
              <circle cx={8} cy={8} r={8} style={{ fill: aa(0.14) }} />
              <Ico I={r.I} x={3.5} y={3.5} s={9} />
              <T x={21} y={7}>{r.name}</T>
              <T x={21} y={16} size={6.2} color={MUTED}>{r.sub}</T>
              <rect x={136 - 6 - 8 - textW(r.cta, 6.8)} y={1} width={textW(r.cta, 6.8) + 10} height={14} rx={4} style={{ fill: A }} />
              <T x={136 - 9 - textW(r.cta, 6.8) / 2} y={10.6} anchor="middle" size={6.8} color="#111" weight={700}>{r.cta}</T>
            </g>
          ))}
        </Panel>

        {/* Ana's handshake */}
        <Panel x={150} y={148} w={162} h={44} opacity={request} stroke={aa(0.7)}>
          <T x={8} y={14} weight={700}>{tr("Ana wants to ride together")}</T>
          <rect x={8} y={22} width={70} height={15} rx={4} fill={accepted ? A : INK} />
          <T x={43} y={32} anchor="middle" size={7} color="#111" weight={700}>{tr("Accept")}</T>
          <rect x={84} y={22} width={70} height={15} rx={4} fill="#1f1f25" />
          <T x={119} y={32} anchor="middle" size={7} weight={700}>{tr("Decline")}</T>
        </Panel>

        <Chip x={8} y={8} label={tr("Paired up · voice on")} I={Mic} opacity={win(t, 6.5, 8.6, 0.3)} extra={16}>
          <Wave on={1} t={t} n={4} />
        </Chip>
        <Chip x={8} y={8} label={tr("Convoys merged · 5 riders")} I={Users} opacity={merge} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Pillion: the passenger's own screen, a "need a stop" buzz and a wave
// =============================================================================

const PL_P = 12;
const PL_ROAD = new Route([[172, 204], [186, 160], [214, 130], [240, 96], [268, 70], [292, 36], [316, 8]], false, 14);

const PL_CUES: SceneCue[] = [[1.4, 'radioIn'], [4.3, 'radioOut'], [5.8, 'tap'], [5.9, 'ping'], [8.8, 'whoosh']];

export function PillionScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), PL_P);
  const talking = win(t, 1.4, 4.4, 0.25);
  const stop = win(t, 5.8, 8.4, 0.3);
  const wave = win(t, 8.8, 11.2, 0.3);
  const f = 0.2 + 0.5 * (t / PL_P);
  const bike = PL_ROAD.at(f);
  const others = [PL_ROAD.at(f + 0.1), PL_ROAD.at(f + 0.2)];
  const reactions: Icon[] = [ThumbsUp, Flame, OctagonX, Fuel];

  return (
    <Frame sound={{ t, cues: PL_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, PL_P)}>
        {/* The convoy the pillion rides in */}
        <Road d="M150 20 L240 96 L320 120" w={3.5} />
        <Road d={PL_ROAD.d} w={7} />
        {others.map((o, i) => <Dot key={i} p={o.p} color={i ? GREY : INK} r={3.8} halo={stop > 0.5 ? 1 : 0} haloColor={AMBER} />)}
        {stop > 0 && others.map((o, i) => (
          <g key={i} opacity={stop} transform={`translate(${o.p[0] + 8} ${o.p[1] - 16})`}>
            <rect width={14} height={12} rx={3} fill={PANEL} stroke={AMBER} strokeWidth={0.8} />
            <Ico I={Bell} x={3} y={2} s={8} color={AMBER} />
          </g>
        ))}
        {stop > 0 && <g opacity={stop}><Rings p={bike.p} phase={frac(t * 1.1)} color={AMBER} max={30} /></g>}
        {wave > 0 && [0, 1, 2].map((k) => {
          const q = frac((t - 8.8) * 0.7 + k / 3);
          return (
            <g key={k} opacity={wave * (1 - q)} transform={`translate(${bike.p[0] + 6 + k * 6} ${bike.p[1] - 10 - q * 30})`}>
              <Ico I={Hand} x={-5} y={-5} s={10} />
            </g>
          );
        })}
        <Arrow p={bike.p} a={bike.a} color={A} glow={id('glow')} />
        <Chip x={VW - 8} y={8} right label={tr("Passenger needs a stop")} I={OctagonX} color={AMBER} tone={AMBER} opacity={stop} />

        {/* The passenger's screen */}
        <Panel x={8} y={8} w={134} h={184}>
          <rect x={6} y={6} width={122} height={18} rx={5} fill="#141418" />
          <g transform="translate(9 9)">
            <Ico I={Bike} x={4} y={2.5} s={8} color={MUTED} />
            <T x={15} y={9} size={6.5} color={MUTED}>{tr("Operator")}</T>
          </g>
          <rect x={67} y={8} width={59} height={14} rx={4} style={{ fill: A }} />
          <Ico I={UserRound} x={71} y={11} s={8} color="#111" />
          <T x={82} y={18} size={6.5} color="#111" weight={700}>{tr("Passenger")}</T>

          <g transform="translate(67 62)">
            {talking > 0 && <circle r={30 + talking * 3} style={{ fill: aa(0.12 * talking) }} />}
            <circle r={24} style={{ fill: talking > 0.5 ? A : aa(0.14), stroke: A }} strokeWidth={1.4} />
            <Ico I={talking > 0.5 ? Mic : MicOff} x={-9} y={-9} s={18} color={talking > 0.5 ? '#111' : A} />
          </g>
          <T x={67} y={100} anchor="middle" size={6.5} color={MUTED}>{talking > 0.5 ? tr("Talking") : tr("Muted · tap to talk")}</T>

          <rect x={10} y={108} width={114} height={18} rx={5} fill={wave > 0.5 ? A : INK} />
          <Ico I={Hand} x={44} y={112.5} s={9} color="#111" />
          <T x={56} y={120} size={7.5} color="#111" weight={700}>{tr("Wave")}</T>

          {reactions.map((I, i) => {
            const on = i === 2 && stop > 0.5;
            return (
              <g key={i} transform={`translate(${10 + i * 29.3} 131)`}>
                <rect width={25} height={22} rx={5} fill={on ? AMBER : '#141418'} stroke={on ? AMBER : LINE} strokeWidth={0.8} />
                <Ico I={I} x={7.5} y={6} s={10} color={on ? '#111' : INK} />
              </g>
            );
          })}

          <rect x={10} y={160} width={114} height={17} rx={5} fill="none" stroke={RED} strokeOpacity={0.7} strokeWidth={1.1} />
          <Ico I={AlertTriangle} x={30} y={164} s={9} color={RED} />
          <T x={42} y={171.5} size={7} color={RED} weight={700}>{tr("Request rescue")}</T>
        </Panel>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Navigation: turn-by-turn on the map, a camera warning, a drier line offer,
// stops dropping off the plan
// =============================================================================

const NV_P = 14;
const NV_ROUTE = new Route([[44, 204], [48, 176], [62, 156], [104, 150], [146, 138], [170, 110], [186, 84], [226, 76], [262, 62], [288, 38]], false, 16);
const NV_ALT = 'M186 84 C 184 58, 200 40, 232 32 S 282 30, 288 38';
const NV_STREETS = [
  'M-10 150 L62 156',
  'M104 150 L118 210',
  'M146 138 L140 70 L186 84',
  'M170 110 L262 128 L330 116',
  'M226 76 L232 -10',
  'M262 62 L330 70',
];
const NV_TURNS = [
  { f: 0.1, text: () => tr("Turn right onto Ridge Road"), I: CornerUpRight },
  { f: 0.46, text: () => tr("Bear left onto Mill Lane"), I: CornerUpRight },
  { f: 0.99, text: () => tr("Arrive at Sunset Point"), I: MapPin },
];
const NV_CAMERA_F = 0.3;
const NV_STOPS = [0.62];

const navF = (t: number) => 0.02 + 0.93 * easeInOut(t / 13.2);
const NV_CUES = cues(
  [timeAt(navF, NV_TURNS[0].f, 0, 13.2), 'beep'],
  [timeAt(navF, NV_CAMERA_F - 0.08, 0, 13.2), 'camera'],
  [timeAt(navF, NV_TURNS[1].f, 0, 13.2), 'beep'],
  [6.8, 'ping'],
  [timeAt(navF, NV_STOPS[0], 0, 13.2), 'tap'],
  [13, 'success'],
);

export function NavigationScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), NV_P);
  const f = 0.02 + 0.93 * easeInOut(t / 13.2);
  const rider = NV_ROUTE.at(f);
  const next = NV_TURNS.find((m) => m.f > f) ?? NV_TURNS[NV_TURNS.length - 1];
  const feet = Math.max(0, (next.f - f) * 9400);
  const cam = NV_ROUTE.at(NV_CAMERA_F).p;
  const camOn = f > NV_CAMERA_F - 0.08 && f < NV_CAMERA_F + 0.01 ? 1 : 0;
  const rain = win(t, 6.8, 10.4, 0.35);
  const mph = 38 + 18 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
  const stopsLeft = NV_STOPS.filter((s) => s > f).length;

  return (
    <Frame sound={{ t, cues: NV_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, NV_P)}>
        {NV_STREETS.map((d, i) => <Road key={i} d={d} w={3.5} />)}
        <Road d={NV_ROUTE.d} w={6} />
        {/* Rain radar over the later part of the route, and the drier line */}
        <ellipse cx={244 + Math.sin(t * 0.4) * 6} cy={80} rx={46} ry={30} fill={SKY} opacity={0.14} filter={`url(#${id('soft')})`} />
        <ellipse cx={248 + Math.sin(t * 0.4) * 6} cy={78} rx={24} ry={15} fill={SKY} opacity={0.14} filter={`url(#${id('soft')})`} />
        {rain > 0 && <path d={NV_ALT} fill="none" stroke="white" strokeOpacity={0.7 * rain} strokeWidth={1.6} strokeDasharray="3 3" />}
        <path d={NV_ROUTE.slice(f, 1, 70)} fill="none" style={{ stroke: A }} strokeWidth={3} strokeLinecap="round" />
        {/* Stops still on the plan */}
        {NV_STOPS.map((s, i) => s > f && (
          <g key={i} transform={`translate(${NV_ROUTE.at(s).p[0]} ${NV_ROUTE.at(s).p[1]})`}>
            <circle r={4.5} fill={BG} stroke="white" strokeWidth={1.2} />
            <T x={0} y={2.3} anchor="middle" size={5.5} weight={800}>1</T>
          </g>
        ))}
        {/* Speed camera on the route */}
        <g transform={`translate(${cam[0]} ${cam[1]})`}>
          {camOn > 0 && <Rings p={[0, 0]} phase={frac(t * 1.3)} color={RED} max={16} />}
          <circle r={6} fill={BG} stroke={RED} strokeWidth={1} />
          <Ico I={Eye} x={-3.8} y={-3.8} s={7.6} color={RED} />
        </g>
        <g transform={`translate(${NV_ROUTE.at(1).p[0] - 6} ${NV_ROUTE.at(1).p[1] - 13})`}>
          <Ico I={MapPin} x={0} y={0} s={12} />
        </g>
        <Arrow p={rider.p} a={rider.a} color={A} glow={id('glow')} />

        {/* Turn banner in the search bar's place */}
        <Panel x={8} y={8} w={304} h={28} r={7} stroke={aa(0.7)}>
          <rect x={4} y={4} width={20} height={20} rx={5} style={{ fill: A }} />
          <Ico I={next.I} x={8} y={8} s={12} color="#111" />
          <T x={30} y={14} size={10} weight={800} mono>{next === NV_TURNS[NV_TURNS.length - 1] && feet < 60 ? tr("Now") : u.ahead(feet)}</T>
          <T x={30} y={24} size={7}>{next.text()}</T>
          <T x={298} y={18} anchor="end" size={6.5} color={MUTED}>{tr("ETA {0}", ['14:32'])}</T>
        </Panel>
        <Chip x={VW - 8} y={40} right label={tr("Speed camera ahead")} I={Eye} color={RED} tone={RED} opacity={camOn} />
        <Chip x={VW - 8} y={40} right label={tr("Rain on your route · drier line?")} I={CloudRain} color={SKY} tone={SKY} opacity={rain * (1 - camOn)} />

        {/* Speed card and the stops on the plan */}
        <Panel x={8} y={164} w={58} h={28} r={7}>
          <T x={29} y={17} anchor="middle" size={14} weight={800} mono>{u.speed(mph)}</T>
          <T x={29} y={25} anchor="middle" size={5.5} color={MUTED}>{u.speedLabel}</T>
        </Panel>
        <Chip x={VW - 8} y={175} right label={stopsLeft ? tr("Fuel stop next") : tr("Straight to Sunset Point")} I={stopsLeft ? Fuel : MapPin} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Hazards: two taps to report an oil spill; the next rider is warned ahead and
// asked "still there?" after passing
// =============================================================================

const HZ_P = 14;
const HZ_ROAD = new Route([[150, 214], [146, 170], [158, 130], [178, 96], [184, 60], [172, 20], [166, -16]], false, 16);
const HZ_AT = 0.42;

const HZ_CUES: SceneCue[] = [[1.1, 'tap'], [2.2, 'tap'], [3.8, 'tap'], [4.6, 'success'], [7, 'caution'], [11, 'ping'], [12.2, 'tap']];

export function HazardScene() {
  const id = useIds();
  const u = useUnits();
  const t = loopT(useSceneTime(0), HZ_P);
  const surface = HAZARD_CATEGORIES.find((c) => c.id === 'surface') ?? HAZARD_CATEGORIES[0];
  const oil = HAZARD_TYPES.find((h) => h.kind === 'oil') ?? HAZARD_TYPES[0];
  const picker = win(t, 1.6, 4.6, 0.3);
  const pickedCat = t > 2.6;
  const pickedKind = t > 3.8;
  const dropped = t > 4.6;
  // Rider A reports; rider B comes along later.
  const fA = t < 4.6 ? 0.12 + 0.3 * easeOut(t / 1.6) : 0.42 + 0.6 * easeInOut((t - 4.6) / 2.6);
  const fB = 0.02 + 0.98 * easeInOut((t - 6.6) / 6.4);
  const riderA = HZ_ROAD.at(fA);
  const riderB = HZ_ROAD.at(fB);
  const pin = HZ_ROAD.at(HZ_AT).p;
  const pinK = easeOutBack((t - 4.6) / 0.5);
  const toGo = Math.max(0, (HZ_AT - fB) * 3400);
  const warn = t > 7 && fB < HZ_AT ? 1 : 0;
  const ask = win(t, 11, 13.6, 0.3);
  const said = t > 12.2;

  return (
    <Frame sound={{ t, cues: HZ_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, HZ_P)}>
        <Road d="M-10 130 L158 130 L330 150" w={3.5} />
        <Road d="M184 60 L330 40" w={3.5} />
        <Road d={HZ_ROAD.d} w={7} />
        {dropped && (
          <g transform={popAt(pin, pinK)}>
            {warn > 0 && <Rings p={pin} phase={frac(t)} color={surface.color} max={18} />}
            <g transform={`translate(${pin[0] - 8} ${pin[1] - 21})`}>
              <path d="M2 0 H14 A2 2 0 0 1 16 2 V13 A2 2 0 0 1 14 15 H11 L8 19 L5 15 H2 A2 2 0 0 1 0 13 V2 A2 2 0 0 1 2 0 Z" fill={surface.color} stroke="rgba(0,0,0,0.85)" strokeWidth={0.8} />
              <Ico I={oil.icon} x={3} y={2.5} s={10} color="#fff" sw={2.4} />
            </g>
          </g>
        )}
        {t < 7.4 && <Arrow p={riderA.p} a={riderA.a} color={A} glow={id('glow')} />}
        {t > 6.6 && <Arrow p={riderB.p} a={riderB.a} color={INK} />}

        {/* Report button, bottom left */}
        <g transform="translate(22 176)">
          <circle r={12} fill={PANEL} style={{ stroke: A }} strokeWidth={1} />
          {t > 1.1 && t < 1.8 && <circle r={12 + (t - 1.1) * 18} fill="none" style={{ stroke: A }} opacity={1 - (t - 1.1) / 0.7} />}
          <Ico I={Megaphone} x={-6} y={-6} s={12} />
        </g>

        {/* The two-step picker */}
        <Panel x={40} y={34} w={240} h={112} opacity={picker} r={10}>
          <T x={12} y={16} weight={700}>{pickedCat ? surface.label : tr("Report a hazard")}</T>
          {!pickedCat
            ? HAZARD_CATEGORIES.map((c, i) => {
                const x = 12 + (i % 2) * 110;
                const y = 24 + Math.floor(i / 2) * 42;
                const on = i === 0 && t > 2.2;
                return (
                  <g key={c.id} transform={`translate(${x} ${y})`}>
                    <rect width={104} height={36} rx={8} fill={c.color} fillOpacity={on ? 0.35 : 0.12} stroke={c.color} strokeOpacity={on ? 1 : 0.6} strokeWidth={1.2} />
                    <rect x={8} y={9} width={18} height={18} rx={5} fill={c.color} />
                    <Ico I={c.icon} x={12} y={13} s={10} color="#fff" />
                    <T x={32} y={21.5} size={fit(c.label, 66, 7.5)} weight={700}>{c.label}</T>
                  </g>
                );
              })
            : HAZARD_TYPES.filter((h) => h.category === 'surface').slice(0, 4).map((h, i) => {
                const on = h.kind === 'oil' && pickedKind;
                return (
                  <g key={h.kind} transform={`translate(${12 + (i % 2) * 110} ${24 + Math.floor(i / 2) * 42})`}>
                    <rect width={104} height={36} rx={8} fill={surface.color} fillOpacity={on ? 0.35 : 0.1} stroke={surface.color} strokeOpacity={on ? 1 : 0.45} strokeWidth={1.2} />
                    <Ico I={h.icon} x={8} y={13} s={10} color={surface.color} />
                    <T x={22} y={21.5} size={fit(h.label, 78)} weight={700}>{h.label}</T>
                  </g>
                );
              })}
        </Panel>

        {/* Rider B: warned ahead, then asked */}
        <Panel x={8} y={8} w={304} h={26} r={7} opacity={warn} stroke={surface.color}>
          <rect x={4} y={4} width={18} height={18} rx={5} fill={surface.color} />
          <Ico I={oil.icon} x={8} y={8} s={10} color="#fff" />
          <T x={28} y={12} weight={800}>{oil.label}</T>
          <T x={28} y={21} size={6.5} color={MUTED}>{tr("{0} ahead", [u.ahead(toGo)])}</T>
        </Panel>
        <Panel x={70} y={140} w={180} h={50} opacity={ask} r={9}>
          <T x={90} y={15} anchor="middle" weight={700}>{tr("{0}: still there?", [oil.label])}</T>
          <rect x={10} y={24} width={76} height={18} rx={5} style={{ fill: A }} />
          <T x={48} y={35.5} anchor="middle" size={7.5} color="#111" weight={800}>{said ? '✓' : tr("Yes")}</T>
          <rect x={94} y={24} width={76} height={18} rx={5} fill="none" stroke="white" strokeOpacity={0.25} />
          <T x={132} y={35.5} anchor="middle" size={7.5} weight={800}>{tr("Gone")}</T>
        </Panel>
        <Chip x={8} y={8} label={tr("Reported · riders heading this way are warned")} I={Check} color={GREEN} opacity={win(t, 4.7, 6.8, 0.3)} />
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
// Safety net, in two acts. First an impact and a stop: the check-in times out,
// rescue goes to everyone the rider chose, and a mate routes to them. Then,
// parked up, the anti-theft alarm: the first tap on the lock sets the pattern,
// it arms, a nudge warns, a push counts down to the siren, and only the pattern
// stops it (the ride stays paused until play).
// =============================================================================

const SF_P = 14;
const AL_P = 12;
const SF_ROAD = new Route([[-10, 60], [60, 70], [120, 58], [170, 80], [214, 74], [260, 52], [330, 60]], false, 14);
const SF_IMPACT_F = 0.62;
const SF_HELP = new Route([[40, 196], [52, 164], [90, 150], [140, 132], [182, 110], [206, 84], [SF_ROAD.at(SF_IMPACT_F).p[0], SF_ROAD.at(SF_IMPACT_F).p[1] + 4]], false, 12);

/** Rescue: the hit, the check-in, rescue out with the siren, a mate on the way. Then the alarm act. */
const SF_CUES: SceneCue[] = [
  [3, 'impact'],
  [3.4, 'caution'],
  [6.7, 'radioIn'],
  [6.9, 'siren'],
  [8.4, 'siren'],
  [9.8, 'ping'],
  ...([
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
  ] as SceneCue[]).map(([at, kind]): SceneCue => [SF_P + at, kind]),
];

export function SafetyScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), SF_P + AL_P);
  return (
    <Frame sound={{ t, cues: SF_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      {t < SF_P ? <RescueAct t={t} id={id} /> : <AlarmAct t={t - SF_P} id={id} />}
      <Vignette id={id} />
    </Frame>
  );
}

function RescueAct({ t, id }: { t: number; id: (n: string) => string }) {
  const fJake = Math.min(SF_IMPACT_F, 0.1 + 0.52 * easeOut(t / 3));
  const jake = SF_ROAD.at(fJake);
  const impact = t > 3;
  const flash = win(t, 3, 3.9, 0.15);
  const check = win(t, 3.4, 6.7, 0.3);
  const countdown = Math.max(0, 300 - Math.floor(clamp01((t - 3.4) / 3.2) * 300));
  const sent = t > 6.6;
  const reach = [
    { I: Users, label: tr("Convoy"), at: [38, 108] as Pt, k: 6.8 },
    { I: Shield, label: tr("Crew"), at: [150, 24] as Pt, k: 7.1 },
    { I: MessageSquare, label: 'Discord', at: [282, 108] as Pt, k: 7.4 },
    { I: Handshake, label: tr("Riders nearby"), at: [236, 150] as Pt, k: 7.7 },
  ];
  const card = win(t, 8.6, 13.4, 0.3);
  const coming = t > 9.8;
  const fHelp = easeInOut((t - 9.9) / 3.6);
  const helper = SF_HELP.at(fHelp);
  const gHist = Array.from({ length: 40 }, (_, i) => {
    const s = (i / 39) * Math.min(t, 6);
    return s > 2.9 && s < 3.15 ? 4.2 : 1 + 0.12 * Math.sin(s * 9) + (s > 3.15 ? -0.9 * clamp01((s - 3.15) / 0.4) : 0);
  });

  return (
    <g opacity={loopFade(t, SF_P)}>
      <Road d="M40 210 L52 164 L90 150 L140 132 L182 110 L206 84" w={4} />
      <Road d={SF_ROAD.d} w={7} />
      {coming && <path d={SF_HELP.slice(fHelp, 1, 40)} fill="none" style={{ stroke: BURN }} strokeWidth={3} strokeLinecap="round" />}
      {sent &&
        reach.map((r, i) => {
          const k = easeOutBack((t - r.k) / 0.4);
          return (
            <g key={i} opacity={clamp01(k) * (1 - card * 0.6)}>
              <line x1={jake.p[0]} y1={jake.p[1]} x2={r.at[0]} y2={r.at[1]} stroke={RED} strokeOpacity={0.35} strokeDasharray="2 3" />
              <g transform={popAt(r.at, k)}>
                <circle cx={r.at[0]} cy={r.at[1]} r={10} fill={PANEL} stroke={RED} strokeWidth={1} />
                <Ico I={r.I} x={r.at[0] - 5} y={r.at[1] - 5} s={10} color={RED} />
                <T x={r.at[0]} y={r.at[1] + 19} anchor="middle" size={6} color={MUTED}>{r.label}</T>
              </g>
            </g>
          );
        })}
      {sent && <Rings p={jake.p} phase={frac(t * 0.9)} color={RED} max={34} count={3} />}
      {flash > 0 && <circle cx={jake.p[0]} cy={jake.p[1]} r={8 + flash * 16} fill={RED} opacity={0.35 * flash} />}
      <Arrow p={jake.p} a={jake.a} color={impact ? RED : INK} />
      {coming && <Arrow p={helper.p} a={helper.a} color={A} glow={id('glow')} />}

      {/* G trace: the hit */}
      <Panel x={8} y={8} w={92} h={34} r={6}>
        <T x={6} y={10} size={5.8} color={MUTED}>{tr("G-force")}</T>
        <polyline
          points={gHist.map((g, i) => `${(6 + i * 2.05).toFixed(1)},${(29 - Math.min(g, 4.4) * 4).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={impact ? RED : GREY}
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      </Panel>

      {/* Are you OK? */}
      <Panel x={84} y={60} w={152} h={62} opacity={check} r={9} stroke={RED}>
        <g transform="translate(22 24)">
          <circle r={13} fill="none" stroke="white" strokeOpacity={0.12} strokeWidth={3} />
          <circle r={13} fill="none" stroke={RED} strokeWidth={3} strokeDasharray={`${81.7 * (countdown / 300)} 82`} transform="rotate(-90)" />
          <T x={0} y={2.8} anchor="middle" size={7} weight={800} mono>{`${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`}</T>
        </g>
        <T x={42} y={17} weight={800}>{tr("Crash detected")}</T>
        <T x={42} y={27} size={6.5} color={MUTED}>{tr("Are you OK?")}</T>
        <rect x={42} y={36} width={48} height={16} rx={5} fill={INK} />
        <T x={66} y={46.5} anchor="middle" size={7} color="#111" weight={700}>{tr("I'm OK")}</T>
        <rect x={96} y={36} width={48} height={16} rx={5} fill={RED} />
        <T x={120} y={46.5} anchor="middle" size={7} color="#fff" weight={700}>{tr("Send rescue")}</T>
      </Panel>
      <Chip x={VW - 8} y={8} right label={tr("Rescue sent")} I={AlertTriangle} color={RED} tone={RED} opacity={win(t, 6.7, 8.8, 0.3)} />
      {/* Auto-rescue sounds the siren so people nearby notice */}
      <Chip x={8} y={48} label={tr("Siren on")} I={Siren} color={RED} tone={RED} extra={19} opacity={win(t, 6.9, 13.4, 0.3)}>
        <g transform="translate(9 0)">
          <Wave on={1} t={t} color={RED} n={4} />
        </g>
      </Chip>

      {/* A mate gets the call */}
      <Panel x={176} y={146} w={136} h={46} opacity={card} r={9} stroke={RED}>
        <circle cx={16} cy={16} r={9} fill={DIM} />
        <T x={16} y={19} anchor="middle" size={8} weight={800}>J</T>
        <T x={30} y={14} weight={800} color={RED}>{tr("Jake needs rescue!")}</T>
        <T x={30} y={23} size={6.2} color={MUTED}>{tr("Location shared • 2.4 mi away")}</T>
        <rect x={8} y={29} width={120} height={12} rx={4} fill={coming ? BURN : '#1f1f25'} />
        <T x={68} y={37.6} anchor="middle" size={6.5} weight={700} color={coming ? '#111' : INK}>{tr("I'm on my way")}</T>
      </Panel>
    </g>
  );
}

// ---- Act two: the anti-theft alarm --------------------------------------------

/** The phone on the bars, shown big beside the bike. */
const AL_PHONE = { x: 204, y: 8, w: 100, h: 184 };
const AL_SCREEN = { x: AL_PHONE.x + 4, y: AL_PHONE.y + 4, w: AL_PHONE.w - 8, h: AL_PHONE.h - 8 };
const AL_CX = AL_PHONE.x + AL_PHONE.w / 2;
const AL_LOCK: Pt = [AL_CX, 52];
/** The ride screen's lock: below the stats, above the row of controls. */
const AL_BTN: Pt = [AL_CX, 130];
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
            <circle cx={AL_BTN[0]} cy={AL_BTN[1]} r={9} fill="#1c1c22" />
            <Ico I={Lock} x={AL_BTN[0] - 4.5} y={AL_BTN[1] - 4.5} s={9} color={RED} />
            {[
              { I: paused ? Play : Pause, color: A, fill: paused ? aa(0.2) : '#1c1c22' },
              { I: AlertTriangle, color: AMBER, fill: '#1c1c22' },
              { I: Navigation, color: GREY, fill: '#1c1c22' },
            ].map((b, i) => (
              <g key={i}>
                <circle cx={AL_CX + (i - 1) * 26} cy={160} r={9.5} fill={b.fill} />
                <Ico I={b.I} x={AL_CX + (i - 1) * 26 - 4.5} y={155.5} s={9} color={b.color} />
              </g>
            ))}
            {t < 1.3 && t > 0.8 && (
              <circle cx={AL_BTN[0]} cy={AL_BTN[1]} r={9 + ((t - 0.8) / 0.5) * 16} fill="none" stroke={RED} strokeWidth={1.2} opacity={0.7 * (1 - (t - 0.8) / 0.5)} />
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
              <Ico I={Lock} x={AL_LOCK[0] - 13} y={AL_LOCK[1] - 13} s={26} color={RED} sw={1.8} />
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
      <Chip x={8} y={46} label={tr("Alarm armed")} I={Lock} color={RED} extra={5} opacity={win(t, 3.95, 4.62, 0.2)} />
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

// =============================================================================
// Notifications: the lock screen fills with what matters, app closed
// =============================================================================

const NT_P = 12;
const NT_ITEMS: { I: Icon; color: string; title: () => string; body: () => string; when: () => string }[] = [
  { I: AlertTriangle, color: RED, title: () => tr("Rico needs rescue"), body: () => tr("Tap to see where they are."), when: () => tr("now") },
  { I: CloudLightning, color: SKY, title: () => tr("Thunderstorms heading your way"), body: () => tr("Expected in about 2 hours around your last location."), when: () => tr("{0} min", [4]) },
  { I: Flag, color: A, title: () => tr("Your {0} time was beaten", ['Brands Hatch Indy']), body: () => tr("Rico beat your V4 Ducati lap: 52.318 vs your 52.904."), when: () => tr("{0} h", [1]) },
  { I: Wrench, color: AMBER, title: () => tr("Chain lube due soon"), body: () => tr("V4 Ducati: due in 150 mi."), when: () => tr("{0} h", [3]) },
];

const NT_CUES: SceneCue[] = NT_ITEMS.map((_, i) => [0.6 + i * 2.2, 'ping']);

export function NotificationsScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), NT_P);
  // Newest arrives on top every 2.2 s; the stack slides down under it.
  const arrived = NT_ITEMS.map((_, i) => easeOutBack((t - (0.6 + (NT_ITEMS.length - 1 - i) * 2.2)) / 0.5));
  const order = NT_ITEMS.map((_, i) => i).filter((i) => arrived[i] > 0);

  return (
    <Frame sound={{ t, cues: NT_CUES }}>
      <Defs id={id} />
      <defs>
        <linearGradient id={id('lock')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1c26" />
          <stop offset="1" stopColor="#060607" />
        </linearGradient>
      </defs>
      <rect width={VW} height={VH} fill={`url(#${id('lock')})`} />
      <g opacity={loopFade(t, NT_P)}>
        <T x={160} y={40} anchor="middle" size={30} weight={300} mono>9:41</T>
        <T x={160} y={52} anchor="middle" size={7} color={MUTED}>{tr("Sunday")}</T>
        {order.map((i) => {
          const pos = order.filter((j) => j < i).length; // newer ones above
          const k = arrived[i];
          const n = NT_ITEMS[i];
          const y = 60 + pos * 34;
          if (pos > 3) return null;
          return (
            <g key={i} transform={`translate(40 ${(y - (1 - clamp01(k)) * 16).toFixed(1)})`} opacity={clamp01(k)}>
              <rect width={240} height={30} rx={8} fill="white" fillOpacity={0.09} stroke="white" strokeOpacity={0.08} />
              <rect x={6} y={6} width={18} height={18} rx={5} fill={n.color} fillOpacity={0.18} />
              <Ico I={n.I} x={10} y={10} s={10} color={n.color} />
              <T x={30} y={11} size={5.5} color={MUTED} weight={700} spacing={0.8}>BLACKTOP</T>
              <T x={232} y={11} anchor="end" size={5.5} color={MUTED}>{n.when()}</T>
              <T x={30} y={19.5} size={7} weight={700}>{n.title()}</T>
              <T x={30} y={27} size={5.8} color={MUTED}>{n.body()}</T>
            </g>
          );
        })}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}
