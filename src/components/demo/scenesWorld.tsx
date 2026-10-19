import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import {
  Camera,
  Check,
  Flag,
  Flame,
  Fuel,
  Gamepad2,
  Heart,
  IdCard,
  MapPin,
  Route as RouteIcon,
  Settings as SettingsIcon,
  Shield,
  ShoppingBag,
  Smartphone,
  Trophy,
  Users,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { tr } from '@/lib/i18n';
import { FLAME, tongues } from '@/lib/pixelFlame';
import { paymentsAvailable } from '@/lib/platform';
import {
  A,
  Arrow,
  BURN,
  Base,
  Chip,
  Defs,
  Frame,
  INK,
  Ico,
  LINE,
  MUTED,
  PANEL,
  Panel,
  T,
  VH,
  VW,
  Vignette,
  aa,
  clamp01,
  easeOut,
  easeOutBack,
  frac,
  loopT,
  popAt,
  rnd,
  textW,
  useIds,
  useSceneTime,
  win,
  type SceneCue,
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
  // Crypto fuel pot: not in the store apps (paymentsAvailable).
  ...((!__STORE_BUILD__ && paymentsAvailable()) ? [{ I: Fuel, name: () => tr("Blacktank"), at: [0, -86] as [number, number] }] : []),
];
const GLOW = Array.from({ length: 34 }, (_, i) => [rnd(i) * 300 - 150, rnd(i + 50) * 110 - 45] as [number, number]);

/** The globe turns once every 22.5 s: a ping as each landmark comes round to the front. */
const WD_TURN = 360 / 16;
const WD_CUES: SceneCue[] = WORLD_MARKS.map((m): SceneCue => [loopT((m.at[0] + 10) / 16, WD_TURN), 'ping']);

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
    <Frame sound={{ t: loopT(t, WD_TURN), cues: WD_CUES }}>
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
// Burn: what lives on your phone (and that there's no account, email or
// adverts), then one hold and the app's own pixel fire takes everything, on the
// phone and the server, and burns off to a fresh start
// =============================================================================

const BN_P = 10;
const BN_HOLD = 4.9;
const BN_FIRE = 6.3;
const BN_COVERED = 7.35;
const BN_CLEAR = 8.45;

const BN_CUES: SceneCue[] = [
  [1.3, 'tap'],
  [1.8, 'tap'],
  [2.3, 'tap'],
  [BN_HOLD, 'beep'],
  [BN_FIRE, 'impact'],
  [BN_FIRE + 0.1, 'whoosh'],
  [BN_CLEAR, 'success'],
];

/** The Burn overlay's fire (lib/pixelFlame), in scene units: layered flat flames a block at a time. */
function PixelFire({ t, head, band, seed }: { t: number; head: number; band: number; seed: number }) {
  const tail = head + band;
  const px = 5;
  const layer = (top: number, bottom: number, tt: number, amp: number, s: number, fill: string, key: string) => {
    if (bottom <= top) return null;
    const rects: ReactElement[] = [];
    for (let x = -px; x < VW + px; x += px) {
      const mid = x + px / 2;
      const y0 = Math.round((top - tongues(mid, tt, amp, s, 2.6)) / px) * px;
      const y1 = Math.round((bottom + tongues(mid, tt * 0.8, amp * 0.55, s + 11, 2.6)) / px) * px;
      if (y1 > y0) rects.push(<rect key={`${key}${x}`} x={x} y={y0} width={px} height={y1 - y0} fill={fill} />);
    }
    return rects;
  };
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const life = frac(t * 0.9 + rnd(i * 7.3));
    const x = Math.round(((rnd(i * 3.1) * VW + Math.sin(t * 2 + i) * 6) % VW) / px) * px;
    const y = Math.round((head - 8 - life * 46) / px) * px;
    return life < 0.85 ? <rect key={`s${i}`} x={x} y={y} width={px * (i % 3 === 0 ? 1 : 0.6)} height={px * (i % 3 === 0 ? 1 : 0.6)} fill={i % 2 ? FLAME.spark : FLAME.core} opacity={1 - life} /> : null;
  });
  return (
    <g shapeRendering="crispEdges">
      {layer(head - 52, head, t * 0.6, 12, seed + 40, 'rgba(249, 115, 22, 0.14)', 'h1')}
      {layer(head - 30, head, t * 0.7, 10, seed + 45, 'rgba(249, 115, 22, 0.2)', 'h2')}
      {layer(head - 10, tail + 10, t, 30, seed, FLAME.tips, 'a')}
      {layer(head, tail - 8, t, 24, seed + 3, FLAME.body, 'b')}
      {layer(head + 22, tail - 40, t, 18, seed + 7, FLAME.core, 'c')}
      {sparks}
    </g>
  );
}

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
  const nots = [tr("No account"), tr("No email"), tr("No adverts")];
  const hold = clamp01((t - BN_HOLD) / (BN_FIRE - BN_HOLD));
  // The fire: rises over everything, holds a moment while it burns, then clears off the top.
  const p = t < BN_FIRE ? 0 : t < BN_COVERED ? ((t - BN_FIRE) / (BN_COVERED - BN_FIRE)) * 0.5 : Math.min(1, 0.5 + ((t - BN_COVERED) / (BN_CLEAR - BN_COVERED)) * 0.5);
  const e = p < 0.5 ? 0.5 * (1 - Math.pow(1 - p * 2, 2.2)) : 0.5 + 0.5 * Math.pow((p - 0.5) * 2, 1.6);
  const band = VH + 110;
  const head = e <= 0.5 ? VH + 40 - (e / 0.5) * (VH + 80) : -40 - ((e - 0.5) / 0.5) * (band + 20);
  const burning = t >= BN_FIRE && p < 1;
  const wiped = t >= BN_COVERED;
  const done = win(t, BN_CLEAR - 0.1, BN_P - 0.4, 0.35);
  const press = t >= BN_HOLD - 0.15 && t < BN_FIRE + 0.1;

  return (
    <Frame sound={{ t, cues: BN_CUES }}>
      <Defs id={id} />
      <Base id={id} />
      <g opacity={loopFade(t, BN_P)}>
        {!wiped ? (
          <g>
            {/* Nothing to sign up for */}
            {nots.map((label, i) => {
              const k = easeOutBack((t - (1.3 + i * 0.5)) / 0.4);
              if (k <= 0) return null;
              const w = 24 + textW(label, 6.6);
              const x = [42, 128, 214][i];
              return (
                <g key={label} transform={`translate(${x + 32} 22) scale(${Math.max(0.001, k).toFixed(3)}) translate(${-w / 2} -9)`} opacity={clamp01(k)}>
                  <rect width={w} height={18} rx={9} style={{ fill: PANEL, stroke: 'hsl(var(--burn) / 0.45)' }} strokeWidth={0.8} />
                  <circle cx={10} cy={9} r={4.4} fill="none" style={{ stroke: BURN }} strokeWidth={1.2} />
                  <line x1={7} y1={12} x2={13} y2={6} style={{ stroke: BURN }} strokeWidth={1.2} />
                  <T x={18} y={12.2} size={6.6} weight={700}>{label}</T>
                </g>
              );
            })}
            {/* What lives on the phone */}
            <Panel x={70} y={40} w={180} h={110}>
              <Ico I={Smartphone} x={8} y={6} s={9} />
              <T x={21} y={13.5} size={6.4} weight={800} color={MUTED} spacing={0.8}>{tr("On this phone").toUpperCase()}</T>
              {rows.map((r, i) => (
                <g key={i} transform={`translate(8 ${20 + i * 14.5})`}>
                  <rect width={164} height={12.5} rx={4} fill="white" fillOpacity={0.03} stroke={LINE} />
                  <Ico I={r.I} x={5} y={2.5} s={7.5} />
                  <T x={17} y={8.8} size={6}>{r.l}</T>
                  <T x={158} y={8.8} anchor="end" size={6} weight={700} mono>{r.v}</T>
                </g>
              ))}
            </Panel>
          </g>
        ) : (
          <g opacity={easeOut((t - BN_COVERED) / 0.6)}>
            <Panel x={70} y={40} w={180} h={110}>
              <T x={90} y={52} anchor="middle" size={12} weight={800}>{tr("Fresh start")}</T>
              <T x={90} y={65} anchor="middle" size={6.5} color={MUTED}>{tr("Nothing kept anywhere")}</T>
            </Panel>
          </g>
        )}

        {/* Hold to burn */}
        <g transform="translate(160 174)">
          <circle r={15} fill={PANEL} style={{ stroke: BURN }} strokeOpacity={0.5} />
          <circle r={15} fill="none" style={{ stroke: BURN }} strokeWidth={2.6} strokeDasharray={`${(94.2 * hold).toFixed(1)} 95`} transform="rotate(-90)" />
          <Ico I={Flame} x={-7.5} y={-7.5} s={15} color={BURN} />
          {press && (
            <g opacity={win(t, BN_HOLD - 0.15, BN_FIRE + 0.1, 0.12)}>
              <circle r={8} fill="white" fillOpacity={0.16} stroke="white" strokeOpacity={0.55} strokeWidth={0.8} />
            </g>
          )}
        </g>

        {burning && <PixelFire t={t} head={head} band={band} seed={4.2} />}

        <g opacity={done}>
          <Chip x={160 - (20 + textW(tr("Everything deleted"))) / 2} y={8} label={tr("Everything deleted")} I={Flame} color={BURN} tone={BURN} />
          <T x={160} y={34} anchor="middle" size={6.2} color={MUTED}>{tr("On this phone and on our servers")}</T>
        </g>
      </g>
      <Vignette id={id} />
    </Frame>
  );
}

// =============================================================================
// Ready to ride: the road opens up ahead
// =============================================================================

const RR_P = 8;

const RR_CUES: SceneCue[] = [[0.3, 'whoosh']];

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
    <Frame sound={{ t, cues: RR_CUES }}>
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
