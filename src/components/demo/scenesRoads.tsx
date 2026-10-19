/* eslint-disable react-refresh/only-export-components -- scenes export their running times for the tour */
import { useMemo } from 'react';
import {
  ArrowUpLeft,
  Check,
  CloudRain,
  CornerUpRight,
  Eye,
  Handshake,
  Loader2,
  MapPin,
  Megaphone,
  MessageSquare,
  Navigation,
  Shield,
  Siren,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import { HAZARD_CATEGORIES, HAZARD_TYPES } from '@/features/hazards';
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
  RED,
  SKY,
  Defs,
  Frame,
  Ico,
  Rings,
  T,
  VW,
  Vignette,
  Wave,
  clamp01,
  easeInOut,
  easeOut,
  easeOutBack,
  fitLines,
  frac,
  lerp,
  loopT,
  textW,
  useIds,
  useSceneTime,
  win,
  type Pt,
  type SceneCue,
} from '@/components/scene/kit';
import { Drive, MEMBER, MapLayers, Path, Pin, RainCell, RescueLine, Road, RouteLine, SpeedCard, TurnBanner, blocksAlong, camT, follow, toScreen, type Cam, type MapDef } from '@/components/scene/map';
import { useRiderLetter, useRiderName, useSceneUnits } from './units';

/*
 * Roads worth riding, part one: turn by turn on a real-looking map. As in the
 * app, the weather is checked the moment a route is set: heavy rain sits on
 * High Road, the rider takes the dry route and the line re-plans along Coast
 * Road. Then they ride it: out of town onto Ridge Road, easing off for the
 * speed camera on Mill Lane, right onto Coast Road and into Sunset Point, dry,
 * while the rain carries on over the hill. Place and road names are made up.
 */

const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

/** A finger tap at `p`, for `at` seconds: a press and a ring. */
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

// ---- The map: a town by the sea --------------------------------------------------

// Laid out north-up, then turned so the trip runs across the wide frame.
const TURN = (30 * Math.PI) / 180;
const PIVOT: Pt = [258, 190];
const r = ([x, y]: Pt): Pt => [
  PIVOT[0] + (x - PIVOT[0]) * Math.cos(TURN) - (y - PIVOT[1]) * Math.sin(TURN),
  PIVOT[1] + (x - PIVOT[0]) * Math.sin(TURN) + (y - PIVOT[1]) * Math.cos(TURN),
];
const R = (pts: Pt[]) => pts.map(r);

const S = r([64, 322]);
const J1 = r([72, 280]);
const J2 = r([232, 238]);
const CAM = r([268, 206]);
const J3 = r([300, 172]);
const D = r([452, 60]);

const station = new Road('minor', [r([58, 390]), S, r([68, 300]), J1, r([74, 250]), r([80, 214])], { name: 'Station Road', labelAt: 0.27 });
const ridge = new Road('major', [r([-60, 300]), r([16, 289]), J1, r([130, 270]), r([186, 256]), J2, r([292, 226]), r([360, 222]), r([432, 232]), r([560, 242])], { name: 'Ridge Road', labelAt: 0.3 });
const mill = new Road('minor', [J2, r([252, 221]), CAM, r([285, 187]), J3], { name: 'Mill Lane', labelAt: 0.45 });
const high = new Road('major', [J3, r([318, 140]), r([344, 112]), r([376, 88]), r([414, 70]), D], { name: 'High Road', labelAt: 0.6 });
const coast = new Road('minor', [J3, r([338, 168]), r([380, 158]), r([420, 140]), r([452, 112]), r([466, 84]), D], { name: 'Coast Road', labelAt: 0.32 });
const hill = new Road('minor', R([[130, 270], [138, 220], [150, 160], [188, 112], [240, 86], [300, 92], [344, 112]]), { name: 'Hill Lane', labelAt: 0.55 });
const farm = new Road('minor', R([[360, 222], [366, 190], [380, 158]]));
const church = new Road('minor', R([[-60, 308], [20, 303], [68, 300], [120, 298], [176, 310]]), { name: 'Church Street', labelAt: 0.2 });
const market = new Road('minor', [S, ...R([[104, 326], [150, 338], [200, 360]])]);
const back = new Road('minor', R([[20, 303], [14, 340], [8, 400]]));
const lane = new Road('minor', R([[120, 298], [124, 336], [128, 400]]));
const north = new Road('minor', R([[80, 214], [60, 170], [20, 140], [-60, 132]]));

const TOWN = R([[-80, 262], [40, 262], [110, 262], [180, 282], [212, 330], [210, 420], [-80, 420]]);
const ROADS = [ridge, high, station, mill, coast, hill, farm, church, market, back, lane, north];
const MAP_DEF: MapDef = {
  areas: [
    { kind: 'town', pts: TOWN },
    { kind: 'wood', pts: R([[100, 236], [172, 226], [216, 188], [236, 132], [214, 98], [160, 102], [118, 150], [102, 200]]) },
    { kind: 'park', pts: R([[146, 312], [176, 316], [184, 334], [158, 344], [140, 330]]) },
    { kind: 'wood', pts: R([[388, 196], [430, 186], [452, 200], [440, 222], [400, 216]]) },
    {
      kind: 'water',
      pts: R([[498, -160], [820, -160], [820, 520], [600, 520], [526, 340], [504, 250], [510, 190], [518, 128], [508, 78], [494, 36], [490, -60]]),
    },
  ],
  roads: ROADS,
  blocks: [station, church, market, back, lane, ridge].flatMap((road, i) =>
    blocksAlong(road, { within: TOWN, avoid: ROADS, seed: i + 1, every: 8.5, to: road === ridge ? 0.3 : 1 }),
  ),
  places: [
    { text: 'Ashby', at: r([30, 352]), size: 7.5 },
    { text: 'Sunset Bay', at: r([566, 160]), kind: 'water', size: 7 },
  ],
};

// ---- The ride ------------------------------------------------------------------

const NV_P = 14;
/** Scene units to feet, and scene speed to mph, so the banner and speed card read like a real ride. */
const FT = 12;
const MPH = 0.64;

/** The planned route, over the hill on High Road, and the dry route along the coast; the same until Mill Lane ends. */
const PATH_HIGH = Path.along([[station, S, J1], [ridge, J1, J2], [mill, J2, J3], [high, J3, D]]);
const PATH_COAST = Path.along([[station, S, J1], [ridge, J1, J2], [mill, J2, J3], [coast, J3, D]]);
const D_J1 = PATH_COAST.near(J1);
const D_J2 = PATH_COAST.near(J2);
const D_CAM = PATH_COAST.near(CAM);
const D_J3 = PATH_COAST.near(J3);
const D_END = PATH_COAST.len;

/** The weather check as the route is set: the warning, the tap on Dry route, the new line; then Go. */
const OFFER = 0.8;
const TAKE = 2.0;
const REPLANNED = 2.55;
const GO = 3.2;
const SET_OFF = 3.45;

const DRIVE = new Drive(PATH_COAST, [
  { d: 0, v: 21, wait: SET_OFF },
  { d: 16, v: 47 },
  { d: D_J1 - 10, v: 31 },
  { d: D_J1 + 6, v: 33 },
  { d: D_J1 + 34, v: 96 },
  { d: D_J2 - 30, v: 96 },
  { d: D_J2 - 4, v: 40 },
  { d: D_J2 + 10, v: 52 },
  // Easing off for the camera: down to 30, held past it.
  { d: D_CAM - 26, v: 47 },
  { d: D_CAM + 8, v: 47 },
  { d: D_CAM + 24, v: 70 },
  { d: D_J3 - 8, v: 38 },
  { d: D_J3 + 8, v: 42 },
  { d: D_J3 + 40, v: 98 },
  { d: D_END - 44, v: 90 },
  { d: D_END - 10, v: 26 },
  { d: D_END, v: 9 },
]);
const ARRIVED = DRIVE.when(D_END - 1);
/** The turns as the banner calls them: on the radio a little before each. */
const CALL_J1 = DRIVE.when(D_J1 - 40);
const CALL_J2 = DRIVE.when(D_J2 - 52);
const CALL_CAM = DRIVE.when(D_CAM - 70);
const CALL_J3 = DRIVE.when(D_J3 - 34);

const NV_CUES: SceneCue[] = [
  [OFFER, 'caution'],
  [TAKE, 'tap'],
  [REPLANNED, 'success'],
  [GO, 'tap'],
  [CALL_J1, 'beep'],
  [CALL_J2, 'beep'],
  [CALL_CAM, 'camera'],
  [CALL_J3, 'beep'],
  [ARRIVED, 'success'],
];

/** Heavy rain sitting over High Road, drifting slowly along the hill, never onto the coast. */
const RAIN = r([352, 100]);
const rainAt = (t: number): Pt => [RAIN[0] + t * 0.7, RAIN[1] - t * 0.3];

/** Opens on the whole trip (the route, the rain on it, the way round), follows the ride, and pulls back at the end. */
function camAt(t: number): Cam {
  const now = DRIVE.at(t);
  const rad = (now.a * Math.PI) / 180;
  // The camera averages where it was over the last second, so it leads by about half a second of travel.
  const lead = 26 + now.v * 0.5;
  const near = { x: now.p[0] + Math.cos(rad) * lead, y: now.p[1] + Math.sin(rad) * lead - 6, z: 1.15 };
  const wide = { x: 262, y: 194, z: 0.62 };
  const after = { x: D[0] - 52, y: D[1] - 18, z: 0.92 };
  const w = 1 - smooth((t - GO + 0.1) / 1.2);
  const end = smooth((t - ARRIVED + 0.3) / 1.3);
  return {
    x: lerp(lerp(near.x, wide.x, w), after.x, end),
    y: lerp(lerp(near.y, wide.y, w), after.y, end),
    z: lerp(lerp(near.z, wide.z, w), after.z, end),
  };
}

const two = (n: number) => String(n).padStart(2, '0');

export function NavigationScene() {
  const id = useIds();
  const u = useSceneUnits();
  const me = useRiderLetter();
  const t = loopT(useSceneTime(0), NV_P);
  const layers = useMemo(() => <MapLayers map={MAP_DEF} id={id} />, [id]);
  const rider = DRIVE.at(t);
  const cam = follow(camAt, t, 1.0, 12);
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (NV_P - 0.45)) / 0.45));

  // The route: planned over High Road; with the dry route taken the old line fades and the new one draws on.
  const switched = t >= TAKE;
  const oldK = clamp01((t - REPLANNED) / 0.5);
  const newK = easeInOut((t - REPLANNED) / 0.8);
  const plan = easeInOut((t - 0.05) / 0.6);

  // Guidance: the next manoeuvre on the route.
  const guiding = smooth((t - GO) / 0.4);
  const turns = [
    { d: D_J1, I: CornerUpRight, text: tr("Turn right") + tr(" onto {0}", ['Ridge Road']) },
    { d: D_J2, I: ArrowUpLeft, text: tr("Bear left") + tr(" onto {0}", ['Mill Lane']) },
    { d: D_J3, I: CornerUpRight, text: tr("Turn right") + tr(" onto {0}", ['Coast Road']) },
    { d: D_END, I: MapPin, text: tr("Arrive at {0}", ['Sunset Point']) },
  ];
  const arrived = t >= ARRIVED;
  const next = turns.find((m) => m.d > rider.d + 1) ?? turns[turns.length - 1];
  const left = ((switched ? D_END : PATH_HIGH.len) - rider.d) * FT;
  const leftMi = left / 5280;
  const mins = Math.max(1, Math.round(leftMi * 2.4));
  const eta = 14 * 60 + 29 + mins;
  const etaText = tr("ETA {0}", [`${Math.floor(eta / 60)}:${two(eta % 60)}`]);
  const sub = `${tr("{0} min", [mins])} · ${u.dist(leftMi)} ${u.distLabel} · ${etaText}`;
  const call = Math.max(...[CALL_J1, CALL_J2, CALL_J3, ARRIVED].map((c) => win(t, c, c + 1.6, 0.2)));

  // The camera on Mill Lane: called as it comes up; the rider eases off past it.
  const camWarn = win(t, CALL_CAM, DRIVE.when(D_CAM + 6), 0.25);
  const camScreen = toScreen(cam, CAM);

  // The weather check: the warning, the tap, the drier line found.
  const toast = win(t, OFFER, TAKE + 0.15, 0.3);
  const finding = win(t, TAKE, REPLANNED + 0.1, 0.15);
  const done = win(t, REPLANNED, GO + 0.2, 0.25);
  const card = 1 - guiding;

  const riderScreen = toScreen(cam, rider.p);
  const dest = toScreen(cam, D);
  const mph = rider.v * MPH;
  const speedTone = mph >= u.red ? RED : mph >= u.amber ? AMBER : INK;
  const rain = rainAt(t);

  const findingW = 26 + textW(tr("Finding a drier line…"), 7);
  const doneW = 26 + textW(tr("Rerouted around the weather"), 7);

  return (
    <Frame sound={{ t, cues: NV_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={200} fill={BG} />
      <g opacity={fade}>
        <g transform={camT(cam)}>
          {layers}
          <RainCell at={rain} r={40} id={id} seed={3} />
          <RainCell at={[rain[0] + 10, rain[1] - 4]} r={22} id={id} seed={7} opacity={0.9} />
          {/* The live route */}
          {oldK < 1 && <RouteLine d={PATH_HIGH.slice(rider.d, PATH_HIGH.len)} opacity={1 - oldK} dash={switched ? '2 3' : undefined} draw={plan} />}
          {newK > 0 && <RouteLine d={PATH_COAST.slice(rider.d, D_END)} draw={newK} />}
        </g>

        {/* The speed camera on the map */}
        <g transform={`translate(${camScreen[0].toFixed(1)} ${camScreen[1].toFixed(1)})`}>
          {camWarn > 0 && <Rings p={[0, 0]} phase={frac(t * 1.3)} color={RED} max={14} />}
          <circle r={5.6} fill={BG} stroke={RED} strokeWidth={1} />
          <Ico I={Eye} x={-3.4} y={-3.4} s={6.8} color={RED} />
        </g>

        {/* Where it's going */}
        <g transform={`translate(${dest[0].toFixed(1)} ${dest[1].toFixed(1)})`}>
          {arrived && <Rings p={[0, -11]} phase={frac(t * 0.9)} color={A} max={16} />}
          <path d="M0 0 C -2 -4, -6 -6.5, -6 -11 A6 6 0 1 1 6 -11 C 6 -6.5, 2 -4, 0 0 Z" style={{ fill: A }} stroke="#000" strokeOpacity={0.5} strokeWidth={0.8} />
          <circle cx={0} cy={-11} r={2.2} fill="#111" />
          <T x={0} y={8} anchor="middle" size={5.4} weight={700}>Sunset Point</T>
        </g>

        <Pin p={riderScreen} letter={me} />

        {/* The route preview: where to, how far, and Go */}
        {card > 0.01 && (
          <g opacity={card} transform={`translate(0 ${(14 * (1 - card)).toFixed(1)})`}>
            <g transform="translate(8 156)">
              <rect width={304} height={36} rx={9} style={{ fill: PANEL, stroke: 'rgba(255,255,255,0.12)' }} strokeWidth={0.8} />
              <rect x={7} y={7} width={22} height={22} rx={6} fill="rgba(255,255,255,0.06)" />
              <Ico I={MapPin} x={12} y={12} s={12} />
              <T x={36} y={16} size={8} weight={800}>Sunset Point</T>
              <T x={36} y={27} size={6} color={MUTED}>{`${u.dist(leftMi)} ${u.distLabel} · ${tr("{0} min", [mins])} · ${etaText}`}</T>
              <rect x={248} y={8} width={48} height={20} rx={6} style={{ fill: A }} />
              <T x={272} y={21} anchor="middle" size={8} weight={900} color="#111">{tr("Go")}</T>
            </g>
          </g>
        )}
        <Tap p={[280, 174]} t={t} at={GO} />

        {/* Guidance */}
        {guiding > 0.01 && (
          <g opacity={guiding} transform={`translate(0 ${(-10 * (1 - guiding)).toFixed(1)})`}>
            <TurnBanner
              I={arrived ? Check : next.I}
              dist={arrived ? '' : u.ahead((next.d - rider.d) * FT)}
              text={arrived ? tr("You have arrived at {0}", ['Sunset Point']) : next.text}
              sub={arrived ? undefined : sub}
              call={call}
              t={t}
            />
          </g>
        )}
        <g opacity={camWarn}>
          <g transform="translate(8 42)">
            <rect width={20 + textW(tr("Speed camera ahead"))} height={17} rx={5} style={{ fill: PANEL, stroke: RED }} strokeWidth={0.8} />
            <Ico I={Eye} x={6} y={4} s={9} color={RED} />
            <T x={19} y={11.4}>{tr("Speed camera ahead")}</T>
          </g>
        </g>
        {guiding > 0.01 && <g opacity={guiding}><SpeedCard x={8} y={162} value={u.speed(mph)} unit={u.speedLabel} tone={speedTone} /></g>}

        {/* Heavy rain on the route: the app's warning, with its Dry route button */}
        <g opacity={toast} transform={`translate(0 ${(-6 * (1 - easeOut((t - OFFER) / 0.35))).toFixed(1)})`}>
          <g transform="translate(8 8)">
            <rect width={304} height={36} rx={8} style={{ fill: PANEL, stroke: `${SKY}88` }} strokeWidth={0.9} />
            <Ico I={CloudRain} x={8} y={7} s={11} color={SKY} />
            <T x={24} y={14} size={7} weight={800}>{tr("Heavy rain on your route in ~{0} min", [6])}</T>
            <T x={24} y={24} size={5.6} color={MUTED}>{tr("{0} mm/h forecast where you'll be. Want a route around it?", ['4.8'])}</T>
            <rect x={238} y={10} width={58} height={16} rx={5} style={{ fill: A }} />
            <T x={267} y={20.8} anchor="middle" size={6.4} weight={800} color="#111">{tr("Dry route")}</T>
          </g>
        </g>
        <Tap p={[275, 26]} t={t} at={TAKE} />
        <g opacity={finding}>
          <g transform={`translate(${(VW - findingW) / 2} 8)`}>
            <rect width={findingW} height={18} rx={6} style={{ fill: PANEL, stroke: `${SKY}66` }} strokeWidth={0.8} />
            <g transform={`rotate(${(t * 360) % 360} 13 9)`}>
              <Ico I={Loader2} x={8} y={4} s={10} color={SKY} />
            </g>
            <T x={22} y={11.8} size={7}>{tr("Finding a drier line…")}</T>
          </g>
        </g>
        <g opacity={done}>
          <g transform={`translate(${(VW - doneW) / 2} 8)`}>
            <rect width={doneW} height={18} rx={6} style={{ fill: PANEL, stroke: `${GREEN}88` }} strokeWidth={0.8} />
            <Ico I={Check} x={8} y={4.5} s={9} color={GREEN} />
            <T x={22} y={11.8} size={7}>{tr("Rerouted around the weather")}</T>
          </g>
        </g>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** For the tour: how long the navigation scene runs. */
export const NAVIGATION_SECONDS = NV_P;


// =============================================================================
// Roads worth riding, part two: a hazard reported in two taps; another rider
// two minutes behind is warned in time, eases right off past it, and is asked
// whether it's still there.
// =============================================================================

const HZ_P = 11.5;
/** Scene units to feet, and scene speed to mph, for this stretch of road. */
const HZ_FT = 8;
const HZ_MPH = 0.5;

const HZ_SLICK: Pt = [190, 112];
const hollow = new Road(
  'major',
  [[-320, 162], [-250, 150], [-180, 140], [-100, 152], [-20, 136], [60, 120], [130, 128], HZ_SLICK, [250, 96], [320, 104], [390, 90], [460, 100], [540, 84], [620, 92], [720, 80], [860, 86]],
  { name: 'Hollow Lane', labelAt: 0.3 },
);
const HZ_ROADS = [
  hollow,
  new Road('minor', [[60, 120], [70, 64], [92, 10], [100, -60]], { name: 'Kiln Road', labelAt: 0.4 }),
  new Road('minor', [[320, 104], [330, 160], [352, 230], [360, 300]]),
  new Road('minor', [[-180, 140], [-176, 196], [-190, 260]]),
  new Road('minor', [[-100, 152], [-112, 90], [-140, 40]]),
  new Road('minor', [[540, 84], [548, 30], [580, -30]]),
];
const HZ_VILLAGE: Pt[] = [[-330, 96], [-150, 92], [-60, 110], [-40, 200], [-160, 240], [-330, 230]];
const HZ_MAP: MapDef = {
  areas: [
    { kind: 'town', pts: HZ_VILLAGE },
    { kind: 'wood', pts: [[120, 60], [200, 40], [280, 56], [300, 80], [230, 84], [150, 96]] },
    { kind: 'wood', pts: [[150, 150], [240, 130], [300, 140], [290, 196], [180, 210]] },
    { kind: 'park', pts: [[380, 120], [450, 116], [470, 160], [400, 170]] },
    { kind: 'wood', pts: [[560, 110], [660, 104], [700, 150], [600, 170]] },
  ],
  rivers: [{ pts: [[430, -80], [418, 20], [428, 96], [416, 180], [432, 300]], w: 7 }],
  roads: HZ_ROADS,
  blocks: [hollow, ...HZ_ROADS.slice(3, 5)].flatMap((road, i) => blocksAlong(road, { within: HZ_VILLAGE, avoid: HZ_ROADS, seed: 40 + i, every: 8 })),
  places: [{ text: 'Kilnford', at: [-200, 214], size: 7 }],
};

const HZ_PATH = new Path(hollow.pts);
const HZ_AT = HZ_PATH.near(HZ_SLICK);

const HZ_REPORT = 1.25;
const HZ_CAT = 2.05;
const HZ_KIND = 2.75;
const HZ_DROP = 3.05;
const HZ_LATER = 4.4;

/** You: past the spill, a touch slower over it, then on your way. */
const HZ_YOU = new Drive(HZ_PATH, [
  { d: HZ_AT - 80, v: 92 },
  { d: HZ_AT - 20, v: 70 },
  { d: HZ_AT + 20, v: 72 },
  { d: HZ_AT + 80, v: 96 },
]);
/** The report goes where you were when you tapped Report, just past the spill. */
const HZ_REP_D = HZ_YOU.at(HZ_REPORT).d;
const HZ_PIN = HZ_PATH.point(HZ_REP_D);

/** Two minutes later: warned well before it, right down to 25 past the spill and the pin, then back up to speed. */
const HZ_WARN_D = HZ_AT - 160;
const HZ_THEM = new Drive(
  HZ_PATH,
  [
    { d: HZ_AT - 330, v: 112 },
    { d: HZ_WARN_D, v: 112 },
    { d: HZ_AT - 40, v: 50 },
    { d: HZ_REP_D + 10, v: 50 },
    { d: HZ_REP_D + 90, v: 104 },
  ],
  3.9,
);

const HZ_WARN = HZ_THEM.when(HZ_WARN_D);
const HZ_PASSED = HZ_THEM.when(HZ_REP_D + 4);
const HZ_ASK = HZ_PASSED + 0.5;
const HZ_YES = HZ_ASK + 0.85;

const HZ_CUES: SceneCue[] = [
  [HZ_REPORT, 'tap'],
  [HZ_CAT, 'tap'],
  [HZ_KIND, 'tap'],
  [HZ_DROP + 0.1, 'success'],
  [HZ_LATER, 'whoosh'],
  [HZ_WARN, 'caution'],
  [HZ_ASK, 'ping'],
  [HZ_YES, 'tap'],
];

function hzCam(t: number): Cam {
  // After the tap the camera stays with the report as you ride on, so the pin is seen landing.
  if (t >= HZ_REPORT + 0.2 && t < HZ_LATER + 0.25) return { x: HZ_PIN[0] + 26, y: HZ_PIN[1] - 6, z: 1.2 };
  const who = t < HZ_LATER + 0.25 ? HZ_YOU.at(t) : HZ_THEM.at(t);
  const rad = (who.a * Math.PI) / 180;
  // A little ahead of the rider, so the road they're about to ride is on screen (and half a second's travel more,
  // since the camera averages where it was over the last second).
  const lead = 36 + who.v * 0.45;
  return { x: who.p[0] + Math.cos(rad) * lead, y: who.p[1] + Math.sin(rad) * lead - 4, z: 1.2 };
}

const SURFACE = HAZARD_CATEGORIES.find((c) => c.id === 'surface') ?? HAZARD_CATEGORIES[0];
const OIL = HAZARD_TYPES.find((h) => h.kind === 'oil') ?? HAZARD_TYPES[0];

/** Font size that fits `label` into `maxW` scene units (never above `size`). */
const fitText = (label: string, maxW: number, size: number) => Math.min(size, maxW / Math.max(1, textW(label, 1)));

/** The hazard's pin on the map, in its category's colour with its icon. */
function HazardPin({ p, k, warn, t }: { p: Pt; k: number; warn: number; t: number }) {
  return (
    <g transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${Math.max(0.001, k).toFixed(3)})`}>
      {warn > 0 && <Rings p={[0, -10]} phase={frac(t * 1.1)} color={SURFACE.color} max={16} />}
      <g transform="translate(-8 -21)">
        <path d="M2 0 H14 A2 2 0 0 1 16 2 V13 A2 2 0 0 1 14 15 H11 L8 19 L5 15 H2 A2 2 0 0 1 0 13 V2 A2 2 0 0 1 2 0 Z" fill={SURFACE.color} stroke="rgba(0,0,0,0.85)" strokeWidth={0.8} />
        <Ico I={OIL.icon} x={3} y={2.5} s={10} color="#fff" sw={2.4} />
      </g>
    </g>
  );
}

/** A small notice at the top, centred: an icon, a line and an optional second line. */
function Notice({ I, color, title, sub, opacity }: { I: typeof Check; color: string; title: string; sub?: string; opacity: number }) {
  if (opacity <= 0.01) return null;
  const w = 28 + Math.max(textW(title, 7), sub ? textW(sub, 5.6) : 0);
  const h = sub ? 28 : 18;
  return (
    <g opacity={opacity} transform={`translate(${((VW - w) / 2).toFixed(1)} 8)`}>
      <rect width={w} height={h} rx={7} style={{ fill: PANEL, stroke: `${color}88` }} strokeWidth={0.8} />
      <Ico I={I} x={8} y={(h - 9) / 2} s={9} color={color} />
      <T x={22} y={sub ? 12 : 11.8} size={7} weight={sub ? 800 : 600}>{title}</T>
      {sub && <T x={22} y={21.5} size={5.6} color={MUTED}>{sub}</T>}
    </g>
  );
}

export function HazardScene() {
  const id = useIds();
  const u = useSceneUnits();
  const me = useRiderLetter();
  const t = loopT(useSceneTime(0), HZ_P);
  const layers = useMemo(() => <MapLayers map={HZ_MAP} id={id} />, [id]);
  const cam = follow(hzCam, t, 0.9, 12);
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (HZ_P - 0.45)) / 0.45));
  const later = t >= HZ_LATER + 0.25;
  const you = HZ_YOU.at(t);
  const them = HZ_THEM.at(t);
  const rider = later ? them : you;
  const mph = rider.v * (later ? HZ_MPH : HZ_MPH * 1.1);
  const speedTone = mph >= u.red ? RED : mph >= u.amber ? AMBER : INK;

  // The spill on the road, and its pin once reported.
  const pinAt = toScreen(cam, HZ_PIN);
  const roadA = HZ_PATH.at(HZ_AT).a;
  const pinK = easeOutBack((t - HZ_DROP) / 0.45);

  // Your report: the button, the two-step picker, the confirmation.
  const picker = win(t, HZ_REPORT + 0.15, HZ_KIND + 0.3, 0.25);
  const pickedCat = t >= HZ_CAT;
  const reported = win(t, HZ_DROP + 0.05, HZ_LATER, 0.3);
  const reportBtn = 1 - smooth((t - HZ_LATER) / 0.3);

  // Theirs: the warning in the search bar's place, easing off past it, then asked.
  const warn = t >= HZ_WARN && them.d < HZ_REP_D + 2 ? 1 : 0;
  const warnK = win(t, HZ_WARN, HZ_PASSED, 0.25);
  const toGo = Math.max(0, (HZ_REP_D - them.d) * HZ_FT);
  const ask = win(t, HZ_ASK, HZ_YES + 0.35, 0.25);
  const thanks = win(t, HZ_YES + 0.2, HZ_P - 0.3, 0.3);
  const titleK = win(t, HZ_LATER - 0.05, HZ_WARN - 0.05, 0.3);
  const laterLabel = tr("Two minutes later");

  return (
    <Frame sound={{ t, cues: HZ_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={200} fill={BG} />
      <g opacity={fade}>
        <g transform={camT(cam)}>
          {layers}
          {/* The spill itself: a dark sheen across the lane */}
          <g transform={`translate(${HZ_SLICK[0]} ${HZ_SLICK[1]}) rotate(${roadA.toFixed(1)})`}>
            <ellipse rx={5.6} ry={2.4} fill="#060606" />
            <ellipse rx={4.2} ry={1.6} fill="none" stroke="#7c5cff" strokeOpacity={0.55} strokeWidth={0.5} />
            <ellipse rx={2.8} ry={1} fill="none" stroke="#2dd4bf" strokeOpacity={0.45} strokeWidth={0.4} />
          </g>
        </g>
        {t >= HZ_DROP && <HazardPin p={pinAt} k={pinK} warn={warn ? warnK : 0} t={t} />}
        {later ? <Pin p={toScreen(cam, them.p)} letter="S" member={MEMBER.blue} /> : <Pin p={toScreen(cam, you.p)} letter={me} />}

        {/* The Report button, over the speed card */}
        <g opacity={reportBtn}>
          <g transform="translate(8 138)">
            <rect width={52} height={18} rx={9} style={{ fill: PANEL, stroke: 'hsl(var(--accent) / 0.55)' }} strokeWidth={0.9} />
            <Ico I={Megaphone} x={7} y={4.5} s={9} />
            <T x={19} y={12.2} size={6.6} weight={700}>{tr("Report")}</T>
          </g>
        </g>
        <Tap p={[34, 147]} t={t} at={HZ_REPORT} />
        <SpeedCard x={8} y={162} value={u.speed(mph)} unit={u.speedLabel} tone={speedTone} />

        {/* The picker: category, then what it is */}
        {picker > 0.01 && (
          <g opacity={picker} transform={`translate(0 ${(30 * (1 - easeOut((t - HZ_REPORT - 0.15) / 0.35))).toFixed(1)})`}>
            <g transform="translate(66 52)">
              <rect width={188} height={140} rx={12} style={{ fill: PANEL, stroke: 'rgba(255,255,255,0.12)' }} strokeWidth={0.8} />
              <T x={12} y={17} size={8} weight={800}>{pickedCat ? SURFACE.label : tr("Report a hazard")}</T>
              {(pickedCat
                ? HAZARD_TYPES.filter((h) => h.category === 'surface').slice(0, 4).map((h) => ({ key: h.kind, label: h.label, Icon: h.icon, color: SURFACE.color, on: h.kind === 'oil' && t >= HZ_KIND }))
                : HAZARD_CATEGORIES.map((c) => ({ key: c.id, label: c.label, Icon: c.icon, color: c.color, on: c.id === 'surface' && t >= HZ_CAT - 0.2 }))
              ).map((item, i) => {
                // Long names ("Debris on the road" in German) take two lines before they shrink.
                const name = fitLines(item.label, 48, 6.6, 2);
                const top = 22 - ((name.lines.length - 1) * (name.size + 1.2)) / 2;
                return (
                  <g key={item.key} transform={`translate(${10 + (i % 2) * 86} ${26 + Math.floor(i / 2) * 44})`}>
                    <rect width={82} height={38} rx={8} fill={item.color} fillOpacity={item.on ? 0.35 : 0.12} stroke={item.color} strokeOpacity={item.on ? 1 : 0.55} strokeWidth={1.1} />
                    <rect x={7} y={10} width={18} height={18} rx={5} fill={item.color} />
                    <Ico I={item.Icon} x={11} y={14} s={10} color="#fff" />
                    {name.lines.map((l, k) => (
                      <T key={k} x={30} y={top + k * (name.size + 1.2)} size={name.size} weight={700}>{l}</T>
                    ))}
                  </g>
                );
              })}
              <T x={94} y={132} anchor="middle" size={fitText(tr("Reports are anonymous and placed where you are now."), 176, 4.8)} color={MUTED}>{tr("Reports are anonymous and placed where you are now.")}</T>
            </g>
          </g>
        )}
        <Tap p={[117, 97]} t={t} at={HZ_CAT} />
        <Tap p={[117, 97]} t={t} at={HZ_KIND} />
        <Notice I={Check} color={GREEN} title={tr("{0} reported", [OIL.label])} sub={tr("Riders coming this way will be warned.")} opacity={reported} />

        {/* Two minutes later, another rider's phone */}
        <g opacity={titleK}>
          <g transform={`translate(${(VW - (16 + textW(laterLabel, 8))) / 2} 10)`}>
            <rect width={16 + textW(laterLabel, 8)} height={20} rx={10} fill="#000" fillOpacity={0.7} stroke="rgba(255,255,255,0.18)" strokeWidth={0.8} />
            <T x={8} y={13.6} size={8} weight={800}>{laterLabel}</T>
          </g>
        </g>

        {/* Their warning, in the search bar's slot */}
        <g opacity={warnK} transform={`translate(0 ${(-8 * (1 - easeOut((t - HZ_WARN) / 0.3))).toFixed(1)})`}>
          <g transform="translate(8 8)">
            <rect width={304} height={30} rx={9} style={{ fill: PANEL, stroke: SURFACE.color }} strokeWidth={1.4} />
            <rect x={5} y={4} width={22} height={22} rx={6} fill={SURFACE.color} />
            <Ico I={OIL.icon} x={10} y={9} s={12} color="#fff" sw={2.4} />
            <T x={33} y={14} size={8} weight={800}>{OIL.label}</T>
            <T x={33} y={24} size={6} color={MUTED}>{`${u.ahead(toGo)} ${tr("ahead")}`}</T>
            <g transform="translate(286 11)">
              {[0, 1, 2, 3].map((i) => {
                const h = 2 + 6 * win(t, HZ_WARN, HZ_WARN + 1.8, 0.2) * Math.abs(Math.sin(t * 11 + i * 1.6));
                return <rect key={i} x={i * 2.6 - 4} y={4 - h / 2} width={1.5} height={h} rx={0.75} fill={SURFACE.color} />;
              })}
            </g>
          </g>
        </g>

        {/* Past it: still there? */}
        {ask > 0.01 && (
          <g opacity={ask} transform={`translate(0 ${(12 * (1 - easeOut((t - HZ_ASK) / 0.3))).toFixed(1)})`}>
            <g transform="translate(70 140)">
              <rect width={180} height={50} rx={11} style={{ fill: PANEL, stroke: 'rgba(255,255,255,0.12)' }} strokeWidth={0.8} />
              <T x={90} y={14} anchor="middle" size={fitText(`${OIL.label}${tr(": still there?")}`, 164, 7)} weight={700}>{`${OIL.label}${tr(": still there?")}`}</T>
              <rect x={9} y={22} width={78} height={20} rx={7} style={{ fill: A }} />
              <Ico I={ThumbsUp} x={30} y={27.5} s={9} color="#111" />
              <T x={53} y={35} anchor="middle" size={7.5} weight={800} color="#111">{tr("Yes")}</T>
              <rect x={93} y={22} width={78} height={20} rx={7} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
              <Ico I={ThumbsDown} x={112} y={27.5} s={9} color={INK} />
              <T x={137} y={35} anchor="middle" size={7.5} weight={800}>{tr("Gone")}</T>
            </g>
          </g>
        )}
        <Tap p={[118, 172]} t={t} at={HZ_YES} />
        <Notice I={Check} color={GREEN} title={tr("Thanks, others will be warned")} opacity={thanks} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** For the tour: how long the hazard scene runs. */
export const HAZARD_SECONDS = HZ_P;


// =============================================================================
// Got your back: a crash on a bend of Hollow Lane. A hard knock and a stop, the
// app asks "Are you okay?", nobody answers, the rescue call goes out with the
// siren, and Jake, riding nearby, taps "I'm on my way" and is routed straight
// to the spot along the roads.
// =============================================================================

const RS_P = 14;
const RS_MPH = 0.5;
const RS_CRASH: Pt = [250, 96];
const RS_HIT_D = HZ_PATH.near(RS_CRASH);
/** Where the bike ends up: off the outside of the bend. */
const RS_REST: Pt = [262, 110];
const RS_HIT = 3.0;
const RS_ASK = 3.4;
const RS_SENT = 6.6;
const RS_JAKE_SEES = 8.7;
const RS_ON_MY_WAY = 9.6;

/** You, up to the moment it goes wrong. */
const RS_YOU = new Drive(HZ_PATH.until(RS_HIT_D), [
  { d: RS_HIT_D - 290, v: 96 },
  { d: RS_HIT_D - 30, v: 96 },
  { d: RS_HIT_D, v: 90 },
]);
const RS_YOU_AT_HIT = RS_YOU.when(RS_HIT_D - 0.5);

const kiln = HZ_ROADS[1];
/** Jake's way to you: down Kiln Road and along Hollow Lane, the route the app draws for him. */
const RS_JAKE_PATH = Path.along([
  [kiln, [92, 10], [60, 120]],
  [hollow, [60, 120], RS_CRASH],
]);
const RS_JAKE = new Drive(RS_JAKE_PATH, [
  { d: 0, v: 40, wait: RS_ON_MY_WAY + 0.2 },
  { d: 20, v: 92 },
  { d: RS_JAKE_PATH.near([60, 120]) - 14, v: 40 },
  { d: RS_JAKE_PATH.near([60, 120]) + 10, v: 46 },
  { d: RS_JAKE_PATH.near([60, 120]) + 40, v: 100 },
  { d: RS_JAKE_PATH.len - 30, v: 90 },
  { d: RS_JAKE_PATH.len, v: 6 },
]);
const RS_JAKE_HERE = RS_JAKE.when(RS_JAKE_PATH.len - 1);

const RS_CUES: SceneCue[] = [
  [RS_HIT, 'impact'],
  [RS_ASK, 'caution'],
  [RS_SENT, 'radioIn'],
  [RS_SENT + 0.2, 'siren'],
  [RS_SENT + 1.7, 'siren'],
  [RS_JAKE_SEES, 'ping'],
  [RS_ON_MY_WAY, 'tap'],
  [RS_ON_MY_WAY + 0.2, 'success'],
  [RS_JAKE_HERE, 'success'],
];

/** Where you are: riding, then sliding off the bend to a stop. */
function rsYou(t: number): { p: Pt; v: number } {
  if (t < RS_YOU_AT_HIT) {
    const r = RS_YOU.at(t);
    return { p: r.p, v: r.v };
  }
  const k = easeOut((t - RS_YOU_AT_HIT) / 0.6);
  return { p: [lerp(RS_CRASH[0], RS_REST[0], k), lerp(RS_CRASH[1], RS_REST[1], k)], v: 90 * (1 - k) };
}

function rsCam(t: number): Cam {
  if (t < RS_YOU_AT_HIT) {
    const r = RS_YOU.at(t);
    const rad = (r.a * Math.PI) / 180;
    const lead = 30 + r.v * 0.45;
    return { x: r.p[0] + Math.cos(rad) * lead, y: r.p[1] + Math.sin(rad) * lead, z: 1.2 };
  }
  // Holds on the crash; then pulls out to find Jake, and keeps you both in frame as he comes.
  const crash = { x: RS_REST[0], y: RS_REST[1] - 4, z: 1.4 };
  const jake = RS_JAKE.at(t).p;
  const dist = Math.hypot(jake[0] - RS_REST[0], jake[1] - RS_REST[1]);
  const both = { x: (jake[0] + RS_REST[0]) / 2, y: (jake[1] + RS_REST[1]) / 2 + 4, z: Math.max(0.68, Math.min(1.4, 150 / Math.max(1, dist))) };
  const w = smooth((t - RS_JAKE_SEES + 0.9) / 1.2);
  return { x: lerp(crash.x, both.x, w), y: lerp(crash.y, both.y, w), z: lerp(crash.z, both.z, w) };
}

export function RescueScene() {
  const id = useIds();
  const u = useSceneUnits();
  const me = useRiderLetter();
  const name = useRiderName();
  const t = loopT(useSceneTime(0), RS_P);
  const layers = useMemo(() => <MapLayers map={HZ_MAP} id={id} />, [id]);
  const cam = follow(rsCam, t, 0.8, 10);
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (RS_P - 0.45)) / 0.45));
  const you = rsYou(t);
  const youAt = toScreen(cam, you.p);
  const jake = RS_JAKE.at(t);
  const jakeAt = toScreen(cam, jake.p);
  const crashed = t >= RS_YOU_AT_HIT;
  const flash = crashed ? 1 - clamp01((t - RS_YOU_AT_HIT) / 0.4) : 0;

  // The check: five minutes on the clock, run fast; nobody answers.
  const ask = win(t, RS_ASK, RS_SENT + 0.1, 0.3);
  const clock = Math.max(0, 300 - Math.floor(clamp01((t - RS_ASK) / (RS_SENT - RS_ASK)) * 300));
  const sent = t >= RS_SENT;
  const reachK = win(t, RS_SENT + 0.2, RS_JAKE_SEES + 0.6, 0.35);
  const jakeCard = win(t, RS_JAKE_SEES, RS_ON_MY_WAY + 0.5, 0.25);
  const coming = t >= RS_ON_MY_WAY;
  const routeK = easeInOut((t - RS_ON_MY_WAY - 0.15) / 0.7);
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const alertTitle = tr("{0} needs rescue!", [name]);
  const alertBody = fitLines(tr("Their location is marked on the map. Let them know you’re coming."), 96, 4.8, 2);

  // The G trace: the hit, then nothing (it stops scrolling once the bike's down, so the spike stays in view).
  const traceEnd = Math.min(t, RS_YOU_AT_HIT + 2.2);
  const gHist = Array.from({ length: 36 }, (_, i) => {
    const s = traceEnd - 3 + (i / 35) * 3;
    if (s < 0) return 1;
    const hit = s > RS_YOU_AT_HIT - 0.05 && s < RS_YOU_AT_HIT + 0.2;
    return hit ? 4.2 : s > RS_YOU_AT_HIT ? 0.05 : 1 + 0.1 * Math.sin(s * 9) + 0.05 * Math.sin(s * 23);
  });
  const mph = you.v * RS_MPH;
  const reach = [
    { I: Users, label: tr("Convoy"), off: [-62, -28] as Pt },
    { I: Shield, label: tr("Crew"), off: [-20, -58] as Pt },
    { I: MessageSquare, label: 'Discord', off: [38, -52] as Pt },
    { I: Handshake, label: tr("Riders nearby"), off: [70, -12] as Pt },
  ];

  return (
    <Frame sound={{ t, cues: RS_CUES }}>
      <Defs id={id} />
      <rect width={VW} height={200} fill={BG} />
      <g opacity={fade}>
        <g transform={camT(cam)}>
          {layers}
          {/* The skid off the bend */}
          {crashed && <path d={`M${RS_CRASH[0]} ${RS_CRASH[1]} L${you.p[0].toFixed(1)} ${you.p[1].toFixed(1)}`} stroke="#000" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />}
          {/* Jake's route to you, the burn-orange rescue line */}
          {coming && <RescueLine d={RS_JAKE_PATH.slice(jake.d, RS_JAKE_PATH.len)} pulse={pulse} />}
          {coming && routeK < 1 && <path d={RS_JAKE_PATH.slice(0, RS_JAKE_PATH.len)} fill="none" stroke="white" strokeOpacity={0.5 * (1 - routeK)} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </g>
        {sent && <Rings p={youAt} phase={frac(t * 0.9)} color={BURN} max={30} count={3} />}
        {flash > 0 && <circle cx={youAt[0]} cy={youAt[1]} r={8 + (1 - flash) * 18} fill={RED} opacity={0.4 * flash} />}
        {/* Everyone the call reaches */}
        {reachK > 0.01 &&
          reach.map((r, i) => {
            const k = easeOutBack((t - RS_SENT - 0.25 - i * 0.22) / 0.4);
            if (k <= 0) return null;
            const p: Pt = [youAt[0] + r.off[0], youAt[1] + r.off[1]];
            return (
              <g key={i} opacity={reachK * clamp01(k)}>
                <line x1={youAt[0]} y1={youAt[1]} x2={p[0]} y2={p[1]} style={{ stroke: BURN }} strokeOpacity={0.45} strokeDasharray="2 3" />
                <g transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${Math.max(0.001, k).toFixed(3)})`}>
                  <circle r={9.5} fill={PANEL} style={{ stroke: BURN }} strokeWidth={1} />
                  <Ico I={r.I} x={-5} y={-5} s={10} color={BURN} />
                  <T x={0} y={18} anchor="middle" size={5.6} color={INK}>{r.label}</T>
                </g>
              </g>
            );
          })}
        <Pin p={youAt} letter={me} />
        {(t >= RS_JAKE_SEES - 0.6) && <Pin p={jakeAt} letter="J" member={MEMBER.blue} opacity={clamp01((t - RS_JAKE_SEES + 0.6) / 0.4)} />}

        {/* G-force: the hit */}
        <g transform="translate(8 8)">
          <rect width={64} height={30} rx={7} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
          <T x={6} y={10} size={5.2} color={MUTED}>{tr("G-force")}</T>
          <polyline
            points={gHist.map((g, i) => `${(6 + i * 1.5).toFixed(1)},${(26 - Math.min(g, 4.4) * 3.4).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={crashed ? RED : '#b4b4bb'}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </g>
        <SpeedCard x={8} y={162} value={u.speed(mph)} unit={u.speedLabel} tone={crashed && mph < 1 ? RED : INK} />

        {/* Rescue out: who's coming, and the siren for anyone nearby */}
        {sent && (
          <g opacity={smooth((t - RS_SENT) / 0.35)} transform="translate(80 8)">
            <rect width={232} height={30} rx={9} style={{ fill: 'hsl(var(--burn) / 0.16)', stroke: 'hsl(var(--burn) / 0.6)' }} strokeWidth={0.9} />
            <T x={9} y={12.5} size={7} weight={800} color={BURN}>{tr("Rescue request sent")}</T>
            <T x={9} y={23} size={5.8} color={INK}>{coming ? tr("{0} is on the way", ['Jake']) : tr("Waiting for your convoy to respond…")}</T>
            <g transform="translate(176 7)">
              <rect width={50} height={16} rx={5} fill={PANEL} stroke={RED} strokeWidth={0.8} />
              <Ico I={Siren} x={4} y={3.5} s={9} color={RED} />
              <g transform="translate(17 -0.5)">
                <Wave on={1} t={t} color={RED} n={4} />
              </g>
            </g>
          </g>
        )}

        {/* Are you okay? (the app's card: burn orange, the R, I'm okay and Send rescue, the clock) */}
        {ask > 0.01 && (
          <g opacity={ask} transform={`translate(160 100) scale(${(0.94 + 0.06 * easeOutBack((t - RS_ASK) / 0.35)).toFixed(3)}) translate(-160 -100)`}>
            <rect x={76} y={58} width={168} height={84} rx={12} style={{ fill: BURN }} opacity={0.1 + 0.06 * Math.sin(t * 6)} filter={`url(#${id('glow')})`} />
            <g transform="translate(80 62)">
              <rect width={160} height={76} rx={11} fill="#141012" style={{ stroke: BURN }} strokeWidth={1} />
              <circle cx={19} cy={17} r={10} style={{ fill: BURN }} />
              <T x={19} y={21} anchor="middle" size={11} weight={900} color="#fff">R</T>
              <T x={35} y={16.5} size={fitText(tr("Are you okay?"), 92, 10)} weight={900}>{tr("Are you okay?")}</T>
              <T x={35} y={25.5} size={fitText(tr("Rescue is sent when the clock runs out."), 116, 5)} color={MUTED}>{tr("Rescue is sent when the clock runs out.")}</T>
              <T x={152} y={16.5} anchor="end" size={8} weight={800} mono>{`${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`}</T>
              <rect x={8} y={33} width={144} height={3} rx={1.5} fill="white" fillOpacity={0.15} />
              <rect x={8} y={33} width={(144 * clock) / 300} height={3} rx={1.5} style={{ fill: BURN }} />
              <rect x={8} y={42} width={70} height={26} rx={7} fill="#059669" />
              <T x={43} y={58} anchor="middle" size={fitText(tr("I'm okay"), 62, 8.5)} weight={900} color="#fff">{tr("I'm okay")}</T>
              <rect x={82} y={42} width={70} height={26} rx={7} style={{ fill: BURN }} />
              <T x={117} y={58} anchor="middle" size={fitText(tr("Send rescue"), 62, 8.5)} weight={900} color="#fff">{tr("Send rescue")}</T>
            </g>
          </g>
        )}

        {/* On Jake's phone: the call, and his answer */}
        {jakeCard > 0.01 && (
          <g opacity={jakeCard} transform={`translate(0 ${(10 * (1 - easeOut((t - RS_JAKE_SEES) / 0.3))).toFixed(1)})`}>
            <g transform="translate(176 120)">
              <rect width={136} height={72} rx={10} fill="#b91c1c" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <circle cx={16} cy={16} r={8} fill="rgba(255,255,255,0.2)" />
              <Ico I={MapPin} x={11} y={11} s={10} color="#fff" />
              <T x={30} y={14} size={fitText(alertTitle, 82, 7)} weight={800} color="#fff">{alertTitle}</T>
              {alertBody.lines.map((l, k) => (
                <T key={k} x={30} y={23 + k * (alertBody.size + 1.4)} size={alertBody.size} color="rgba(255,255,255,0.8)">
                  {l}
                </T>
              ))}
              <rect x={8} y={44} width={120} height={20} rx={6} fill={BG} />
              <Ico I={Navigation} x={30} y={49.5} s={9} color={INK} />
              <T x={74} y={57} anchor="middle" size={6.6} weight={800}>{tr("I'm on my way")}</T>
              <g transform="translate(116 6)">
                <Pin p={[6, 6]} letter="J" member={MEMBER.blue} r={5} />
              </g>
            </g>
          </g>
        )}
        <Tap p={[244, 174]} t={t} at={RS_ON_MY_WAY} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

/** For the tour: how long the rescue scene runs. */
export const RESCUE_SECONDS = RS_P;
