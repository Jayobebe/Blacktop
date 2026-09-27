import { useGarage } from '@/features/garage';
import { useRideHistory } from '@/features/ride';
import { useVehicleCards, VehicleCard } from '@/features/cards';
import { LogbookCover } from '@/features/logbook';
import { useCrew } from '@/features/crew/useCrew';
import { formatDuration } from '@/lib/format';
import type { PreviewKind } from '../lib/catalogue';

/**
 * What each Speedshop item would look like, using the rider's own stuff where
 * there is some: their vehicle card, latest ride receipt, logbook
 * and crew code.
 */
export function ItemPreview({ kind }: { kind: PreviewKind }) {
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
  return (
    <div className="w-[300px] origin-bottom scale-[0.44] -mb-[4%] drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)]">
      <VehicleCard card={card} />
    </div>
  );
}

function useLatestRide() {
  const { rides } = useRideHistory();
  return rides.find((r) => r.endedAt) ?? null;
}

function ReceiptPreview() {
  const ride = useLatestRide();
  const rows: [string, string][] = ride
    ? [
        ['DIST', `${ride.distance.toFixed(1)} MI`],
        ['TIME', formatDuration(ride.duration)],
        ['TOP', `${Math.round(ride.maxSpeed)} MPH`],
      ]
    : [
        ['DIST', '42.0 MI'],
        ['TIME', '1:12:00'],
        ['TOP', '78 MPH'],
      ];
  return (
    <div className="w-32 -rotate-3 drop-shadow-[0_14px_12px_rgba(0,0,0,0.85)]">
      <div className="receipt-edge-top" />
      <div className="receipt px-3 py-2 font-receipt text-[--ink]">
        <p className="text-center text-[11px] font-bold tracking-[0.2em]">BLACKTOP</p>
        <p className="text-center text-[7px] tracking-[0.2em] opacity-70 mb-1">— RIDE RECEIPT —</p>
        {rows.map(([k, v]) => (
          <p key={k} className="flex justify-between text-[9px] leading-tight">
            <span>{k}</span>
            <span>{v}</span>
          </p>
        ))}
        <div className="receipt-barcode mt-1.5 h-4" aria-hidden />
      </div>
      <div className="receipt-edge-bottom" />
    </div>
  );
}

function LogbookPreview() {
  const { activeBike, bikes } = useGarage();
  const bike = activeBike ?? bikes[0];
  return (
    <div className="w-32 drop-shadow-[0_18px_14px_rgba(0,0,0,0.85)] pointer-events-none">
      <LogbookCover vehicleName={bike?.name ?? 'Your vehicle'} onOpen={() => {}} />
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
