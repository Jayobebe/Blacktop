import { shareFileNative } from '@/lib/nativeShare';
import type { TrackReceipt } from '@/lib/trackReceipt';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConvoyMemberInfo, calculateBadges, BADGE_INFO, BADGE_ORDER, MemberBadge, BadgeType } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { Crown, User, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { useExperience, badgeVisible } from '@/features/experience';
import { BTLogo } from '@/components/BTLogo';
import { GForceGraph } from '@/components/GForceGraph';
import { GForceSample } from '@/types/blacktop';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { GForceCircle } from '@/components/GForceCircle';
import { MechaNickStamp } from './MechaNickStamp';
import type { GMax } from '@/lib/gForceVector';
import { PEAK_HIDDEN, usePeaksHidden } from '../lib/telemetryPrivacy';

interface RideStats {
  duration: number;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
  maxLean?: number;
  maxGForce?: number;
  /** Friction-circle peaks (lib/gForceVector), when the ride recorded them. */
  gEnvelope?: number[];
  gMax?: GMax;
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
  /** Track Day session: prints on pink stock. */
  trackDay?: boolean;
  /** Track Day session details, printed on track-day receipts. */
  track?: Pick<TrackReceipt, 'trackName' | 'laps' | 'bestLapMs'> & Partial<TrackReceipt> | null;
  /** Hide the Save/Continue buttons (e.g. Speedshop preview). */
  hideActions?: boolean;
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

/** Lap time as m:ss.mmm (e.g. 1:32.418). */
function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${sec}`;
}

export function RideSummary({ members, currentUserId, rideStats, bikeName, bikePhoto, gForceSamples, earnedBadges, printedAt, orderId: orderIdProp, onBadgesEarned, onClose, variant = 'overlay', trackDay = false, track = null, hideActions = false }: RideSummaryProps) {
  const { settings } = useSettings();
  const { terms, canLean } = useExperience();
  // Each receipt section follows the rider's setup answers.
  const showVehicle = settings.garageEnabled;
  const showSpeed = settings.speedFocusEnabled;
  // Public Road Privacy: peaks read "--" (a Track Day receipt always shows its numbers).
  const privacy = usePeaksHidden();
  const peaksHidden = privacy && !trackDay;
  const showLean = canLean && settings.leanAngleEnabled;
  const showG = settings.gForceEnabled;
  const showBadges = settings.collectiblesEnabled;

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
  // Drop unknown (legacy) types and badges built on data this rider opted out of.
  const visibleAwards = badgeAwards.filter(
    (a) => BADGE_INFO[a.badge.type] && badgeVisible(a.badge.type, { speed: showSpeed, lean: showLean, g: showG })
  );
  visibleAwards.sort(
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
      // Loaded when saving, not with the app (it's only needed here).
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: '#f4f1e8',
      });
      const filename = `blacktop-receipt-${Date.now()}.png`;

      if (Capacitor.isNativePlatform()) {
        // The share sheet: save to Photos / Files or send it on.
        await shareFileNative(filename, await (await fetch(dataUrl)).blob(), tr("Blacktop ride receipt"));
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(tr("Receipt downloaded"));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('[RideSummary] save failed', err);
      toast.error(tr("Could not save receipt"));
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
      <div ref={receiptRef} className={cn("w-full max-w-[360px]", !hideActions && "animate-receipt-print")}>
        <div className={cn('receipt-edge-top', trackDay && 'receipt-edge-track')} />
        <div className={cn('receipt relative px-6 py-5 font-receipt text-[--ink]', trackDay && 'receipt-track')}>
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
            <div className="text-3xl font-bold tracking-[0.15em]">{tr("BLACKTOP STORE")}</div>
            <div className="text-sm tracking-[0.3em] opacity-70 mt-1">
              {trackDay ? tr("— TRACK DAY RECEIPT —") : tr("— {0} RECEIPT —", [terms.Ride.toUpperCase()])}
            </div>
          </div>

          {/* Vehicle line (from garage) */}
          {showVehicle && (
            <div className="mt-4" data-bike-slot>
              <ReceiptRow label={tr("Vehicle")} value={bikeName || '—'} />
            </div>
          )}

          {/* Track line (track-day receipts) */}
          {track && (
            <div className={showVehicle ? 'mt-2' : 'mt-4'}>
              <ReceiptRow label={tr("Track")} value={track.trackName || '—'} />
            </div>
          )}

          {/* Divider */}
          <div className="my-3 border-t-2 border-dashed border-[--ink] opacity-60" />

          {/* Stats */}
          {rideStats && (
            <div className="space-y-2">
              {track && (
                <>
                  <ReceiptRow label={tr("Best Lap")} value={formatLapTime(track.bestLapMs)} />
                  {track.theoreticalMs != null && <ReceiptRow label={tr("Theoretical")} value={formatLapTime(track.theoreticalMs)} />}
                  <ReceiptRow label={tr("Laps")} value={String(track.laps)} />
                  {!!track.pitStops && <ReceiptRow label={tr("Pit Stops")} value={String(track.pitStops)} />}
                  {track.fastestPitMs != null && <ReceiptRow label={tr("Fastest Pit")} value={formatLapTime(track.fastestPitMs)} />}
                  {track.rank != null && <ReceiptRow label={tr("Board")} value={`P${track.rank}`} />}
                  {track.dogTags != null && <ReceiptRow label={tr("Dog Tags")} value={String(track.dogTags)} />}
                </>
              )}
              {showSpeed && (
                <ReceiptRow
                  label={tr("Max Spd")}
                  value={peaksHidden ? PEAK_HIDDEN : `${formatSpeed(rideStats.maxSpeed, settings.speedUnit)} ${speedUnit}`}
                />
              )}
              {showLean && (
                <ReceiptRow
                  label={tr("Max Lean")}
                  value={
                    peaksHidden ? PEAK_HIDDEN : typeof rideStats.maxLean === 'number' && rideStats.maxLean > 0
                      ? `${Math.round(rideStats.maxLean)}°`
                      : '—'
                  }
                />
              )}
              {showG && (
                <ReceiptRow
                  label={tr("Max G")}
                  value={
                    peaksHidden ? PEAK_HIDDEN : typeof rideStats.maxGForce === 'number' && rideStats.maxGForce > 0
                      ? `${rideStats.maxGForce.toFixed(1)}G`
                      : '—'
                  }
                />
              )}
              <ReceiptRow
                label={tr("Distance")}
                value={`${formatDistance(rideStats.distance, settings.distanceUnit)} ${distUnit}`}
              />
              <ReceiptRow label={tr("Duration")} value={formatDuration(rideStats.duration)} />
              {showSpeed && (
                <ReceiptRow
                  label={tr("Avg Spd")}
                  value={`${formatSpeed(rideStats.averageSpeed, settings.speedUnit)} ${speedUnit}`}
                />
              )}
            </div>
          )}

          {showG && rideStats?.gEnvelope && rideStats.gMax && rideStats.gEnvelope.some((v) => v > 0) && (<>
          <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />
          {/* The G meter, with Mecha-Nick's stamp beside it for riders who use the
              garage (he's the garage's mechanic) */}
          <div className="flex items-center justify-center gap-1 py-1" style={{ color: 'var(--ink)' }}>
            <GForceCircle ink envelope={rideStats.gEnvelope} max={rideStats.gMax} className={showVehicle ? 'w-44 shrink-0' : 'w-48'} />
            {showVehicle && <MechaNickStamp date={printedAt} className="w-[6.5rem] shrink-0 -ml-1 mt-8" />}
          </div>
          </>)}

          {(showVehicle || (showG && gForceSamples && gForceSamples.length > 1)) && (<>
          {/* Divider */}
          <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />

          {/* Vehicle photo (B&W) — below stats, above thank you. The G-force
              trace sits behind it as a subtle backdrop layer spanning the full
              receipt width, with the hero vehicle photo opaquely overlaid on
              top so the bike clearly reads as the foreground. Ink-toned trace
              keeps the printed-paper feel. */}
          <div className="relative min-h-[10rem] flex items-center justify-center">
            {showG && gForceSamples && gForceSamples.length > 1 && (
              <GForceGraph
                samples={gForceSamples}
                color="var(--ink)"
                height={120}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none"
              />
            )}
            {showVehicle && (
            <div className="relative z-10 w-full">
              {bikePhoto ? (
                <div className="flex items-center justify-center py-2">
                  <img
                    src={bikePhoto}
                    alt={bikeName || tr("Vehicle")}
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
                    <div className="text-xl tracking-[0.2em]">{tr("VEHICLE MODEL")}</div>
                    <div className="text-sm opacity-60 mt-1">{tr("add in garage")}</div>
                  </div>
                )
              )}
            </div>
            )}
          </div>
          </>)}

          {/* Badges */}
          {showBadges && visibleAwards.length > 0 && (
            <>
              <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />
              <div className="text-center text-sm tracking-[0.3em] mb-2 opacity-70">{tr("— BADGES —")}</div>
              <div className={cn(
                'grid gap-2',
                visibleAwards.length === 1 && 'grid-cols-1',
                visibleAwards.length === 2 && 'grid-cols-2',
                visibleAwards.length >= 3 && 'grid-cols-3',
              )}>
                {visibleAwards.map(({ member, badge }) => (
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
            <div className="text-base tracking-[0.25em]">{tr("THANK YOU FOR THE {0}", [terms.Ride.toUpperCase()])}</div>
            <div className="text-xs opacity-60 tracking-widest">{tr("ORDER")}{" "}{orderId}</div>
            <div className="receipt-barcode mt-3" aria-hidden />
            <div className="text-[10px] tracking-[0.4em] opacity-70 mt-1">{tr("BLACKTOP ·")}{" "}{dateStr}</div>
          </div>

          {!rideStats && visibleAwards.length === 0 && (
            <div className="text-center py-4 text-sm opacity-60">{tr("No data to display.")}</div>
          )}
        </div>
        <div className={cn('receipt-edge-bottom', trackDay && 'receipt-edge-track')} />
      </div>

      {/* Action buttons (outside the receipt) */}
      {!hideActions && <div className={cn('w-full max-w-[360px] gap-3 mt-6', variant === 'overlay' && onClose ? 'grid grid-cols-2' : 'grid grid-cols-1')}>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            className="h-12 text-base font-semibold gap-2"
          >
            {saved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {saved ? tr("Saved") : saving ? tr("Saving…") : tr("Save")}
          </Button>
          {variant === 'overlay' && onClose && (
            <Button
              onClick={onClose}
              className="h-12 text-base font-semibold"
            >
              {tr("Continue")}
            </Button>
          )}
        </div>}
    </div>
  );
}
