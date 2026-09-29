import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import {
  Bell,
  BookOpen,
  Camera,
  Check,
  CornerUpRight,
  Flag,
  Flame,
  FolderOpen,
  Fuel,
  Gamepad2,
  Gauge,
  Globe2,
  Heart,
  IdCard,
  KeyRound,
  Languages,
  MapPin,
  MonitorSmartphone,
  Music,
  Pause,
  Receipt as ReceiptIcon,
  Route as RouteIcon,
  Settings as SettingsIcon,
  Shield,
  Shirt,
  ShoppingBag,
  SkipForward,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { tr, LANGUAGES } from '@/lib/i18n';
import { ACCENT_COLORS } from '@/features/settings';
import {
  A,
  Arrow,
  BG,
  BURN,
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
  SKY,
  T,
  VH,
  VW,
  Vignette,
  aa,
  clamp01,
  cycle,
  easeInOut,
  easeOut,
  easeOutBack,
  frac,
  lerp,
  loopT,
  popAt,
  rnd,
  textW,
  useIds,
  useSceneTime,
  win,
  type Icon,
  type Pt,
} from '@/components/scene/kit';

/*
 * Demo slide scenes, part three: the community, the extras and your control.
 */

const loopFade = (t: number, period: number) => clamp01(t / 0.4) * (1 - clamp01((t - (period - 0.45)) / 0.45));

// =============================================================================
// Blacktop World: the crew hub on a spinning globe
// =============================================================================

const LAND = feature(
  landTopo as unknown as Parameters<typeof feature>[0],
  (landTopo as unknown as { objects: { land: unknown } }).objects.land as never,
) as unknown as GeoPermissibleObjects;
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
const WORLD_MARKS: { I: Icon; name: () => string; at: [number, number] }[] = [
  { I: Users, name: () => tr("Crew Convoys"), at: [-0.1, 51.5] },
  { I: Trophy, name: () => tr("Crew Leaderboards"), at: [-74, 40.7] },
  { I: Flag, name: () => tr("Challenges"), at: [139.7, 35.7] },
  { I: Gamepad2, name: () => tr("Arcade"), at: [151.2, -33.9] },
  { I: ShoppingBag, name: () => tr("Speedshop"), at: [-118.2, 34] },
  { I: Fuel, name: () => tr("Blacktank"), at: [0, -86] },
];
const GLOW = Array.from({ length: 34 }, (_, i) => [rnd(i) * 300 - 150, rnd(i + 50) * 110 - 45] as [number, number]);

export function WorldScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const R = 76;
  const C: Pt = [100, 100];
  const tilt = -18 + 30 * (0.5 - 0.5 * Math.cos(t * 0.21));
  const rot: [number, number] = [-t * 16 + 10, tilt];
  const proj = geoOrthographic().scale(R).translate(C).rotate(rot).clipAngle(90);
  const path = geoPath(proj);
  const centre: [number, number] = [-rot[0], -rot[1]];
  const marks = WORLD_MARKS.map((m, i) => {
    const d = geoDistance(m.at, centre);
    const p = proj(m.at) as Pt | null;
    return { ...m, i, d, p, visible: d < Math.PI / 2 - 0.05 && !!p };
  });
  const facing = marks.reduce((b, m) => (m.d < b.d ? m : b), marks[0]);

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <defs>
        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: A }} stopOpacity="0" />
          <stop offset="0.74" style={{ stopColor: A }} stopOpacity="0" />
          <stop offset="0.8" style={{ stopColor: A }} stopOpacity="0.22" />
          <stop offset="1" style={{ stopColor: A }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C[0]} cy={C[1]} r={R + 22} fill={`url(#${id('halo')})`} />
      <path d={path(SPHERE) ?? ''} fill="white" fillOpacity={0.03} />
      <path d={path(LAND) ?? ''} fill="white" fillOpacity={0.07} style={{ stroke: A }} strokeOpacity={0.8} strokeWidth={0.6} />
      {GLOW.map((g, i) => {
        if (geoDistance(g, centre) > Math.PI / 2 - 0.1) return null;
        const p = proj(g);
        return p ? <circle key={i} cx={p[0]} cy={p[1]} r={1.2} style={{ fill: A }} opacity={0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i))} /> : null;
      })}
      <path d={path(SPHERE) ?? ''} fill="none" style={{ stroke: A }} strokeWidth={1} />
      {marks.map((m) =>
        m.visible && m.p ? (
          <g key={m.i}>
            <circle cx={m.p[0]} cy={m.p[1]} r={m === facing ? 5 : 3} style={{ fill: A }} filter={m === facing ? `url(#${id('glow')})` : undefined} />
            {m === facing && <circle cx={m.p[0]} cy={m.p[1]} r={5 + 8 * frac(t)} fill="none" style={{ stroke: A }} opacity={1 - frac(t)} />}
          </g>
        ) : null,
      )}
      {/* The hub's landmarks, the one facing you lit */}
      <Panel x={190} y={8} w={122} h={184}>
        <T x={8} y={14} size={6} color={MUTED} weight={700} spacing={1}>{tr("CREW HUB")}</T>
        {marks.map((m, i) => {
          const on = m === facing;
          return (
            <g key={i} transform={`translate(6 ${22 + i * 26})`}>
              <rect width={110} height={22} rx={6} fill={on ? aa(0.14) : 'transparent'} stroke={on ? aa(0.6) : LINE} strokeWidth={0.8} />
              <Ico I={m.I} x={6} y={6} s={10} color={on ? A : MUTED} />
              <T x={21} y={14} size={6.8} color={on ? INK : MUTED} weight={on ? 700 : 500}>{m.name()}</T>
            </g>
          );
        })}
      </Panel>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Speedshop: flick through what's coming, vote on it
// =============================================================================

const SS_P = 13;

export function SpeedshopScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), SS_P);
  const items: { I: Icon; name: () => string }[] = [
    { I: IdCard, name: () => tr("Printed Vehicle Card") },
    { I: ReceiptIcon, name: () => tr("Ride receipt print") },
    { I: Shirt, name: () => tr("Crew hoodie") },
    { I: KeyRound, name: () => tr("Card keychain") },
    { I: BookOpen, name: () => tr("Bound logbook") },
  ];
  const focus = cycle(t, SS_P / items.length, items.length);
  const since = loopT(t, SS_P / items.length);
  const vote = since > 1.1;
  const price = since > 1.7;
  const buyPct = [64, 48, 71, 39, 57][focus];

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <radialGradient id={id('spot')} cx="50%" cy="0%" r="80%">
          <stop offset="0" stopColor="white" stopOpacity="0.14" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={VW} height={VH} fill={BG} />
      <g opacity={loopFade(t, SS_P)}>
        {/* Shelves */}
        {[74, 132].map((y) => (
          <g key={y}>
            <rect x={10} y={y} width={300} height={3} rx={1.5} fill="#2a2a31" />
            <rect x={10} y={y + 3} width={300} height={4} fill="black" opacity={0.4} />
          </g>
        ))}
        {items.map((it, i) => {
          const on = i === focus;
          const y = i < 3 ? 74 : 132;
          const cx = i < 3 ? 60 + i * 100 : 110 + (i - 3) * 100;
          const k = on ? easeOutBack(since / 0.4) : 0;
          return (
            <g key={i}>
              {on && <path d={`M${cx - 26} 0 L${cx + 26} 0 L${cx + 44} ${y} L${cx - 44} ${y} Z`} fill={`url(#${id('spot')})`} />}
              <g transform={popAt([cx, y - 16], 1 + 0.18 * k)}>
                <rect x={cx - 17} y={y - 34} width={34} height={34} rx={8} fill={on ? aa(0.14) : PANEL} stroke={on ? A : LINE} strokeWidth={on ? 1.2 : 0.8} />
                <Ico I={it.I} x={cx - 10} y={y - 27} s={20} color={on ? A : MUTED} sw={1.8} />
              </g>
            </g>
          );
        })}
        <g transform="translate(268 12) rotate(8)">
          <rect x={-30} y={-8} width={60} height={16} rx={3} style={{ fill: A }} />
          <T x={0} y={3} anchor="middle" size={6.5} color="#111" weight={900} spacing={1.2}>{tr("COMING SOON")}</T>
        </g>
        <Chip x={8} y={8} label={`${focus + 1} / ${items.length} · ${items[focus].name()}`} I={ShoppingBag} />

        {/* Your vote and what you'd pay */}
        <Panel x={8} y={146} w={304} h={46}>
          {[tr("I'd buy it"), tr("Maybe"), tr("Not for me")].map((l, i) => {
            const on = vote && i === 0;
            return (
              <g key={l} transform={`translate(${6 + i * 64} 6)`}>
                <rect width={60} height={16} rx={5} fill={on ? A : 'transparent'} stroke={on ? A : 'rgba(255,255,255,0.2)'} />
                <T x={30} y={10.6} anchor="middle" size={6.5} color={on ? '#111' : INK} weight={700}>{l}</T>
              </g>
            );
          })}
          {['£5', '£10', '£15', '£20+'].map((p, i) => {
            const on = price && i === 1;
            return (
              <g key={p} transform={`translate(${6 + i * 47} 26)`}>
                <rect width={43} height={14} rx={4} fill={on ? A : 'transparent'} stroke={on ? A : 'rgba(255,255,255,0.2)'} />
                <T x={21.5} y={9.8} anchor="middle" size={6.5} color={on ? '#111' : INK} weight={800} mono>{p}</T>
              </g>
            );
          })}
          <T x={206} y={17} size={6} color={MUTED}>{tr("Riders who'd buy it")}</T>
          <T x={296} y={17} anchor="end" size={9} weight={800} mono>{vote ? `${Math.round(buyPct * easeOut((since - 1.1) / 0.8))}%` : '—'}</T>
          <Bar x={206} y={26} w={90} h={4} f={vote ? (buyPct / 100) * easeOut((since - 1.1) / 0.8) : 0} />
        </Panel>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Derez Legacy: light walls in a drawn arena; hit one and you're out
// =============================================================================

const DZ_P = 9;
const DZ_ARENA = '82,28 240,28 240,172 160,181 82,172';
const dz = (pts: [number, number][]) => pts.map(([x, y]) => [62 + x * 2, 10 + y * 1.8] as Pt);
const DZ_RIDERS: { name: () => string; color: string; pts: Pt[]; speed: number; dies?: number }[] = [
  { name: () => tr("You"), color: A, pts: dz([[82, 30], [82, 60], [55, 60], [55, 82], [30, 82]]), speed: 0.92 },
  { name: () => 'Rico', color: SKY, pts: dz([[18, 25], [45, 25], [45, 55], [70, 55], [70, 60]]), speed: 0.78, dies: 0.78 },
  { name: () => 'Sam', color: INK, pts: dz([[20, 88], [20, 55], [20, 38], [42, 38], [45, 38]]), speed: 0.6, dies: 0.6 },
];

function polyLen(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function polyUpTo(pts: Pt[], f: number): Pt[] {
  let left = polyLen(pts) * clamp01(f);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left >= seg) {
      out.push(pts[i]);
      left -= seg;
      continue;
    }
    const r = seg ? left / seg : 0;
    out.push([lerp(pts[i - 1][0], pts[i][0], r), lerp(pts[i - 1][1], pts[i][1], r)]);
    break;
  }
  return out;
}

export function DerezScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), DZ_P);
  const u = clamp01(t / 7);
  const alive = DZ_RIDERS.filter((r) => !(r.dies !== undefined && u >= r.dies)).length;
  const lastDeath = DZ_RIDERS.filter((r) => r.dies !== undefined && u >= r.dies).sort((a, b) => (b.dies ?? 0) - (a.dies ?? 0))[0];
  const status =
    u >= 0.86 ? tr("You win!") : lastDeath && u - (lastDeath.dies ?? 0) < 0.08 ? tr("{0} derezzed!", [lastDeath.name()]) : tr("{0} riders live", [alive]);

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, DZ_P)}>
        <polygon points={DZ_ARENA} fill={aa(0.04)} style={{ stroke: A }} strokeOpacity={0.6} strokeDasharray="4 3" strokeWidth={1.2} />
        {DZ_RIDERS.map((r, i) => {
          const died = r.dies !== undefined && u >= r.dies;
          const pct = died ? 1 : clamp01(u / r.speed);
          const deadFor = died ? u - (r.dies ?? 0) : 0;
          if (died && deadFor > 0.14) return null;
          const trail = polyUpTo(r.pts, pct);
          const head = trail[trail.length - 1];
          const flashOn = !died || Math.floor(deadFor / 0.02) % 2 === 0;
          return (
            <g key={i} opacity={flashOn ? 1 : 0.15}>
              <polyline points={trail.map((p) => p.join(',')).join(' ')} fill="none" stroke={r.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${id('glow')})`} />
              {!died && <circle cx={head[0]} cy={head[1]} r={3.6} fill={r.color} stroke="white" strokeWidth={1} />}
              {died && (
                <g>
                  <circle cx={head[0]} cy={head[1]} r={4 + (deadFor / 0.14) * 18} fill="none" stroke={r.color} strokeWidth={1.6} opacity={1 - deadFor / 0.14} />
                  <T x={head[0]} y={head[1] - 9} anchor="middle" size={7} weight={900} color={r.color}>{tr("DEREZ!")}</T>
                </g>
              )}
            </g>
          );
        })}
        {u >= 0.86 && (() => {
          const w = DZ_RIDERS[0];
          const head = polyUpTo(w.pts, clamp01(u / w.speed)).slice(-1)[0];
          return <circle cx={head[0]} cy={head[1]} r={7 + Math.sin(t * 12) * 1.5} fill="none" style={{ stroke: A }} strokeWidth={1.4} />;
        })()}
        <Chip x={160 - (20 + textW(status)) / 2} y={8} label={status} I={Zap} />
        <Chip x={8} y={176} label={tr("Wins are banked to the Arcade")} I={Trophy} opacity={easeOut((u - 0.88) / 0.05)} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Blacktop Radio: your own stations on a dial; directions duck the music
// =============================================================================

const RD_P = 12;
const RD_STEP = RD_P / 4;
const STATIONS: { name: () => string; hsl: string }[] = [
  { name: () => tr("Night Ride"), hsl: '38 95% 55%' },
  { name: () => 'Backroads', hsl: '186 94% 50%' },
  { name: () => 'Redline', hsl: '0 84% 60%' },
  { name: () => 'Cruise', hsl: '262 83% 58%' },
];

export function RadioScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), RD_P);
  const step = Math.floor(t / RD_STEP);
  const within = t - step * RD_STEP;
  const turn = easeInOut((within - (RD_STEP - 0.6)) / 0.6);
  const rot = -(step + turn) * 90;
  const active = (step + (turn > 0.5 ? 1 : 0)) % STATIONS.length;
  const st = STATIONS[active];
  const color = `hsl(${st.hsl})`;
  const duck = win(t, 5.2, 8.4, 0.4);
  const volume = 1 - 0.65 * duck;
  const C: Pt = [86, 100];

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, RD_P)}>
        {/* The dial */}
        <circle cx={C[0]} cy={C[1]} r={62} fill="none" stroke="white" strokeOpacity={0.12} />
        <path d={`M${C[0] - 6} ${C[1] - 72} L${C[0] + 6} ${C[1] - 72} L${C[0]} ${C[1] - 63} Z`} style={{ fill: A }} />
        <g transform={`rotate(${rot.toFixed(2)} ${C[0]} ${C[1]})`}>
          {STATIONS.map((s, i) => {
            const a = ((i * 90 - 90) * Math.PI) / 180;
            const p: Pt = [C[0] + Math.cos(a) * 50, C[1] + Math.sin(a) * 50];
            const on = i === active;
            return (
              <g key={i} transform={`rotate(${(-rot).toFixed(2)} ${p[0]} ${p[1]})`}>
                <circle cx={p[0]} cy={p[1]} r={on ? 15 : 12} fill={`hsl(${s.hsl} / ${on ? 0.3 : 0.1})`} stroke={`hsl(${s.hsl} / ${on ? 1 : 0.4})`} strokeWidth={1.2} />
                <Ico I={Music} x={p[0] - 6} y={p[1] - 6} s={12} color={`hsl(${s.hsl})`} />
              </g>
            );
          })}
        </g>
        <circle cx={C[0]} cy={C[1]} r={28} fill={PANEL} stroke={LINE} />
        <T x={C[0]} y={C[1] - 3} anchor="middle" size={5.5} color={MUTED} weight={700} spacing={1}>{tr("STATION")}</T>
        <T x={C[0]} y={C[1] + 8} anchor="middle" size={8} weight={800} color={color}>{st.name()}</T>

        {/* Now playing */}
        <Panel x={170} y={20} w={142} h={96}>
          <Ico I={Music} x={8} y={8} s={10} color={color} />
          <T x={23} y={16} size={6.5} color={MUTED}>{st.name()}</T>
          <T x={8} y={32} weight={700}>{tr("Midnight Run — Track 04")}</T>
          <Bar x={8} y={40} w={126} h={3} f={frac(t / 30 + 0.3)} color={color} />
          <g transform="translate(8 50)">
            {Array.from({ length: 16 }, (_, i) => {
              const h = (3 + 14 * Math.abs(Math.sin(t * (5 + (i % 5)) + i * 1.3))) * volume;
              return <rect key={i} x={i * 8} y={18 - h} width={5} height={h} rx={1.5} fill={color} opacity={0.75} />;
            })}
          </g>
          <g transform="translate(40 76)">
            <Ico I={SkipForward} x={0} y={2} s={11} color={MUTED} />
            <circle cx={31} cy={7.5} r={9} style={{ fill: A }} />
            <Ico I={Pause} x={26} y={2.5} s={10} color="#111" />
            <Ico I={SkipForward} x={50} y={2} s={11} color={MUTED} />
          </g>
        </Panel>
        {/* Directions speak: the radio dips under them */}
        <Panel x={170} y={124} w={142} h={40} opacity={duck} stroke={aa(0.6)}>
          <rect x={6} y={6} width={16} height={16} rx={4} style={{ fill: A }} />
          <Ico I={CornerUpRight} x={9} y={9} s={10} color="#111" />
          <T x={28} y={14} weight={700}>{tr("Turn right in 300 m")}</T>
          <T x={28} y={23} size={6} color={MUTED}>{tr("Radio lowered while directions speak")}</T>
          <Bar x={28} y={30} w={106} h={3} f={volume} color={SKY} />
        </Panel>
        <Chip x={170} y={175} label={tr("Your files, never uploaded")} I={FolderOpen} />
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Pay up: the crew's Blacktank fills, a withdrawal is voted through, and tips
// hand off to Nimiq Pay
// =============================================================================

const PU_P = 14;
const QR = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const finder = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
  return finder || rnd(i + 17) > 0.52;
});

export function PayUpScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), PU_P);
  const chips = [
    { who: 'Rico', amt: 2, at: 0.9 },
    { who: 'Sam', amt: 3.5, at: 2.4 },
    { who: tr("You"), amt: 5, at: 3.9 },
  ];
  const paid = chips.filter((c) => t > c.at + 0.9).reduce((s, c) => s + c.amt, 2);
  const votes = [6.2, 6.8, 7.4, 8.0].filter((v) => t > v).length;
  const released = t > 8.6;
  const level = (released ? paid - 8 * easeInOut((t - 8.6) / 1.2) : paid) / 14;
  const request = win(t, 5.6, 10.6, 0.35);
  const send = t > 10.4;

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <defs>
        <clipPath id={id('tank')}>
          <rect x={36} y={44} width={76} height={110} rx={14} />
        </clipPath>
      </defs>
      <g opacity={loopFade(t, PU_P)}>
        {/* The Blacktank */}
        <Panel x={8} y={8} w={140} h={184}>
          <Ico I={Fuel} x={8} y={8} s={10} />
          <T x={23} y={16} weight={800} color={A}>Blacktank</T>
          <T x={132} y={16} anchor="end" size={6} color={MUTED}>{tr("{0} riders", [4])}</T>
        </Panel>
        <rect x={36} y={44} width={76} height={110} rx={14} fill="#111116" stroke="white" strokeOpacity={0.14} />
        <g clipPath={`url(#${id('tank')})`}>
          <path
            d={`M36 ${154 - 110 * clamp01(level)} ${Array.from({ length: 13 }, (_, i) => `L${36 + i * 6.4} ${(154 - 110 * clamp01(level) + Math.sin(t * 3 + i * 0.9) * 1.6).toFixed(1)}`).join(' ')} L112 154 L36 154 Z`}
            style={{ fill: aa(0.35) }}
          />
        </g>
        <T x={74} y={104} anchor="middle" size={13} weight={800} mono>{(released ? paid - 8 * easeInOut((t - 8.6) / 1.2) : paid).toFixed(1)}</T>
        <T x={74} y={114} anchor="middle" size={6} color={MUTED}>USDT</T>
        {chips.map((c, i) => {
          const k = t - c.at;
          if (k < 0 || k > 1.2) return null;
          return (
            <g key={i} transform={`translate(0 ${(-k * 30).toFixed(1)})`} opacity={1 - clamp01((k - 0.7) / 0.5)}>
              <Chip x={40} y={160} label={tr("+{0} USDT · {1}", [c.amt, c.who])} I={Heart} />
            </g>
          );
        })}

        {/* A withdrawal needs every vote */}
        <Panel x={156} y={8} w={156} h={72} opacity={request} stroke={released ? GREEN : aa(0.6)}>
          <T x={8} y={15} weight={800}>{tr("Fuel for Sunday's run")}</T>
          <T x={148} y={15} anchor="end" size={8} weight={800} mono>8 USDT</T>
          <T x={8} y={30} size={6} color={MUTED}>{tr("Needs every crew vote")}</T>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${8 + i * 22} 38)`}>
              <circle cx={8} cy={8} r={8} fill={i < votes ? GREEN : '#1c1c22'} stroke={i < votes ? GREEN : LINE} />
              {i < votes && <Ico I={Check} x={3.5} y={3.5} s={9} color="#111" />}
            </g>
          ))}
          <T x={148} y={51} anchor="end" size={7} weight={800} color={released ? GREEN : INK}>{released ? tr("Released") : `${votes}/4`}</T>
        </Panel>

        {/* Send or receive, then Nimiq Pay */}
        <Panel x={156} y={86} w={156} h={106}>
          <rect x={8} y={8} width={140} height={16} rx={5} fill="#141418" />
          <rect x={send ? 78 : 10} y={10} width={68} height={12} rx={4} style={{ fill: A }} />
          <T x={44} y={19} anchor="middle" size={6.5} weight={700} color={send ? INK : '#111'}>{tr("Receive")}</T>
          <T x={112} y={19} anchor="middle" size={6.5} weight={700} color={send ? '#111' : INK}>{tr("Send")}</T>
          <g transform="translate(10 32)">
            <rect width={46} height={46} rx={4} fill={send ? '#0d0d11' : '#f4f4f5'} stroke={send ? A : 'none'} strokeDasharray={send ? '5 4' : undefined} />
            {!send && QR.map((on, i) => (on ? <rect key={i} x={3 + (i % 9) * 4.4} y={3 + Math.floor(i / 9) * 4.4} width={4.4} height={4.4} fill="#111" /> : null))}
            {send && <rect x={4} y={4 + 38 * frac(t * 0.8)} width={38} height={1.4} style={{ fill: A }} opacity={0.9} />}
          </g>
          <T x={64} y={42} size={6.5} weight={700}>{send ? tr("Scan their code") : tr("Your wallet")}</T>
          <T x={64} y={52} size={5.5} color={MUTED} mono>{send ? 'NIM · USDT' : 'NQ07 4F3K … 9JX2'}</T>
          <rect x={64} y={62} width={84} height={16} rx={5} style={{ fill: A }} />
          <Ico I={Wallet} x={69} y={65.5} s={9} color="#111" />
          <T x={81} y={73} size={6.5} weight={800} color="#111">{tr("Nimiq Pay")}</T>
          <T x={10} y={96} size={5.8} color={MUTED}>{tr("100% goes to them. Blacktop takes no cut.")}</T>
        </Panel>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Make it yours: the accent recolours everything; units and language flip
// =============================================================================

const MY_STEP = 1.7;

export function MakeItYoursScene() {
  const id = useIds();
  const t = useSceneTime(0);
  const n = ACCENT_COLORS.length;
  const period = n * MY_STEP;
  const tp = loopT(t, period);
  const idx = Math.floor(tp / MY_STEP) % n;
  const c = `hsl(${ACCENT_COLORS[idx].hsl})`;
  const cA = (o: number) => `hsl(${ACCENT_COLORS[idx].hsl} / ${o})`;
  const kph = Math.floor(t / 4) % 2 === 1;
  const mph = 64;
  const lang = LANGUAGES[Math.floor(t / 1.2) % LANGUAGES.length];
  const pulse = easeOut((tp - idx * MY_STEP) / 0.5);

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      {/* A slice of the app in the chosen colour */}
      <Panel x={8} y={8} w={150} h={150}>
        <T x={10} y={18} size={10} weight={800}>{tr("Home")}</T>
        {[{ I: Users, l: tr("Convoy") }, { I: Zap, l: tr("Solo") }].map((b, i) => (
          <g key={i} transform={`translate(${10 + i * 67} 26)`}>
            <rect width={61} height={40} rx={10} fill={PANEL} stroke={c} strokeWidth={1.6} />
            <rect x={8} y={12} width={16} height={16} rx={5} fill={cA(0.15)} />
            <Ico I={b.I} x={11} y={15} s={10} color={c} />
            <T x={29} y={23} size={7} weight={700}>{b.l}</T>
          </g>
        ))}
        <g transform="translate(40 108)">
          <circle r={26} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={5} />
          <circle r={26} fill="none" stroke={c} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${163 * 0.68} 164`} transform="rotate(-90)" />
          <T x={0} y={4} anchor="middle" size={14} weight={800} mono>{kph ? Math.round(mph * 1.609) : mph}</T>
          <T x={0} y={13} anchor="middle" size={5.5} color={MUTED}>{kph ? 'KPH' : 'MPH'}</T>
        </g>
        <g transform="translate(84 86)">
          {[{ I: Bell, l: tr("Alerts") }, { I: Shield, l: tr("Auto-rescue") }].map((s, i) => (
            <g key={i} transform={`translate(0 ${i * 22})`}>
              <Ico I={s.I} x={0} y={2} s={9} color={c} />
              <T x={13} y={9} size={6.2}>{s.l}</T>
              <rect x={40} y={1} width={18} height={10} rx={5} fill={c} />
              <circle cx={52.5} cy={6} r={3.6} fill="white" />
            </g>
          ))}
        </g>
      </Panel>
      {/* Eight accents */}
      <Panel x={8} y={164} w={150} h={28}>
        {ACCENT_COLORS.map((a, i) => (
          <g key={a.id}>
            {i === idx && <circle cx={14 + i * 17.4} cy={14} r={8.5 + 2 * (1 - pulse)} fill="none" stroke="white" strokeOpacity={0.8} strokeWidth={1.2} />}
            <circle cx={14 + i * 17.4} cy={14} r={6} fill={`hsl(${a.hsl})`} />
          </g>
        ))}
      </Panel>
      {/* Settings that shape it */}
      <Panel x={166} y={8} w={146} h={184}>
        <T x={10} y={18} size={10} weight={800}>{tr("Settings")}</T>
        {[
          { I: SettingsIcon, l: tr("Accent"), v: ACCENT_COLORS[idx].label },
          { I: Gauge, l: tr("Units"), v: kph ? tr("KPH · km") : tr("MPH · miles") },
          { I: Languages, l: tr("Language"), v: lang.name },
          { I: MonitorSmartphone, l: tr("Car display"), v: tr("On") },
          { I: Globe2, l: tr("Install app"), v: tr("Home Screen") },
          { I: Camera, l: tr("Demo data"), v: tr("Hold the logo") },
        ].map((r, i) => (
          <g key={i} transform={`translate(8 ${28 + i * 25})`}>
            <rect width={130} height={21} rx={6} fill="white" fillOpacity={0.03} stroke={LINE} />
            <Ico I={r.I} x={6} y={5.5} s={10} color={c} />
            <T x={21} y={13.5} size={6.5}>{r.l}</T>
            <T x={124} y={13.5} anchor="end" size={6.5} weight={700} color={i === 0 ? c : INK}>{r.v}</T>
          </g>
        ))}
      </Panel>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Burn: hold, and everything goes up in smoke, on the phone and the server
// =============================================================================

const BN_P = 10;

export function BurnScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), BN_P);
  const rows: { I: Icon; l: string; v: string }[] = [
    { I: RouteIcon, l: tr("Rides"), v: '142' },
    { I: Flag, l: tr("Tracks"), v: '6' },
    { I: IdCard, l: tr("Cards"), v: '23' },
    { I: MapPin, l: tr("Saved places"), v: '18' },
    { I: Camera, l: tr("Photos"), v: '96' },
    { I: SettingsIcon, l: tr("Settings"), v: '' },
  ];
  const hold = clamp01((t - 0.8) / 1.8);
  const fire = clamp01((t - 2.6) / 0.5) * (1 - clamp01((t - 6.2) / 0.8));
  const gone = (i: number) => clamp01((t - (2.9 + (rows.length - 1 - i) * 0.28)) / 0.4);
  const done = win(t, 5.1, 8.6, 0.4);
  const fresh = easeOut((t - 7.4) / 0.6);

  return (
    <Frame>
      <Defs id={id} />
      <Base id={id} />
      <defs>
        <linearGradient id={id('fire')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: BURN }} stopOpacity="0.95" />
          <stop offset="0.55" style={{ stopColor: BURN }} stopOpacity="0.45" />
          <stop offset="1" style={{ stopColor: BURN }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g opacity={loopFade(t, BN_P)}>
        <Panel x={70} y={10} w={180} h={130}>
          {rows.map((r, i) => {
            const g = gone(i);
            return (
              <g key={i} transform={`translate(8 ${8 + i * 20})`} opacity={1 - g}>
                <rect width={164} height={17} rx={5} fill="white" fillOpacity={0.03} stroke={LINE} />
                <Ico I={r.I} x={6} y={4} s={9} />
                <T x={20} y={11.5} size={7}>{r.l}</T>
                <T x={158} y={11.5} anchor="end" size={7} weight={700} mono>{r.v}</T>
                {g > 0 && <rect width={164 * g} height={17} rx={5} style={{ fill: BURN }} opacity={0.3} />}
              </g>
            );
          })}
          <g opacity={fresh}>
            <T x={90} y={62} anchor="middle" size={11} weight={800}>{tr("Fresh start")}</T>
            <T x={90} y={74} anchor="middle" size={6.5} color={MUTED}>{tr("Nothing kept anywhere")}</T>
          </g>
        </Panel>
        {/* Flames rise */}
        {fire > 0 && (
          <g opacity={fire}>
            <rect x={0} y={VH - 150 * fire} width={VW} height={150 * fire} fill={`url(#${id('fire')})`} />
            {Array.from({ length: 12 }, (_, i) => {
              const x = 10 + i * 27;
              const h = (40 + 50 * Math.abs(Math.sin(t * 5 + i * 1.7))) * fire;
              return (
                <path
                  key={i}
                  d={`M${x - 12} ${VH} Q${x - 8} ${VH - h * 0.55} ${x + Math.sin(t * 7 + i) * 4} ${VH - h} Q${x + 8} ${VH - h * 0.5} ${x + 12} ${VH} Z`}
                  style={{ fill: BURN }}
                  opacity={0.55}
                  filter={`url(#${id('soft')})`}
                />
              );
            })}
          </g>
        )}
        {/* Hold to burn */}
        <g transform="translate(160 168)">
          <circle r={17} fill={PANEL} style={{ stroke: BURN }} strokeOpacity={0.5} />
          <circle r={17} fill="none" style={{ stroke: BURN }} strokeWidth={2.6} strokeDasharray={`${106.8 * hold} 107`} transform="rotate(-90)" />
          <Ico I={Flame} x={-8} y={-8} s={16} color={BURN} />
        </g>
        <Chip x={160 - (20 + textW(tr("Everything deleted"))) / 2} y={8} label={tr("Everything deleted")} I={Flame} color={BURN} tone={BURN} opacity={done} />
        <T x={160} y={34} anchor="middle" size={6.2} color={MUTED} opacity={done}>{tr("On this phone and on our servers")}</T>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Ready to ride: the road opens up ahead
// =============================================================================

const RR_P = 8;

export function ReadyScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), RR_P);
  const VPx = 160;
  const VPy = 64;
  const dashes = Array.from({ length: 8 }, (_, i) => frac(i / 8 + t * 0.35));
  const weave = Math.sin(t * 1.3) * 6;
  const promises: { I: Icon; l: string }[] = [
    { I: Shield, l: tr("No signup required") },
    { I: Heart, l: tr("No tracking or ads") },
    { I: Check, l: tr("Data stays on device") },
  ];

  return (
    <Frame>
      <Defs id={id} />
      <defs>
        <radialGradient id={id('dawn')} cx="50%" cy="100%" r="60%">
          <stop offset="0" style={{ stopColor: A }} stopOpacity="0.28" />
          <stop offset="1" style={{ stopColor: A }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={VW} height={VH} fill="#060607" />
      <rect x={0} y={0} width={VW} height={VPy} fill={`url(#${id('dawn')})`} />
      <g opacity={loopFade(t, RR_P)}>
        <path d={`M${VPx - 4} ${VPy} L${VPx + 4} ${VPy} L${VW + 70} ${VH} L${-70} ${VH} Z`} fill="#15151a" />
        <path d={`M${VPx - 4} ${VPy} L${-70} ${VH}`} stroke="white" strokeOpacity={0.3} strokeWidth={1.2} />
        <path d={`M${VPx + 4} ${VPy} L${VW + 70} ${VH}`} stroke="white" strokeOpacity={0.3} strokeWidth={1.2} />
        {dashes.map((d, i) => {
          const k = d * d;
          const y = VPy + (VH - VPy) * k;
          const w = 0.6 + 4 * k;
          const h = 1 + 18 * k;
          return <rect key={i} x={VPx - w / 2} y={y} width={w} height={h} fill="white" opacity={0.2 + 0.5 * k} />;
        })}
        <Arrow p={[VPx + weave, 168]} a={-90 + weave * 0.8} color={A} glow={id('glow')} s={1.5} />
        {promises.map((p, i) => {
          const k = easeOutBack((t - 0.6 - i * 0.5) / 0.5);
          const w = 20 + textW(p.l);
          const x = [12, 160 - w / 2, VW - 12 - w][i];
          const y = [100, 20, 100][i];
          return (
            <g key={i} transform={popAt([x + w / 2, y + 8.5], k)} opacity={clamp01(k)}>
              <Chip x={x} y={y} label={p.l} I={p.I} />
            </g>
          );
        })}
      </g>
      <Vignette id={id} />
    </Frame>
  );
}
