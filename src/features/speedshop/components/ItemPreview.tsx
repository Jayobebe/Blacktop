import { useGarage } from '@/features/garage';
import { useRideHistory, RideSummary } from '@/features/ride';
import { useVehicleCards, VehicleCard } from '@/features/cards';
import { LogbookCover } from '@/features/logbook';
import { useCrew } from '@/features/crew/useCrew';
import type { PreviewKind } from '../lib/catalogue';

/**
 * What each Speedshop item would look like, using the rider's own stuff where
 * there is some: their vehicle card, latest ride receipt, logbook
 * and crew code.
 */
export function ItemPreview({ kind }: { kind: PreviewKind }) {
  return <div className="shop-turn origin-bottom">{renderItem(kind)}</div>;
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
        Add a vehicle in the Garage to see your card here
      </div>
    );
  }
  // The rider's actual card, scaled down.
  return (
    <div className="w-[300px] origin-bottom scale-[0.44] drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)] pointer-events-none">
      <VehicleCard card={card} />
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
        timeAttack={!!ride?.challenge}
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
  const depth = 14;
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
        <LogbookCover vehicleName={bike?.name ?? 'Your vehicle'} onOpen={() => {}} className="m-0 [&>div:last-child]:shadow-none" />
      </div>
    </div>
  );
}

function MerchPreview({ kind }: { kind: Exclude<PreviewKind, 'card' | 'receipt' | 'logbook'> }) {
  const crew = useCrew();
  const accent = 'hsl(var(--accent))';
  const shadow = 'drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)]';

  if (kind === 'hoodie') {
    return (
      <svg viewBox="0 0 120 120" className={`w-40 ${shadow}`} role="img" aria-label="Hoodie">
        <path d="M42,14 Q60,4 78,14 L100,26 L112,62 L98,66 L94,52 L94,112 L26,112 L26,52 L22,66 L8,62 L20,26 Z" fill="#141414" stroke="#2c2c2c" strokeWidth={1.5} />
        <path d="M44,15 Q60,34 76,15" fill="none" stroke="#2c2c2c" strokeWidth={2} />
        <rect x={40} y={82} width={40} height={16} rx={3} fill="#0d0d0d" stroke="#262626" />
        <text x={60} y={58} textAnchor="middle" fontSize={9} fontWeight={900} letterSpacing={1.5} fill={accent}>
          CREW {crew.code}
        </text>
      </svg>
    );
  }

  if (kind === 'keychain') {
    return (
      <svg viewBox="0 0 120 120" className={`w-32 ${shadow}`} role="img" aria-label="Keychain">
        <circle cx={60} cy={20} r={12} fill="none" stroke="#c9c9c9" strokeWidth={3} />
        <rect x={56} y={30} width={8} height={10} rx={2} fill="#9a9a9a" />
        <rect x={38} y={40} width={44} height={62} rx={6} fill="#1a1a1a" stroke={accent} strokeWidth={2.5} />
        <rect x={44} y={46} width={32} height={26} rx={3} fill="#2a2a2a" />
        <text x={60} y={84} textAnchor="middle" fontSize={6} fontWeight={800} fill={accent} letterSpacing={1}>
          BLACKTOP
        </text>
        <text x={60} y={93} textAnchor="middle" fontSize={4.5} fill="#9a9a9a" letterSpacing={1}>
          {crew.code}
        </text>
      </svg>
    );
  }
  return null;
}
