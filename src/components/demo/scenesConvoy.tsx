/* eslint-disable react-refresh/only-export-components -- scenes export their running times for the tour */
import { useMemo } from 'react';
import { AlertTriangle, Check, Copy, Crown, Flag, Fuel, Gauge, Map as MapIcon, Mic, MicOff, Send, Users, X } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { useExperience } from '@/features/experience';
import {
  A,
  AMBER,
  BG,
  BURN,
  GREEN,
  INK,
  LINE,
  MUTED,
  PANEL,
  Defs,
  Frame,
  Ico,
  T,
  VW,
  Vignette,
  Wave,
  aa,
  clamp01,
  easeOut,
  easeOutBack,
  lerp,
  loopT,
  rnd,
  textW,
  useIds,
  useSceneTime,
  win,
  type Pt,
  type SceneCue,
} from '@/components/scene/kit';
import { Drive, MEMBER, MapLayers, Path, Pin, Road, RouteLine, blocksAlong, camT, follow, toScreen, type Cam, type MapDef } from '@/components/scene/map';
import { useRiderLetter, useRiderName, useSceneUnits } from './units';

/*
 * Ride together: a convoy from the lobby to the road. The code and QR go out,
 * the crew joins one by one at the fuel station, the leader holds Start and
 * everyone sets off together on the same route, talking as they go. Jake drops
 * back; the leader's status bar says so, one tap sends the regroup, the
 * front of the convoy eases off and Jake closes the gap.
 */

const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

/** A finger tap at `p` around `at`: a press and a ring. */
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

/** A QR code's look: three finder squares and a scatter of modules. */
const QR_N = 21;
const QR_CELLS = Array.from({ length: QR_N * QR_N }, (_, i) => {
  const r = Math.floor(i / QR_N);
  const c = i % QR_N;
  const finder = (fr: number, fc: number) => {
    const y = r - fr;
    const x = c - fc;
    if (x < 0 || y < 0 || x > 6 || y > 6) return null;
    return x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
  };
  const f = finder(0, 0) ?? finder(0, QR_N - 7) ?? finder(QR_N - 7, 0);
  if (f != null) return f;
  if ((r < 8 && (c < 8 || c > QR_N - 9)) || (r > QR_N - 9 && c < 8)) return false;
  return rnd(i * 3.7 + 11) > 0.52;
});

function Qr({ x, y, s }: { x: number; y: number; s: number }) {
  const cell = (s - 4) / QR_N;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={s} height={s} rx={2.5} fill="#f4f4f5" />
      {QR_CELLS.map((on, i) => (on ? <rect key={i} x={2 + (i % QR_N) * cell} y={2 + Math.floor(i / QR_N) * cell} width={cell + 0.05} height={cell + 0.05} fill="#111" /> : null))}
    </g>
  );
}

// ---- The map: a village, the fuel station, and Downs Road out over the hills -------

const MEET: Pt = [-36, 204];
const JN: Pt = [-40, 168];
const END: Pt = [960, 58];
const downs = new Road(
  'major',
  [[-260, 214], [-160, 198], [-100, 186], JN, [40, 150], [120, 150], [200, 132], [280, 112], [360, 118], [440, 100], [520, 86], [600, 92], [700, 70], [820, 60], END],
  { name: 'Downs Road', labelAt: 0.3 },
);
const forecourt = new Road('minor', [MEET, [-38, 186], JN]);
const CV_ROADS = [
  downs,
  forecourt,
  new Road('minor', [[40, 150], [30, 100], [52, 40], [60, -40]], { name: 'Beacon Lane', labelAt: 0.45 }),
  new Road('minor', [[200, 132], [214, 190], [230, 260]]),
  new Road('minor', [[360, 118], [350, 60], [372, 0]]),
  new Road('minor', [[520, 86], [534, 150], [520, 220]]),
  new Road('minor', [[-100, 186], [-110, 240], [-120, 300]]),
  new Road('minor', [[-160, 198], [-170, 140], [-150, 80]]),
];
const CV_VILLAGE: Pt[] = [[-290, 140], [-80, 146], [-62, 236], [-140, 290], [-290, 280]];
const CV_MAP: MapDef = {
  areas: [
    { kind: 'town', pts: CV_VILLAGE },
    { kind: 'wood', pts: [[60, 40], [180, 30], [222, 88], [150, 112], [78, 100]] },
    { kind: 'wood', pts: [[420, 132], [500, 142], [482, 204], [400, 192]] },
    { kind: 'park', pts: [[-20, 112], [20, 96], [30, 130], [0, 140]] },
    { kind: 'water', pts: [[230, 162], [320, 150], [348, 188], [300, 226], [236, 208]] },
  ],
  roads: CV_ROADS,
  blocks: [downs, ...CV_ROADS.slice(6)].flatMap((road, i) => blocksAlong(road, { within: CV_VILLAGE, avoid: CV_ROADS, seed: 60 + i, every: 8.5 })),
  places: [{ text: 'Wexley', at: [-190, 262], size: 7 }],
};

/** The convoy's route: out of the fuel station and east along Downs Road. */
const CV_PATH = Path.along([
  [forecourt, MEET, JN],
  [downs, JN, END],
]);

const CV_P = 14;
/** Scene speed to mph. */
const CV_MPH = 0.82;
const SET_OFF = 4.0;
const STAGGER = 0.36;
const REGROUP_SENT = 9.7;

/** Who's riding: you lead, then Marcus, Sarah and Jake; their pin colours are their own accents. */
const CREW = [
  { name: 'Marcus', letter: 'M', color: MEMBER.emerald, joins: 0.8 },
  { name: 'Sarah', letter: 'S', color: MEMBER.purple, joins: 1.6 },
  { name: 'Jake', letter: 'J', color: MEMBER.blue, joins: 2.4 },
];

/** Everyone eases off together once the regroup is sent, and back up once Jake's with them. */
const lead = (start: number) =>
  Drive.timed(CV_PATH, [
    { t: start, v: 0 },
    { t: start + 0.05, v: 62 },
    { t: REGROUP_SENT + 0.25, v: 30 },
    { t: 12.3, v: 62 },
  ]);
const RIDERS = [
  lead(SET_OFF),
  lead(SET_OFF + STAGGER),
  lead(SET_OFF + STAGGER * 2),
  // Jake: caught at the lights, then riding to catch up.
  Drive.timed(CV_PATH, [
    { t: SET_OFF + STAGGER * 3, v: 0 },
    { t: SET_OFF + STAGGER * 3 + 0.05, v: 62 },
    { t: 6.9, v: 34 },
    { t: 9.1, v: 64 },
  ]),
];
/** Where each one waits at the pumps before setting off. */
const PARKED: Pt[] = [[-30, 206], [-42, 210], [-28, 216], [-40, 220]];

const CV_CUES: SceneCue[] = [
  ...CREW.map((m): SceneCue => [m.joins, 'ping']),
  [3.05, 'tap'],
  [3.9, 'success'],
  [8.55, 'caution'],
  [REGROUP_SENT, 'tap'],
  [REGROUP_SENT + 0.15, 'radioIn'],
  [12.4, 'ping'],
];

/** The map takes the part of the frame right of the convoy panel. */
const ANCHOR: Pt = [214, 112];

function cvCam(t: number): Cam {
  const lobby = { x: MEET[0] + 10, y: MEET[1] - 14, z: 1.8 };
  const ps = RIDERS.map((r) => r.at(t));
  const mid = ps.reduce((s, r) => [s[0] + r.p[0] / ps.length, s[1] + r.p[1] / ps.length] as Pt, [0, 0] as Pt);
  const head = ps[0];
  const rad = (head.a * Math.PI) / 180;
  // Centred on the whole convoy; the lead only makes up for the camera's half-second lag.
  const ahead = head.v * 0.45;
  const ride = { x: mid[0] + Math.cos(rad) * ahead, y: mid[1] + Math.sin(rad) * ahead, z: 1.12 };
  const w = smooth((t - SET_OFF + 0.2) / 1.4);
  return { x: lerp(lobby.x, ride.x, w), y: lerp(lobby.y, ride.y, w), z: lerp(lobby.z, ride.z, w) };
}

export function RideTogetherScene() {
  const id = useIds();
  const u = useSceneUnits();
  const me = useRiderLetter();
  const { terms } = useExperience();
  const t = loopT(useSceneTime(0), CV_P);
  const layers = useMemo(() => <MapLayers map={CV_MAP} id={id} />, [id]);
  const cam = follow(cvCam, t, 0.9, 12);
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (CV_P - 0.45)) / 0.45));

  const ps = RIDERS.map((r) => r.at(t));
  // Jake counts as behind once he's well back from Sarah, as the status bar works it out.
  const gap = ps[2].d - ps[3].d;
  const behind = t > SET_OFF + 2 && gap > 44;
  const regroupCard = behind && t < REGROUP_SENT + 0.05 ? win(t, 8.6, REGROUP_SENT + 0.2, 0.25) : 0;
  const sentToast = win(t, REGROUP_SENT + 0.1, REGROUP_SENT + 1.9, 0.25);
  const together = !behind && t > 11 ? win(t, 11, CV_P - 0.5, 0.3) : 0;
  const avgMph = (ps.reduce((s, r) => s + r.v, 0) / ps.length) * CV_MPH;
  const speaking = [0, win(t, 5.6, 7.1, 0.15), 0, 0];
  speaking[0] = win(t, 7.4, 8.4, 0.15);

  // The panel: the lobby while the crew gathers, the riders once you're off.
  const lobbyK = 1 - smooth((t - SET_OFF) / 0.5);
  const rideK = smooth((t - SET_OFF - 0.2) / 0.5);
  const joined = CREW.filter((m) => t >= m.joins).length + 1;
  const hold = clamp01((t - 3.05) / 0.85);
  const copied = t > 0.5 && t < 1.5;
  const people = [{ name: tr("You"), letter: me, color: '' }, ...CREW];

  const statusW = 196;
  const etaLabel = tr("ETA");
  const behindLabel = tr("1 rider behind");
  const sendLabel = tr("Send to convoy");
  const sendW = Math.max(64, 16 + textW(sendLabel, 6) + 6);
  const speedNow = String(u.speed(avgMph));
  // Laid out from the words' own widths, all shrunk together where a long language would run the ETA into the warning.
  const strip = (() => {
    const at = (k: number) => {
      const gauge = 18 + textW('4', 6.6 * k) + 7;
      const flag = gauge + 12 + textW('88', 6.6 * k) + 2 + textW(u.speedLabel, 5.6 * k) + 7;
      const end = flag + 12 + textW(etaLabel, 6.2 * k) + 3 + textW('14:32', 6.6 * k);
      const warn = statusW - 6 - textW(behindLabel, 6.2 * k) - 4 - 9;
      return { k, gauge, flag, end, warn };
    };
    let k = 1;
    while (k > 0.62 && at(k).end + 5 > at(k).warn) k -= 0.02;
    return at(k);
  })();
  const startLabel = hold >= 1 ? tr("Starting the {0} for everyone", [terms.ride]) : tr("Start {0}", [terms.Ride]);

  return (
    <Frame sound={{ t, cues: CV_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={200} fill={BG} />
      <g opacity={fade}>
        <g transform={camT(cam, ANCHOR)}>
          {layers}
          {/* The fuel station's forecourt, under its canopy */}
          <rect x={MEET[0] - 18} y={MEET[1] - 8} width={34} height={24} rx={2} fill="#1a1b1e" stroke="#2a2b30" strokeWidth={0.6} />
          <rect x={MEET[0] - 12} y={MEET[1] - 2} width={22} height={9} rx={1} fill="#24262b" />
          {/* The route everyone shares */}
          <RouteLine d={CV_PATH.slice(Math.max(0, ps[3].d - 2), CV_PATH.len)} draw={smooth((t - 3.95) / 0.8)} />
        </g>

        {/* The fuel station where everyone meets */}
        {(() => {
          const s = toScreen(cam, [MEET[0] + 22, MEET[1] - 8], ANCHOR);
          return (
            <g transform={`translate(${s[0].toFixed(1)} ${s[1].toFixed(1)}) scale(${Math.min(1.4, cam.z).toFixed(3)})`} opacity={0.95}>
              <rect x={-5} y={-5} width={10} height={10} rx={2.6} fill={SKY_DARK} stroke="#000" strokeOpacity={0.5} strokeWidth={0.6} />
              <Ico I={Fuel} x={-3.5} y={-3.5} s={7} color="#fff" sw={2.2} />
            </g>
          );
        })()}

        {/* The riders: parked at the pumps as they join, then on the road in order */}
        {[...people].reverse().map((p, j) => {
          const i = people.length - 1 - j;
          const r = ps[i];
          const parked = PARKED[i];
          const going = clamp01((t - (SET_OFF + STAGGER * i)) / 0.5);
          const world: Pt = [lerp(parked[0], r.p[0], smooth(going)), lerp(parked[1], r.p[1], smooth(going))];
          const at = toScreen(cam, world, ANCHOR);
          const arrived = i === 0 ? 1 : easeOutBack((t - CREW[i - 1].joins) / 0.45);
          if (arrived <= 0) return null;
          return (
            <g key={i} opacity={clamp01(arrived)}>
              <Pin p={at} letter={p.letter} member={i === 0 ? undefined : p.color} speaking={speaking[i]} r={5.2 * Math.max(0.3, Math.min(1, arrived))} />
            </g>
          );
        })}

        {/* Convoy status, along the top of the map */}
        <g opacity={rideK} transform={`translate(116 8)`}>
          <rect width={statusW} height={18} rx={6} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
          <Ico I={Users} x={6} y={4.5} s={9} />
          <T x={18} y={12.2} size={6.6 * strip.k} weight={800}>4</T>
          <Ico I={Gauge} x={strip.gauge} y={4.5} s={9} color={MUTED} />
          <T x={strip.gauge + 12} y={12.2} size={6.6 * strip.k} weight={700} mono>{speedNow}</T>
          <T x={strip.gauge + 12 + textW(speedNow, 6.6 * strip.k) + 2} y={12.2} size={5.6 * strip.k} color={MUTED}>{u.speedLabel}</T>
          <Ico I={Flag} x={strip.flag} y={4.5} s={9} color={MUTED} />
          <T x={strip.flag + 12} y={12.2} size={6.2 * strip.k} color={MUTED}>{etaLabel}</T>
          <T x={strip.flag + 12 + textW(etaLabel, 6.2 * strip.k) + 3} y={12.2} size={6.6 * strip.k} weight={700} mono>14:32</T>
          <g opacity={behind ? 1 : 0}>
            <Ico I={AlertTriangle} x={strip.warn} y={4.5} s={9} color={AMBER} />
            <T x={statusW - 6} y={12.2} anchor="end" size={6.2 * strip.k} weight={800} color={AMBER}>{behindLabel}</T>
          </g>
        </g>
        {/* The leader's regroup card */}
        {regroupCard > 0.01 && (
          <g opacity={regroupCard} transform={`translate(116 ${(30 - 6 * (1 - easeOut((t - 8.6) / 0.3))).toFixed(1)})`}>
            <rect width={statusW} height={30} rx={7} style={{ fill: PANEL, stroke: `${AMBER}88` }} strokeWidth={0.9} />
            <T x={8} y={12} size={7} weight={800}>{tr("Regroup?")}</T>
            <T x={8} y={22.5} size={5.8} color={MUTED}>{tr("{0} is behind.", ['Jake'])}</T>
            <g transform={`translate(${statusW - 20 - sendW} 7)`}>
              <rect width={sendW} height={16} rx={5} fill={AMBER} fillOpacity={0.16} />
              <Ico I={Send} x={5} y={4} s={8} color={AMBER} />
              <T x={16} y={10.8} size={6} weight={800} color={AMBER}>{sendLabel}</T>
            </g>
            <Ico I={X} x={statusW - 15} y={11} s={8} color={MUTED} />
          </g>
        )}
        <Tap p={[116 + statusW - 20 - sendW / 2, 45]} t={t} at={REGROUP_SENT} />
        <Notice x={214} y={174} I={Check} color={GREEN} label={tr("Regroup sent to convoy")} opacity={sentToast} />
        <Notice x={214} y={174} I={Users} color={GREEN} label={tr("All together")} opacity={together} />

        {/* The convoy panel */}
        <g transform="translate(8 8)">
          <rect width={100} height={184} rx={10} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
          <g opacity={lobbyK}>
            <T x={8} y={15} size={5} weight={700} color={MUTED} spacing={1}>{tr("Convoy code").toUpperCase()}</T>
            <T x={8} y={31} size={13.5} weight={800} spacing={1.2} mono>XK7M9P</T>
            <g transform="translate(80 20)">
              <rect width={13} height={13} rx={3.5} style={{ fill: copied ? A : '#1c1c22' }} />
              <Ico I={copied ? Check : Copy} x={3} y={3} s={7} color={copied ? '#111' : MUTED} />
            </g>
            <Qr x={8} y={38} s={34} />
            <T x={48} y={52} size={5.6} color={MUTED}>{tr("Scan to join")}</T>
            <T x={48} y={61} size={5.6} color={MUTED}>{tr("or share the code")}</T>
            <T x={8} y={86} size={5} weight={700} color={MUTED} spacing={1}>{tr("Riders").toUpperCase()}</T>
            <T x={92} y={86} anchor="end" size={5.4} weight={700} color={MUTED} mono>{`${joined}/8`}</T>
            {people.map((p, i) => {
              const k = i === 0 ? 1 : easeOutBack((t - CREW[i - 1].joins) / 0.4);
              if (k <= 0) return null;
              return (
                <g key={i} transform={`translate(6 ${92 + i * 15})`} opacity={clamp01(k)}>
                  <rect width={88} height={13} rx={4} fill={i === joined - 1 && t < 3 && i > 0 ? aa(0.1) : 'transparent'} />
                  <circle cx={7} cy={6.5} r={3.3} style={{ fill: i === 0 ? A : `hsl(${p.color})` }} />
                  <T x={14} y={9} size={6.2} weight={i === 0 ? 800 : 600} color={i === 0 ? A : INK}>{p.name}</T>
                  {i === 0 && <Ico I={Crown} x={14 + textW(p.name, 6.2) + 3} y={3} s={7} color={A} />}
                </g>
              );
            })}
            {/* Tap to start yourself; the leader holds it to start everyone */}
            <g transform="translate(6 156)">
              <rect width={88} height={20} rx={7} style={{ fill: A }} />
              {hold > 0 && <rect width={88 * hold} height={20} rx={7} fill="#000" fillOpacity={0.22} />}
              <T x={44} y={13.2} anchor="middle" size={fitText(startLabel, 82, 6.8)} weight={800} color="#111">{startLabel}</T>
            </g>
          </g>
          {rideK > 0.01 && (
            <g opacity={rideK}>
              <T x={8} y={15} size={6.4} weight={800} spacing={0.8} mono>XK7M9P</T>
              <circle cx={78} cy={12.8} r={2} fill={GREEN} />
              <T x={92} y={15} anchor="end" size={5.4} weight={700} color={GREEN}>{tr("Live")}</T>
              <T x={8} y={30} size={5} weight={700} color={MUTED} spacing={1}>{tr("Riders").toUpperCase()}</T>
              {people.map((p, i) => {
                const r = ps[i];
                const late = i === 3 && behind;
                const talk = speaking[i];
                return (
                  <g key={i} transform={`translate(6 ${36 + i * 27})`}>
                    <rect width={88} height={23} rx={6} style={{ fill: talk > 0.3 ? aa(0.12) : 'rgba(255,255,255,0.03)', stroke: talk > 0.3 ? aa(0.45) : late ? `${AMBER}66` : 'transparent' }} strokeWidth={0.8} />
                    <Pin p={[10, 11.5]} letter={p.letter} member={i === 0 ? undefined : p.color} r={5} speaking={0} />
                    <T x={20} y={10} size={6.2} weight={700}>{p.name}</T>
                    <T x={20} y={18.5} size={5.2} color={late ? AMBER : MUTED} mono={!late}>{late ? tr("Behind") : `${u.speed(r.v * CV_MPH)} ${u.speedLabel}`}</T>
                    <g transform="translate(70 3)">
                      <Wave on={talk} t={t} n={5} color={i === 0 ? A : `hsl(${p.color})`} />
                    </g>
                  </g>
                );
              })}
              <g transform="translate(6 152)">
                <rect width={88} height={24} rx={7} style={{ fill: aa(0.1), stroke: aa(0.35) }} strokeWidth={0.8} />
                <Ico I={Mic} x={6} y={7.5} s={9} />
                <T x={18} y={10} size={6} weight={800}>{tr("Voice")}</T>
                <T x={18} y={18.5} size={5} color={MUTED}>{tr("{0} riders linked", [4])}</T>
              </g>
            </g>
          )}
        </g>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** For the tour: how long the convoy scene runs. */
export const RIDE_TOGETHER_SECONDS = CV_P;

/** The fuel station's icon tile on the map. */
const SKY_DARK = '#2563eb';

/** Font size that fits `label` into `maxW` scene units (never above `size`). */
const fitText = (label: string, maxW: number, size: number) => Math.min(size, maxW / Math.max(1, textW(label, 1)));

/** A small notice centred on `x`: an icon and a line. */
function Notice({ x, y, I, color, label, opacity }: { x: number; y: number; I: typeof Check; color: string; label: string; opacity: number }) {
  if (opacity <= 0.01) return null;
  const w = 26 + textW(label, 6.8);
  return (
    <g opacity={opacity} transform={`translate(${(x - w / 2).toFixed(1)} ${y})`}>
      <rect width={w} height={18} rx={6} style={{ fill: PANEL, stroke: `${color}88` }} strokeWidth={0.8} />
      <Ico I={I} x={8} y={4.5} s={9} color={color} />
      <T x={22} y={11.8} size={6.8}>{label}</T>
    </g>
  );
}

// =============================================================================
// The passenger: their own screen. A wave, a word on the intercom, and "need a
// stop", which every rider sees; the convoy pulls into the next fuel station.
// =============================================================================

const PL_P = 8.5;
/** The fuel station down the side road off Downs Road (the same road the map draws). */
const PL_TURN: Pt = [520, 86];
const PL_STATION: Pt = [534, 150];
const pumps = new Road('minor', [PL_TURN, PL_STATION, [520, 220]]);
const PL_PATH = Path.along([
  [downs, [40, 150], PL_TURN],
  [pumps, PL_TURN, PL_STATION],
]);
const PL_TURN_D = PL_PATH.near(PL_TURN);
const PL_STOP_D = PL_PATH.len;
const PL_WAVE = 0.8;
const PL_TALK = [1.7, 3.5] as const;
const PL_STOP = 4.15;
/** Each rider slows for the turn and pulls up behind the one in front at the pumps. */
const PL_RIDERS = [0, 1, 2, 3].map((i) => {
  const gap = 20;
  const end = PL_STOP_D - i * 11;
  return new Drive(PL_PATH.until(end), [
    { d: PL_TURN_D - 300 - i * gap, v: 62 },
    { d: PL_TURN_D - 50, v: 62 },
    { d: PL_TURN_D - 8, v: 24 },
    { d: PL_TURN_D + 10, v: 24 },
    { d: end - 14, v: 16 },
    { d: end, v: 3 },
  ]);
});

const PL_CUES: SceneCue[] = [
  [PL_WAVE, 'tap'],
  [PL_WAVE + 0.15, 'ping'],
  [PL_TALK[0], 'radioIn'],
  [PL_TALK[1], 'radioOut'],
  [PL_STOP, 'tap'],
  [PL_STOP + 0.15, 'caution'],
];

const PL_ANCHOR: Pt = [214, 104];

function plCam(t: number): Cam {
  const head = PL_RIDERS[0].at(t);
  const rad = (head.a * Math.PI) / 180;
  const ahead = 16 + head.v * 0.45;
  return { x: head.p[0] + Math.cos(rad) * ahead - 24, y: head.p[1] + Math.sin(rad) * ahead, z: 1.15 };
}

/** An emoji, drawn by the system font as the app shows it. */
function Emoji({ x, y, size, children }: { x: number; y: number; size: number; children: string }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor="middle" style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>
      {children}
    </text>
  );
}

export function PillionScene() {
  const id = useIds();
  const leader = useRiderName();
  const me = useRiderLetter();
  const t = loopT(useSceneTime(0), PL_P);
  const layers = useMemo(() => <MapLayers map={CV_MAP} id={id} />, [id]);
  const cam = follow(plCam, t, 0.9, 12);
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (PL_P - 0.45)) / 0.45));
  const ps = PL_RIDERS.map((r) => r.at(t));
  const live = t >= PL_TALK[0] && t < PL_TALK[1];
  const waved = win(t, PL_WAVE + 0.1, PL_WAVE + 1.7, 0.2);
  const stopToast = win(t, PL_STOP + 0.1, PL_P - 0.4, 0.25);
  const stopAdded = smooth((t - PL_STOP - 0.3) / 0.6);
  const people = [
    { letter: me, color: '' },
    { letter: 'M', color: MEMBER.emerald },
    { letter: 'S', color: MEMBER.purple },
    { letter: 'J', color: MEMBER.blue },
  ];
  const station = toScreen(cam, [PL_STATION[0] + 16, PL_STATION[1]], PL_ANCHOR);
  const youAt = toScreen(cam, ps[0].p, PL_ANCHOR);
  const bubble = (at: number) => {
    const k = clamp01((t - at) / 1.1);
    return k > 0 && k < 1 ? { y: -10 - 14 * easeOut(k), o: 1 - k * k } : null;
  };
  const waveBubble = bubble(PL_WAVE + 0.1);
  const stopBubble = bubble(PL_STOP + 0.1);
  const reactions = ['👍', '🔥', '😂', '😱', '🛑', '⛽', '☕', '📸'];

  return (
    <Frame sound={{ t, cues: PL_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={200} fill={BG} />
      <g opacity={fade}>
        <g transform={camT(cam, PL_ANCHOR)}>
          {layers}
          <rect x={PL_STATION[0] + 3} y={PL_STATION[1] - 11} width={26} height={22} rx={2} fill="#1a1b1e" stroke="#2a2b30" strokeWidth={0.6} />
          <RouteLine d={PL_PATH.slice(ps[0].d, PL_STOP_D)} />
        </g>
        {/* The stop everyone's heading for once it's asked for */}
        <g transform={`translate(${station[0].toFixed(1)} ${(station[1] - 2).toFixed(1)}) scale(${Math.max(0.001, 0.6 + 0.4 * easeOutBack((t - PL_STOP - 0.3) / 0.45)).toFixed(3)})`} opacity={0.55 + 0.45 * stopAdded}>
          <rect x={-6} y={-6} width={12} height={12} rx={3} fill={SKY_DARK} stroke="#000" strokeOpacity={0.5} strokeWidth={0.6} />
          <Ico I={Fuel} x={-4} y={-4} s={8} color="#fff" />
        </g>
        {[...people].reverse().map((p, j) => {
          const i = people.length - 1 - j;
          return <Pin key={i} p={toScreen(cam, ps[i].p, PL_ANCHOR)} letter={p.letter} member={i === 0 ? undefined : p.color} speaking={i === 0 && live ? 1 : 0} />;
        })}
        {waveBubble && (
          <g opacity={waveBubble.o}>
            <Emoji x={youAt[0]} y={youAt[1] + waveBubble.y} size={11}>👋</Emoji>
          </g>
        )}
        {stopBubble && (
          <g opacity={stopBubble.o}>
            <Emoji x={youAt[0]} y={youAt[1] + stopBubble.y} size={11}>🛑</Emoji>
          </g>
        )}
        {/* What the riders see: a toast on their screens */}
        <Toast x={214} y={10} label={`👋  ${tr("{0} waved", ['Ana'])}`} opacity={waved} />
        <Toast x={214} y={10} label={`🛑  ${tr("{0} needs a stop", ['Ana'])}`} opacity={stopToast} tone={AMBER} />

        {/* The passenger's screen */}
        <g transform="translate(8 6)">
          <rect width={100} height={188} rx={11} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
          <T x={8} y={15} size={8} weight={800}>{tr("Pillion")}</T>
          <T x={8} y={23.5} size={fitText(`${tr("{0}'s convoy", [leader])} · ${tr("{0} riders", [4])}`, 84, 5.2)} color={MUTED}>{`${tr("{0}'s convoy", [leader])} · ${tr("{0} riders", [4])}`}</T>
          <g transform="translate(84 8)">
            <rect width={11} height={11} rx={3} style={{ fill: '#1c1c22' }} />
            <Ico I={MapIcon} x={2} y={2} s={7} color={A} />
          </g>
          {/* Voice: one big button */}
          <g transform="translate(50 52)">
            {live && <circle r={22} style={{ fill: aa(0.25) }} />}
            <circle r={17} style={{ fill: live ? A : aa(0.18), stroke: live ? 'none' : aa(0.6) }} strokeWidth={1.4} />
            <Ico I={live ? Mic : MicOff} x={-7.5} y={-7.5} s={15} color={live ? '#111' : A} />
          </g>
          <T x={50} y={80} anchor="middle" size={5.2} color={MUTED}>{live ? tr("Live · tap to mute") : tr("Muted · tap to talk")}</T>
          {['Marcus', 'Sarah', 'Jake'].map((name, i) => {
            const w = textW(name, 4.8) + 8;
            const x = [6, 38, 70][i];
            return (
              <g key={name} transform={`translate(${x} 86)`}>
                <rect width={Math.min(28, w)} height={9} rx={4.5} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.6} />
                <T x={Math.min(28, w) / 2} y={6.4} anchor="middle" size={4.6} color={MUTED}>{name}</T>
              </g>
            );
          })}
          {/* Wave, and the reactions everyone sees */}
          <g transform="translate(6 100)">
            <rect width={88} height={16} rx={5} style={{ fill: A }} />
            <Emoji x={30} y={11.5} size={8}>👋</Emoji>
            <T x={52} y={11} anchor="middle" size={6.4} weight={800} color="#111">{tr("Wave")}</T>
          </g>
          {reactions.map((e, i) => {
            const x = 6 + (i % 4) * 22.3;
            const y = 120 + Math.floor(i / 4) * 22;
            const on = e === '🛑' && t >= PL_STOP && t < PL_STOP + 0.6;
            return (
              <g key={e} transform={`translate(${x} ${y})`}>
                <rect width={20} height={20} rx={5} style={{ fill: on ? aa(0.25) : '#141418', stroke: on ? A : 'rgba(255,255,255,0.1)' }} strokeWidth={0.7} />
                <Emoji x={10} y={14} size={10}>{e}</Emoji>
              </g>
            );
          })}
          {/* Rescue, with the same R as the ride screen */}
          <g transform="translate(6 166)">
            <rect width={88} height={16} rx={5} fill="none" style={{ stroke: BURN }} strokeOpacity={0.8} strokeWidth={1} />
            <circle cx={12} cy={8} r={5} style={{ fill: BURN }} />
            <T x={12} y={10.4} anchor="middle" size={6} weight={900} color="#fff">R</T>
            <T x={52} y={10.6} anchor="middle" size={fitText(tr("Request rescue"), 62, 6)} weight={800} color={BURN}>{tr("Request rescue")}</T>
          </g>
        </g>
        <Tap p={[58, 114]} t={t} at={PL_WAVE} />
        <Tap p={[24, 159]} t={t} at={PL_STOP} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** For the tour: how long the passenger scene runs. */
export const PILLION_SECONDS = PL_P;

/** A toast across the top of the riders' map, centred on `x`. */
function Toast({ x, y, label, opacity, tone = 'rgba(255,255,255,0.16)' }: { x: number; y: number; label: string; opacity: number; tone?: string }) {
  if (opacity <= 0.01) return null;
  const w = 16 + textW(label, 6.8) + 6;
  return (
    <g opacity={opacity} transform={`translate(${(x - w / 2).toFixed(1)} ${(y - 4 * (1 - opacity)).toFixed(1)})`}>
      <rect width={w} height={18} rx={6} style={{ fill: PANEL, stroke: tone }} strokeWidth={0.9} />
      <text x={8} y={12} fontSize={6.8} fontWeight={600} style={{ fill: INK, fontFamily: 'inherit' }}>
        {label}
      </text>
    </g>
  );
}
