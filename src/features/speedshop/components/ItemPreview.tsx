import { geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import { useGarage } from '@/features/garage';
import { useRideHistory, RideSummary } from '@/features/ride';
import { useVehicleCards, VehicleCard } from '@/features/cards';
import { LogbookCover } from '@/features/logbook';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import type { PreviewKind } from '../lib/catalogue';
import { tr } from '@/lib/i18n';

/**
 * What each Speedshop item would look like, using the rider's own stuff where
 * there is some: their vehicle card, latest ride receipt, logbook
 * and crew code.
 */
export function ItemPreview({ kind }: { kind: PreviewKind }) {
  return <div className={kind === 'hoodie' ? 'origin-bottom' : 'shop-turn origin-bottom'}>{renderItem(kind)}</div>;
}

function renderItem(kind: PreviewKind) {
  switch (kind) {
    case 'card':
      return <CardPreview />;
    case 'receipt':
      return <ReceiptPreview />;
    case 'logbook':
      return <LogbookPreview />;
    default:
      return <MerchPreview kind={kind} />;
  }
}

function CardPreview() {
  const { cards } = useVehicleCards();
  const { activeBikeId } = useGarage();
  const card = cards.find((c) => c.bike.id === activeBikeId) ?? cards[0];
  if (!card) {
    return (
      <div className="w-28 aspect-[5/7] rounded-xl border-2 border-dashed border-white/40 bg-black/40 flex items-center justify-center text-[10px] text-white/70 text-center px-2">
        {tr("Add a vehicle in the Garage to see your card here")}
      </div>
    );
  }
  // The rider's actual card, scaled down.
  return (
    <div className="shop-flat w-[300px] origin-bottom scale-[0.44] drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)] pointer-events-none">
      <VehicleCard card={card} editable={false} />
    </div>
  );
}

/** The rider's latest real receipt (same component as Ride History), scaled down. */
function ReceiptPreview() {
  const { rides } = useRideHistory();
  const { bikes } = useGarage();
  const ride = rides.find((r) => r.endedAt) ?? null;
  const bike = ride ? bikes.find((b) => b.id === ride.bikeId) : bikes[0];
  const stats = ride
    ? {
        duration: ride.duration,
        distance: ride.distance,
        maxSpeed: ride.maxSpeed,
        averageSpeed: ride.averageSpeed,
        maxLean: Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0),
        maxGForce: ride.maxGForce,
      }
    : { duration: 4320, distance: 42, maxSpeed: 78, averageSpeed: 35, maxLean: 38, maxGForce: 1.1 };
  return (
    <div className="w-[360px] origin-bottom scale-[0.3] -rotate-3 drop-shadow-[0_24px_18px_rgba(0,0,0,0.85)] pointer-events-none">
      <RideSummary
        variant="embedded"
        hideActions
        members={[]}
        rideStats={stats}
        bikeName={bike?.name ?? null}
        bikePhoto={bike?.photos?.hero ?? null}
        gForceSamples={ride?.gForceSamples}
        earnedBadges={ride?.earnedBadges}
        printedAt={ride ? ride.endedAt ?? ride.startedAt : undefined}
        orderId={ride ? `#${ride.id.slice(0, 6).toUpperCase()}` : '#SAMPLE'}
        trackDay={!!ride?.track}
        track={ride?.track ?? null}
      />
    </div>
  );
}

/** The garage logbook given real depth (back cover + page edges) so it turns like a book. */
function LogbookPreview() {
  const { activeBike, bikes } = useGarage();
  const bike = activeBike ?? bikes[0];
  const depth = 10;
  return (
    <div className="relative w-40 h-56 scale-[0.8] origin-bottom pointer-events-none" style={{ transformStyle: 'preserve-3d' }}>
      {/* back cover */}
      <div className="absolute left-0 top-[14%] bottom-0 right-[4%] rounded-l-md rounded-r-xl border-[3px] border-black/85 bg-[#4a230e]" style={{ transform: `translateZ(-${depth}px)` }} />
      {/* page edges (right side) */}
      <div
        className="absolute top-[15%] bottom-[1%] right-[4%] border-y-2 border-black/70 bg-[#efe3c4] [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_2px,rgba(0,0,0,0.15)_2px,rgba(0,0,0,0.15)_3px)]"
        style={{ width: depth * 2, transformOrigin: 'right center', transform: `translateZ(-${depth}px) rotateY(90deg)` }}
      />
      {/* spine (left side) */}
      <div
        className="absolute left-0 top-[14%] bottom-0 bg-[#3b1b09] border-y-[3px] border-black/85"
        style={{ width: depth * 2, transformOrigin: 'left center', transform: `translateZ(-${depth}px) rotateY(-90deg)` }}
      />
      {/* front */}
      <div className="absolute inset-0" style={{ transform: `translateZ(${depth}px)` }}>
        <LogbookCover vehicleName={bike?.name ?? tr("Your vehicle")} onOpen={() => {}} className="shop-flat m-0 [&>div:last-child]:shadow-none" />
      </div>
    </div>
  );
}

const HOODIE_LAND = (() => {
  const topo = landTopo as unknown as { objects: { land: unknown } };
  const land = feature(landTopo as never, topo.objects.land as never) as unknown as GeoPermissibleObjects;
  const proj = geoOrthographic().clipAngle(90).rotate([10, -18]).scale(21.5).translate([22, 22]);
  return geoPath(proj)(land) ?? '';
})();

const STITCH = { strokeDasharray: '1.2 0.8', strokeLinecap: 'round' as const };

/** Hoodie outline shared by front and back. */
const HOODIE_BODY = 'M42,16 Q60,6 78,16 L102,28 Q108,32 110,40 L116,70 Q117,75 112,76 L102,78 Q98,78 97,73 L95,60 L95,110 Q95,114 91,114 L29,114 Q25,114 25,110 L25,60 L23,73 Q22,78 18,78 L8,76 Q3,75 4,70 L10,40 Q12,32 18,28 Z';

function Fabric({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-type`} width="34" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
        <rect width="34" height="9" fill="#0b0b0c" />
        <text x="0" y="7.5" fontSize="8.6" fontWeight={900} letterSpacing="-0.4" fill="#161618">{tr("BLACKTOP")}</text>
      </pattern>
      <radialGradient id={`${id}-shade`} cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
      </radialGradient>
      <filter id={`${id}-emb`} x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="0.5" stdDeviation="0.3" floodColor="#000" floodOpacity="0.9" />
      </filter>
    </defs>
  );
}

function HoodieShell({ id, children, back }: { id: string; children: React.ReactNode; back?: boolean }) {
  return (
    <>
      <path d={HOODIE_BODY} fill={`url(#${id}-type)`} stroke="#1c1c1e" strokeWidth={1.2} />
      <path d={HOODIE_BODY} fill={`url(#${id}-shade)`} />
      {/* ribbed cuffs + waistband */}
      <path d="M8,74 L18,76 M103,76 L113,74" stroke="#1d1d20" strokeWidth={4} />
      <rect x={25} y={106} width={70} height={8} rx={2} fill="#101012" stroke="#1d1d20" />
      {/* sleeve seams + folds */}
      <path d="M25,60 L28,34 M95,60 L92,34" stroke="#1a1a1c" strokeWidth={1} fill="none" />
      <path d="M40,96 Q46,90 44,82 M80,98 Q74,92 76,84" stroke="#000" strokeOpacity={0.5} strokeWidth={1.2} fill="none" />
      {back ? (
        <path d="M42,16 Q60,2 78,16 Q74,30 60,32 Q46,30 42,16 Z" fill="#0e0e10" stroke="#1d1d20" strokeWidth={1.2} />
      ) : (
        <>
          {/* hood opening, drawstrings, pocket */}
          <path d="M42,16 Q60,40 78,16 Q70,24 60,25 Q50,24 42,16 Z" fill="#050505" stroke="#1d1d20" strokeWidth={1.2} />
          <path d="M55,26 L54,46 M65,26 L66,46" stroke="#d9d9d9" strokeWidth={1.1} strokeLinecap="round" />
          <circle cx={54} cy={47} r={1.2} fill="#9a9a9a" /><circle cx={66} cy={47} r={1.2} fill="#9a9a9a" />
          <path d="M38,84 L82,84 L86,104 L34,104 Z" fill="#0d0d0f" stroke="#1f1f22" strokeWidth={1} />
          <path d="M38,84 L82,84 L86,104 L34,104 Z" fill="none" stroke="#2c2c30" strokeWidth={0.5} {...STITCH} />
        </>
      )}
      {children}
    </>
  );
}

function HoodiePreview() {
  const { profile } = useProfile();
  const name = (profile?.name || 'RIDER').toUpperCase().slice(0, 14);
  const accent = 'hsl(var(--accent))';
  const burn = 'hsl(var(--burn))';
  const face = 'absolute inset-0 [backface-visibility:hidden]';
  return (
    <div className="drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)]">
    <div className="shop-spin relative w-44 h-44" style={{ transformStyle: 'preserve-3d' }}>
      {/* Front */}
      <svg viewBox="0 0 120 120" className={face} role="img" aria-label={tr("Hoodie front")}>
        <Fabric id="hf" />
        <HoodieShell id="hf">
          <g filter="url(#hf-emb)">
            <text x={78} y={46} textAnchor="middle" fontSize={3.6} fontWeight={900} letterSpacing={0.4} fill="#f4f4f4" stroke="#bdbdbd" strokeWidth={0.12}>{name}</text>
            <text x={78} y={50.5} textAnchor="middle" fontSize={2.4} fontWeight={800} letterSpacing={0.5} fill={burn} stroke={burn} strokeWidth={0.1}>{tr("BURN IT ALL")}</text>
          </g>
        </HoodieShell>
      </svg>
      {/* Back */}
      <svg viewBox="0 0 120 120" className={face} style={{ transform: 'rotateY(180deg)' }} role="img" aria-label={tr("Hoodie back")}>
        <Fabric id="hb" />
        <HoodieShell id="hb" back>
          <defs>
            <path id="hb-arc" d="M29,66 A31,31 0 0 1 91,66" />
          </defs>
          <g filter="url(#hb-emb)">
            <text fontSize={6.6} fontWeight={900} letterSpacing={1.4} fill="#f4f4f4" stroke="#c4c4c4" strokeWidth={0.25} {...STITCH}>
              <textPath href="#hb-arc" startOffset="50%" textAnchor="middle">{tr("BLACKTOP WORLD")}</textPath>
            </text>
            {/* Globe like the home screen's: dark sphere, accent coastlines and rim, stitched */}
            <circle cx={60} cy={66} r={22} fill="#050506" />
            <path d={HOODIE_LAND} transform="translate(38 44)" fill="none" stroke={accent} strokeWidth={0.55} strokeLinejoin="round" />
            <circle cx={60} cy={66} r={22} fill="none" stroke={accent} strokeWidth={0.9} {...STITCH} />
          </g>
        </HoodieShell>
      </svg>
    </div>
    </div>
  );
}

/** Chunky rubber tag in the accent colour: BT logo and crew code. */
function KeychainPreview() {
  const crew = useCrew();
  const accent = 'hsl(var(--accent))';
  return (
    <svg viewBox="0 0 120 140" className="w-32 drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)]" role="img" aria-label={tr("Rubber keychain tag")}>
      <defs>
        <linearGradient id="kt-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {/* split ring */}
      <circle cx={60} cy={16} r={12} fill="none" stroke="#bfbfbf" strokeWidth={2.6} />
      <circle cx={60} cy={16} r={12} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.8} strokeDasharray="10 60" />
      {/* tag body: side edge for thickness, then the face */}
      <rect x={30} y={31} width={62} height={100} rx={16} fill="#000" fillOpacity={0.55} />
      <rect x={28} y={28} width={62} height={100} rx={16} fill={accent} />
      <rect x={28} y={28} width={62} height={100} rx={16} fill="url(#kt-shine)" />
      <circle cx={59} cy={40} r={5} fill="#0b0b0b" />
      {/* raised border */}
      <rect x={33} y={50} width={52} height={72} rx={11} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={2} />
      {/* BT logo, debossed */}
      <rect x={42} y={58} width={34} height={30} rx={7} fill="#0b0b0b" />
      <text x={59} y={79} textAnchor="middle" fontSize={17} fontWeight={900} fill={accent} letterSpacing={-1}>{tr("BT")}</text>
      <text x={59} y={101} textAnchor="middle" fontSize={7} fontWeight={900} letterSpacing={1.5} fill="#0b0b0b">{tr("CREW")}</text>
      <text x={59} y={113} textAnchor="middle" fontSize={9} fontWeight={900} letterSpacing={1} fill="#0b0b0b">{crew.code || '----'}</text>
    </svg>
  );
}

function MerchPreview({ kind }: { kind: Exclude<PreviewKind, 'card' | 'receipt' | 'logbook'> }) {
  return kind === 'hoodie' ? <HoodiePreview /> : kind === 'keychain' ? <KeychainPreview /> : null;
}
