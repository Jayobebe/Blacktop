import { useEffect, useMemo, useRef, useState } from 'react';
import { ConvoyMemberInfo, calculateBadges, BADGE_INFO, BADGE_ORDER, MemberBadge, BadgeType } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { Crown, User, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { BTLogo } from '@/components/BTLogo';
import { GForceGraph } from '@/components/GForceGraph';
import { GForceSample } from '@/types/blacktop';
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from 'sonner';

interface RideStats {
  duration: number;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
  maxLean?: number;
  maxGForce?: number;
}

interface RideSummaryProps {
  members: ConvoyMemberInfo[];
  currentUserId?: string;
  rideStats?: RideStats;
  bikeName?: string | null;
  bikePhoto?: string | null;
  gForceSamples?: GForceSample[];
  /** Precomputed badge types - used when there's no live member roster to calculate from (e.g. a historical receipt in Ride History). Ignored if `members` has 2+ entries. */
  earnedBadges?: BadgeType[];
  /** ISO date for the receipt's printed date/time. Defaults to now - pass the ride's actual end time when redisplaying a past ride so the receipt doesn't show today's date. */
  printedAt?: string;
  /** Stable order id so re-downloading the same ride's receipt later shows the same number. Defaults to a random one (fine for the one-time post-ride screen). */
  orderId?: string;
  onBadgesEarned?: (badges: BadgeType[]) => void;
  onClose?: () => void;
  /** 'overlay' (default): full-screen takeover shown right after a ride ends. 'embedded': a plain card for reuse elsewhere, e.g. Ride History. */
  variant?: 'overlay' | 'embedded';
  /** Print this receipt on pink time-attack stock (card challenge rides). */
  timeAttack?: boolean;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-row font-receipt">
      <span className="uppercase tracking-wider">{label}</span>
      <span className="leader" aria-hidden />
      <span className="uppercase font-bold">{value}</span>
    </div>
  );
}

export function RideSummary({ members, currentUserId, rideStats, bikeName, bikePhoto, gForceSamples, earnedBadges, printedAt, orderId: orderIdProp, onBadgesEarned, onClose, variant = 'overlay', timeAttack = false }: RideSummaryProps) {
  const { settings } = useSettings();

  const shouldCalculateBadges = members.length >= 2;
  const badgesMap = useMemo(
    () => (shouldCalculateBadges ? calculateBadges(members) : new Map()),
    [members, shouldCalculateBadges]
  );

  // Show only the current user's badges on their personal receipt.
  // Fallback: if no currentUserId, show all (e.g. shared/demo view).
  const badgeAwards: { member?: ConvoyMemberInfo; badge: MemberBadge }[] = [];
  if (shouldCalculateBadges) {
    members.forEach((member) => {
      if (currentUserId && member.userId !== currentUserId) return;
      const memberBadges = badgesMap.get(member.userId) || [];
      memberBadges.forEach((badge) => badgeAwards.push({ member, badge }));
    });
  } else if (earnedBadges && earnedBadges.length > 0) {
    // No live member roster (e.g. redisplaying a past ride) - render the
    // badge types already recorded on the ride itself.
    earnedBadges.forEach((type) => {
      badgeAwards.push({ badge: { type, ...BADGE_INFO[type] } });
    });
  }
  badgeAwards.sort(
    (a, b) => BADGE_ORDER.indexOf(a.badge.type) - BADGE_ORDER.indexOf(b.badge.type)
  );

  useEffect(() => {
    if (currentUserId && onBadgesEarned && shouldCalculateBadges) {
      const userBadges = badgesMap.get(currentUserId);
      if (userBadges && userBadges.length > 0) {
        onBadgesEarned(userBadges.map((b: MemberBadge) => b.type));
      }
    }
  }, [currentUserId, onBadgesEarned, badgesMap, shouldCalculateBadges]);

  // Pin timestamp + order id so they don't reshuffle on re-render or saved image.
  // `printedAt`/`orderId` let a caller redisplay a past ride's receipt with its
  // actual end time and a stable order number, instead of "now" + a random id.
  const { dateStr, timeStr, orderId } = useMemo(() => {
    const printed = printedAt ? new Date(printedAt) : new Date();
    return {
      dateStr: printed
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase(),
      timeStr: printed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      orderId: orderIdProp ?? `#${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };
  }, [printedAt, orderIdProp]);

  const speedUnit = getSpeedLabel(settings.speedUnit).toUpperCase();
  const distUnit = getDistanceLabel(settings.distanceUnit).toUpperCase();

  const receiptRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!receiptRef.current || saving) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: '#f4f1e8',
      });
      const filename = `blacktop-receipt-${Date.now()}.png`;

      if (Capacitor.isNativePlatform()) {
        const base64 = dataUrl.split(',')[1];
        await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Documents,
        });
        toast.success('Receipt saved to Documents');
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('Receipt downloaded');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('[RideSummary] save failed', err);
      toast.error('Could not save receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      variant === 'overlay'
        ? 'fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 overflow-y-auto animate-fade-in'
        : 'flex flex-col items-center',
    )}>
      <div ref={receiptRef} className="w-full max-w-[360px] animate-receipt-print">
        <div className={cn('receipt-edge-top', timeAttack && 'receipt-edge-timeattack')} />
        <div className={cn('receipt relative px-6 py-5 font-receipt text-[--ink]', timeAttack && 'receipt-timeattack')}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <BTLogo size="sm" className="!bg-[--ink] !text-[--paper] !border-[--ink]" />
            <div className="text-right text-base leading-tight">
              <div>{dateStr}</div>
              <div className="opacity-70">{timeStr}</div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-1">
            <div className="text-3xl font-bold tracking-[0.15em]">BLACKTOP STORE</div>
            <div className="text-sm tracking-[0.3em] opacity-70 mt-1">
              {timeAttack ? '— TIME ATTACK RECEIPT —' : '— RIDE RECEIPT —'}
            </div>
          </div>

          {/* Vehicle line (from garage) */}
          <div className="mt-4" data-bike-slot>
            <ReceiptRow label="Vehicle" value={bikeName || '—'} />
          </div>

          {/* Divider */}
          <div className="my-3 border-t-2 border-dashed border-[--ink] opacity-60" />

          {/* Stats */}
          {rideStats && (
            <div className="space-y-2">
              <ReceiptRow
                label="Max Spd"
                value={`${formatSpeed(rideStats.maxSpeed, settings.speedUnit)} ${speedUnit}`}
              />
              <ReceiptRow
                label="Max Lean"
                value={
                  typeof rideStats.maxLean === 'number' && rideStats.maxLean > 0
                    ? `${Math.round(rideStats.maxLean)}°`
                    : '—'
                }
              />
              <ReceiptRow
                label="Max G"
                value={
                  typeof rideStats.maxGForce === 'number' && rideStats.maxGForce > 0
                    ? `${rideStats.maxGForce.toFixed(1)}G`
                    : '—'
                }
              />
              <ReceiptRow
                label="Distance"
                value={`${formatDistance(rideStats.distance, settings.distanceUnit)} ${distUnit}`}
              />
              <ReceiptRow label="Duration" value={formatDuration(rideStats.duration)} />
              <ReceiptRow
                label="Avg Spd"
                value={`${formatSpeed(rideStats.averageSpeed, settings.speedUnit)} ${speedUnit}`}
              />
            </div>
          )}

          {/* Divider */}
          <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />

          {/* Vehicle photo (B&W) — below stats, above thank you. The G-force
              trace sits behind it as a subtle backdrop layer spanning the full
              receipt width, with the hero vehicle photo opaquely overlaid on
              top so the bike clearly reads as the foreground. Ink-toned trace
              keeps the printed-paper feel. */}
          <div className="relative min-h-[10rem] flex items-center justify-center">
            {gForceSamples && gForceSamples.length > 1 && (
              <GForceGraph
                samples={gForceSamples}
                color="var(--ink)"
                height={120}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none"
              />
            )}
            <div className="relative z-10 w-full">
              {bikePhoto ? (
                <div className="flex items-center justify-center py-2">
                  <img
                    src={bikePhoto}
                    alt={bikeName || 'Vehicle'}
                    crossOrigin="anonymous"
                    className="max-h-40 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                    style={{ filter: 'grayscale(100%) contrast(1.15)' }}
                  />
                </div>
              ) : (
                !bikeName && (
                  <div className="receipt-bracket text-center bg-[--paper]" data-bike-slot>
                    <span className="receipt-bracket-tr" />
                    <span className="receipt-bracket-bl" />
                    <div className="text-xl tracking-[0.2em]">VEHICLE MODEL</div>
                    <div className="text-sm opacity-60 mt-1">add in garage</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Badges */}
          {badgeAwards.length > 0 && (
            <>
              <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />
              <div className="text-center text-sm tracking-[0.3em] mb-2 opacity-70">— BADGES —</div>
              <div className={cn(
                'grid gap-2',
                badgeAwards.length === 1 && 'grid-cols-1',
                badgeAwards.length === 2 && 'grid-cols-2',
                badgeAwards.length >= 3 && 'grid-cols-3',
              )}>
                {badgeAwards.map(({ member, badge }) => (
                  <div
                    key={`${member?.userId ?? 'self'}-${badge.type}`}
                    className="receipt-bracket text-center px-2 py-3"
                  >
                    <span className="receipt-bracket-tr" />
                    <span className="receipt-bracket-bl" />
                    <div className="text-2xl leading-none mb-1">{badge.emoji}</div>
                    <div className="text-[11px] uppercase tracking-wider font-bold leading-tight">
                      {badge.label}
                    </div>
                    {member && (
                      <div className="flex items-center justify-center gap-1 text-[10px] opacity-70 mt-1 truncate">
                        {member.isLeader ? <Crown className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                        <span className="truncate">{member.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />
          <div className="text-center space-y-2">
            <div className="text-base tracking-[0.25em]">THANK YOU FOR THE RIDE</div>
            <div className="text-xs opacity-60 tracking-widest">ORDER {orderId}</div>
            <div className="receipt-barcode mt-3" aria-hidden />
            <div className="text-[10px] tracking-[0.4em] opacity-70 mt-1">BLACKTOP · {dateStr}</div>
          </div>

          {!rideStats && badgeAwards.length === 0 && (
            <div className="text-center py-4 text-sm opacity-60">No data to display.</div>
          )}
        </div>
        <div className={cn('receipt-edge-bottom', timeAttack && 'receipt-edge-timeattack')} />
      </div>

      {/* Action buttons (outside the receipt) */}
      <div className={cn('w-full max-w-[360px] gap-3 mt-6', variant === 'overlay' && onClose ? 'grid grid-cols-2' : 'grid grid-cols-1')}>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            className="h-12 text-base font-semibold gap-2"
          >
            {saved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
          {variant === 'overlay' && onClose && (
            <Button
              onClick={onClose}
              className="h-12 text-base font-semibold"
            >
              Continue
            </Button>
          )}
        </div>
    </div>
  );
}
