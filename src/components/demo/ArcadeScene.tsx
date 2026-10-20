import { Fuel, Gamepad2, Gauge } from 'lucide-react';
import { tr } from '@/lib/i18n';
import {
  A,
  aa,
  BG,
  INK,
  MUTED,
  PANEL,
  LINE,
  ROAD,
  RED,
  GREEN,
  SKY,
  AMBER,
  Frame,
  Base,
  Defs,
  Vignette,
  Chip,
  Ico,
  T,
  useIds,
  useSceneTime,
  loopT,
  clamp01,
  easeInOut,
  easeOut,
  easeOutBack,
  lerp,
  textW,
  win,
  type Pt,
  type SceneCue,
} from '@/components/scene/kit';

/*
 * The arcade, one game at a time: each tile plays a short round of its game in
 * turn (a punch on Hit Heavy, a late lane change and a fuel can on Petrol Head,
 * a rival run into a wall on Gridlock, a round won in SwitchBack), then rests on
 * how it ended. Drawn for the tour, never the games themselves.
 */

/** Each game's turn, in seconds. */
const SLOT = 2.6;
/** Product names stay in English. */
const GAMES = ['Hit Heavy', 'Petrol Head', 'Gridlock', 'SwitchBack'] as const;
export const ARCADE_SECONDS = SLOT * GAMES.length;
const TILE = { w: 148, h: 74 };
/** Where a game still waiting its turn sits: its opening moment, everything on the tile. */
const IDLE = [0, 0.4, 0.3, 0.36];

// Hit Heavy: one punch, the needle and the arc rise together to the peak.
const HH_HIT = 0.55;
const HH_PEAK = 7.8;
// Petrol Head: three lanes; a car comes up fast in the rider's lane, a late swerve, a near miss, then fuel.
const LANES = [49.5, 74.5, 99.5];
const PH_SWERVE = 0.68;
const PH_PASS = 1.1;
const PH_FUEL = 1.9;
const PH_ROAD = { x: 37, y: 20, w: 75, h: 50 };
const PH_CAR = { w: 12, h: 18, y: 47 };
// Gridlock: orange cuts across and turns down; blue runs into its wall.
const GL_ORANGE: Pt[] = [[16, 58], [52, 58], [52, 30], [100, 30], [100, 62], [70, 62]];
const GL_BLUE: Pt[] = [[131, 56], [116, 56], [116, 40], [100, 40]];
const GL_ORANGE_V = 62;
const GL_CRASH = 2.1;
// SwitchBack: Speed is drawn, 81 beats 70, the rival's card takes the hit.
const BG_HIT = 1.2;
const BG_DAMAGE = Math.round(35 + 0.8 * (81 - 70));

const CUES: SceneCue[] = [
  [HH_HIT, 'impact'],
  [SLOT + PH_PASS, 'beep'],
  [SLOT + PH_FUEL, 'coin'],
  [SLOT * 2 + GL_CRASH, 'impact'],
  [SLOT * 3 + 0.4, 'tap'],
  [SLOT * 3 + BG_HIT, 'impact'],
  [SLOT * 3 + 1.9, 'success'],
];

const polyLen = (pts: Pt[]) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const GL_BLUE_V = polyLen(GL_BLUE) / GL_CRASH;

/** `d` units along a polyline: where the head is, and the line behind it. */
function along(pts: Pt[], d: number): { head: Pt; done: Pt[] } {
  const done: Pt[] = [pts[0]];
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len) {
      const r = len ? left / len : 0;
      const head: Pt = [lerp(a[0], b[0], r), lerp(a[1], b[1], r)];
      done.push(head);
      return { head, done };
    }
    left -= len;
    done.push(b);
  }
  return { head: pts[pts.length - 1], done };
}

const line = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** A word that floats up and fades over a game, like the games' own pop-ups. */
function Pop({ x, y, s, at, label, color }: { x: number; y: number; s: number; at: number; label: string; color: string }) {
  if (s < at) return null;
  const k = clamp01((s - at) / 0.9);
  return (
    <T x={x} y={y - 9 * easeOut(k)} anchor="middle" size={6.5} weight={900} color={color} opacity={1 - k * k}>
      {label}
    </T>
  );
}

function HitHeavy({ s, id }: { s: number; id: (n: string) => string }) {
  const v = HH_PEAK * easeOut((s - HH_HIT) / 0.6);
  const C: Pt = [42, 60];
  const R = 24;
  // The dial runs from 0 G on the left to 10 G on the right, over the top.
  const on = (g: number, r = R): Pt => {
    const a = ((180 - 18 * g) * Math.PI) / 180;
    return [C[0] + r * Math.cos(a), C[1] - r * Math.sin(a)];
  };
  const end = on(v);
  const tip = on(v, R - 7);
  const shock = s >= HH_HIT ? clamp01((s - HH_HIT) / 0.45) : 0;
  const jolt = s >= HH_HIT ? Math.sin((s - HH_HIT) * 50) * 1.6 * (1 - clamp01((s - HH_HIT) / 0.3)) : 0;
  const rank = tr("Haymaker");
  const rankK = easeOutBack((s - 1.3) / 0.4);
  const rankW = textW(rank, 6) + 12;
  return (
    <g>
      {shock > 0 && shock < 1 && (
        <circle cx={C[0]} cy={C[1] - 8} r={8 + shock * 30} fill="none" style={{ stroke: A }} strokeWidth={1.4} opacity={0.7 * (1 - shock)} />
      )}
      <path d={`M${C[0] - R} ${C[1]} A${R} ${R} 0 0 1 ${C[0] + R} ${C[1]}`} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={5} strokeLinecap="round" />
      {[0, 2.5, 5, 7.5, 10].map((g) => {
        const a = on(g, R + 5);
        const b = on(g, R + 7.5);
        return <line key={g} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="white" strokeOpacity={0.35} strokeWidth={0.8} />;
      })}
      {v > 0.02 && (
        <path
          d={`M${C[0] - R} ${C[1]} A${R} ${R} 0 0 1 ${end[0].toFixed(2)} ${end[1].toFixed(2)}`}
          fill="none"
          style={{ stroke: A }}
          strokeWidth={5}
          strokeLinecap="round"
          filter={`url(#${id('glow')})`}
        />
      )}
      <line x1={C[0]} y1={C[1]} x2={tip[0]} y2={tip[1]} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={C[0]} cy={C[1]} r={3} style={{ fill: A }} />
      <g transform={`translate(${jolt.toFixed(2)} 0)`}>
        <T x={118} y={43} anchor="end" size={19} weight={900} mono>{v.toFixed(1)}</T>
        <T x={120} y={43} size={8} weight={800} color={MUTED}>G</T>
      </g>
      <T x={110} y={52} anchor="middle" size={5.5} color={MUTED}>{s < HH_HIT ? tr("Get ready") : tr("Peak")}</T>
      {rankK > 0 && (
        <g transform={`translate(110 62) scale(${Math.max(0.01, rankK).toFixed(3)})`} opacity={clamp01(rankK)}>
          <rect x={-rankW / 2} y={-6} width={rankW} height={11} rx={5.5} style={{ fill: aa(0.16), stroke: A }} strokeWidth={0.8} />
          <T x={0} y={2} anchor="middle" size={6} weight={800} color={A}>{rank}</T>
        </g>
      )}
    </g>
  );
}

function Car({ x, y, color, tilt = 0, rider }: { x: number; y: number; color: string; tilt?: number; rider?: boolean }) {
  return (
    <g transform={`rotate(${tilt.toFixed(2)} ${x} ${y + PH_CAR.h / 2})`}>
      <rect x={x - PH_CAR.w / 2} y={y} width={PH_CAR.w} height={PH_CAR.h} rx={3} style={{ fill: color }} stroke={rider ? INK : 'none'} strokeWidth={0.6} />
      <rect x={x - 4} y={y + (rider ? 4 : 10)} width={8} height={4} rx={1} fill={BG} opacity={0.75} />
    </g>
  );
}

function PetrolHead({ s, id }: { s: number; id: (n: string) => string }) {
  const swerve = easeInOut((s - PH_SWERVE) / 0.26);
  const px = lerp(LANES[1], LANES[0], swerve);
  const tilt = -10 * Math.sin(clamp01((s - PH_SWERVE) / 0.26) * Math.PI);
  // The car coming up in the rider's lane draws level just after the swerve.
  const fastY = PH_CAR.y + (s - (PH_PASS + 0.12)) * 78;
  const slowY = 6 + s * 22;
  const canY = PH_CAR.y - 8 + (s - PH_FUEL) * 70;
  const got = s >= PH_FUEL;
  const before = 0.5 - 0.07 * Math.min(s, PH_FUEL);
  const fuel = got ? lerp(before, 0.95, easeOut((s - PH_FUEL) / 0.35)) : before;
  const fuelColor = fuel < 0.35 ? AMBER : GREEN;
  const clip = id('ph-road');
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x={PH_ROAD.x} y={PH_ROAD.y} width={PH_ROAD.w} height={PH_ROAD.h} rx={2} />
        </clipPath>
      </defs>
      <rect x={PH_ROAD.x} y={PH_ROAD.y} width={PH_ROAD.w} height={PH_ROAD.h} rx={2} fill={ROAD} />
      <g clipPath={`url(#${clip})`}>
        {[62, 87].map((x) => (
          <line key={x} x1={x} y1={PH_ROAD.y - 13} x2={x} y2={PH_ROAD.y + PH_ROAD.h} stroke="white" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="7 6" strokeDashoffset={(-s * 60).toFixed(1)} />
        ))}
        <Car x={LANES[2]} y={slowY} color="#8a8a93" />
        <Car x={LANES[1]} y={fastY} color={INK} />
        {!got && (
          <g transform={`translate(${LANES[0] - 4} ${canY})`}>
            <rect width={8} height={9} rx={1.5} fill={GREEN} />
            <rect x={2} y={-2} width={4} height={2.4} rx={0.6} fill={GREEN} />
          </g>
        )}
        <Car x={px} y={PH_CAR.y} color={A} tilt={tilt} rider />
      </g>
      <line x1={PH_ROAD.x} y1={PH_ROAD.y} x2={PH_ROAD.x} y2={PH_ROAD.y + PH_ROAD.h} stroke="white" strokeOpacity={0.4} />
      <line x1={PH_ROAD.x + PH_ROAD.w} y1={PH_ROAD.y} x2={PH_ROAD.x + PH_ROAD.w} y2={PH_ROAD.y + PH_ROAD.h} stroke="white" strokeOpacity={0.4} />
      <Pop x={px} y={42} s={s} at={PH_PASS} label={tr("Near miss")} color={A} />
      <Pop x={px} y={44} s={s} at={PH_FUEL} label={tr("+ Fuel")} color={GREEN} />
      {/* The fuel gauge */}
      <rect x={125} y={22} width={6} height={40} rx={3} fill="white" fillOpacity={0.1} />
      <rect x={125} y={22 + 40 * (1 - fuel)} width={6} height={40 * fuel} rx={3} style={{ fill: fuelColor }} />
      <Ico I={Fuel} x={123.5} y={64} s={9} color={fuelColor} />
    </g>
  );
}

function Gridlock({ s, id }: { s: number; id: (n: string) => string }) {
  const orange = along(GL_ORANGE, s * GL_ORANGE_V);
  const blue = along(GL_BLUE, Math.min(s, GL_CRASH) * GL_BLUE_V);
  const crashK = s >= GL_CRASH ? clamp01((s - GL_CRASH) / 0.5) : 0;
  const gone = s >= GL_CRASH;
  return (
    <g>
      <rect x={9} y={21} width={130} height={46} rx={2} fill={aa(0.03)} stroke="white" strokeOpacity={0.12} strokeDasharray="3 3" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`v${i}`} x1={19 + i * 10} y1={22} x2={19 + i * 10} y2={66} stroke="white" strokeOpacity={0.04} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <line key={`h${i}`} x1={10} y1={31 + i * 10} x2={138} y2={31 + i * 10} stroke="white" strokeOpacity={0.04} />
      ))}
      <polyline points={line(orange.done)} fill="none" style={{ stroke: A }} strokeWidth={1.8} strokeLinejoin="round" filter={`url(#${id('glow')})`} />
      <circle cx={orange.head[0]} cy={orange.head[1]} r={2.4} style={{ fill: A }} />
      <circle cx={orange.head[0]} cy={orange.head[1]} r={1} fill="white" />
      <g opacity={gone ? 1 - 0.8 * crashK : 1}>
        <polyline points={line(blue.done)} fill="none" stroke={SKY} strokeWidth={1.8} strokeLinejoin="round" strokeDasharray={gone ? '2 2' : undefined} filter={`url(#${id('glow')})`} />
        {!gone && (
          <>
            <circle cx={blue.head[0]} cy={blue.head[1]} r={2.4} fill={SKY} />
            <circle cx={blue.head[0]} cy={blue.head[1]} r={1} fill="white" />
          </>
        )}
      </g>
      {gone && crashK < 1 && (
        <g opacity={1 - crashK}>
          <circle cx={blue.head[0]} cy={blue.head[1]} r={3 + 14 * crashK} fill="none" stroke={SKY} strokeWidth={1.4} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 + 0.3;
            const r0 = 3 + 6 * crashK;
            const r1 = r0 + 4;
            return (
              <line
                key={i}
                x1={blue.head[0] + Math.cos(a) * r0}
                y1={blue.head[1] + Math.sin(a) * r0}
                x2={blue.head[0] + Math.cos(a) * r1}
                y2={blue.head[1] + Math.sin(a) * r1}
                stroke="white"
                strokeWidth={1}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}
    </g>
  );
}

/** A SwitchBack card: its artwork, the drawn category's rating, and health under it. */
function GridCard({ x, y, art, edge, rating, show, hp }: { x: number; y: number; art: string; edge: string; rating: number; show: number; hp: number }) {
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <rect width={30} height={40} rx={3} fill="#141418" style={{ stroke: edge }} strokeWidth={1.3} />
      <rect x={2.5} y={2.5} width={25} height={20} rx={1.5} fill="#0b0b0e" />
      <image href={art} x={3} y={4} width={24} height={17} preserveAspectRatio="xMidYMid meet" style={{ imageRendering: 'pixelated' }} />
      <T x={15} y={34.5} anchor="middle" size={10} weight={900} mono opacity={show}>{rating}</T>
      <rect x={0} y={43} width={30} height={2.6} rx={1.3} fill="white" fillOpacity={0.12} />
      <rect x={0} y={43} width={30 * hp} height={2.6} rx={1.3} style={{ fill: hp < 0.6 ? AMBER : GREEN }} />
    </g>
  );
}

function SwitchBack({ s }: { s: number }) {
  const inL = easeOut(s / 0.35);
  const inR = easeOut((s - 0.08) / 0.35);
  const cat = easeOutBack((s - 0.4) / 0.35);
  const reveal = easeOut((s - 0.7) / 0.3);
  const lunge = s < BG_HIT ? easeInOut((s - 0.95) / 0.25) : 1 - easeOut((s - BG_HIT) / 0.35);
  const shake = s > BG_HIT ? Math.sin((s - BG_HIT) * 42) * 2.2 * (1 - clamp01((s - BG_HIT) / 0.45)) : 0;
  const hp = 1 - (BG_DAMAGE / 100) * easeOut((s - BG_HIT - 0.05) / 0.5);
  const flash = s >= BG_HIT ? 1 - clamp01((s - BG_HIT) / 0.25) : 0;
  const catLabel = tr("Speed");
  const catW = textW(catLabel, 6) + 18;
  return (
    <g>
      {cat > 0 && (
        <g transform={`translate(${TILE.w - 8 - catW / 2} 10) scale(${Math.max(0.01, cat).toFixed(3)})`} opacity={clamp01(cat)}>
          <rect x={-catW / 2} y={-6.5} width={catW} height={12} rx={6} style={{ fill: aa(0.16), stroke: A }} strokeWidth={0.8} />
          <Ico I={Gauge} x={-catW / 2 + 4} y={-4} s={7} />
          <T x={-catW / 2 + 13} y={2} size={6} weight={800} color={A}>{catLabel}</T>
        </g>
      )}
      <g transform={`rotate(${(5 * lunge).toFixed(2)} ${51 + 14 * lunge} 39)`}>
        <GridCard x={-40 * (1 - inL) + 36 + 14 * lunge} y={19} art="/switchback/bikes/firebladesbk.png" edge={A} rating={81} show={reveal} hp={1} />
      </g>
      <GridCard x={40 * (1 - inR) + 82 + shake} y={19} art="/switchback/cars/m3.png" edge="#9ca3af" rating={70} show={reveal} hp={hp} />
      {flash > 0 && <circle cx={84} cy={39} r={6 + 16 * (1 - flash)} fill="white" opacity={0.35 * flash} />}
      <Pop x={128} y={42} s={s} at={BG_HIT + 0.05} label={`−${BG_DAMAGE}`} color={RED} />
    </g>
  );
}

export function ArcadeScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), ARCADE_SECONDS);
  const active = Math.min(GAMES.length - 1, Math.floor(t / SLOT));
  const fade = clamp01(t / 0.4) * (1 - clamp01((t - (ARCADE_SECONDS - 0.45)) / 0.45));
  return (
    <Frame sound={{ t, cues: CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={fade}>
        <Chip x={8} y={7} label={tr("Arcade")} I={Gamepad2} />
        {GAMES.map((name, i) => {
          const x = 8 + (i % 2) * 156;
          const y = 35 + Math.floor(i / 2) * 80;
          // Played this time round: rests on how it ended; still to come: waits at the start.
          const s = i < active ? SLOT : i > active ? IDLE[i] : t - i * SLOT;
          const on = win(t, i * SLOT, (i + 1) * SLOT, 0.25);
          return (
            <g key={name} transform={`translate(${x} ${y})`}>
              <rect width={TILE.w} height={TILE.h} rx={6} style={{ fill: PANEL, stroke: on > 0.01 ? aa(0.2 + 0.7 * on) : LINE }} strokeWidth={0.8 + 0.5 * on} />
              <defs>
                <clipPath id={id(`tile${i}`)}>
                  <rect width={TILE.w} height={TILE.h} rx={6} />
                </clipPath>
              </defs>
              <T x={8} y={13} size={8} weight={800} color={on > 0.5 ? INK : MUTED}>{name}</T>
              <g opacity={0.4 + 0.6 * on} clipPath={`url(#${id(`tile${i}`)})`}>
                {i === 0 && <HitHeavy s={s} id={id} />}
                {i === 1 && <PetrolHead s={s} id={id} />}
                {i === 2 && <Gridlock s={s} id={id} />}
                {i === 3 && <SwitchBack s={s} />}
              </g>
            </g>
          );
        })}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}
