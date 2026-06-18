import { useEffect, useMemo, useRef, useState } from 'react';
import { ConvoyMemberInfo, calculateBadges, MemberBadge, BadgeType } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { Crown, User, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { BTLogo } from '@/components/BTLogo';
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
}

interface RideSummaryProps {
  members: ConvoyMemberInfo[];
  currentUserId?: string;
  rideStats?: RideStats;
  bikeName?: string | null;
  bikePhoto?: string | null;
  onBadgesEarned?: (badges: BadgeType[]) => void;
  onClose: () => void;
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

export function RideSummary({ members, currentUserId, rideStats, bikeName, bikePhoto, onBadgesEarned, onClose }: RideSummaryProps) {
  const { settings } = useSettings();

  const shouldCalculateBadges = members.length >= 2;
  const badgesMap = useMemo(
    () => (shouldCalculateBadges ? calculateBadges(members) : new Map()),
    [members, shouldCalculateBadges]
  );

  // Show only the current user's badges on their personal receipt.
  // Fallback: if no currentUserId, show all (e.g. shared/demo view).
  const badgeAwards: { member: ConvoyMemberInfo; badge: MemberBadge }[] = [];
  if (shouldCalculateBadges) {
    members.forEach((member) => {
      if (currentUserId && member.userId !== currentUserId) return;
      const memberBadges = badgesMap.get(member.userId) || [];
      memberBadges.forEach((badge) => badgeAwards.push({ member, badge }));
    });
  }
  const badgeOrder = { 'speed-demon': 0, journeyman: 1, fallback: 2 } as const;
  badgeAwards.sort((a, b) => badgeOrder[a.badge.type] - badgeOrder[b.badge.type]);

  useEffect(() => {
    if (currentUserId && onBadgesEarned && shouldCalculateBadges) {
      const userBadges = badgesMap.get(currentUserId);
      if (userBadges && userBadges.length > 0) {
        onBadgesEarned(userBadges.map((b: MemberBadge) => b.type));
      }
    }
  }, [currentUserId, onBadgesEarned, badgesMap, shouldCalculateBadges]);

  // Pin timestamp + order id so they don't reshuffle on re-render or saved image
  const { dateStr, timeStr, orderId } = useMemo(() => {
    const now = new Date();
    return {
      dateStr: now
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase(),
      timeStr: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      orderId: `#${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };
  }, []);

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
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-[360px] animate-receipt-print">
        <div className="receipt-edge-top" />
        <div ref={receiptRef} className="receipt relative px-6 py-5 font-receipt text-[--ink]">
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
            <div className="text-sm tracking-[0.3em] opacity-70 mt-1">— RIDE RECEIPT —</div>
          </div>

          {/* Bike line (from garage) */}
          <div className="mt-4" data-bike-slot>
            <ReceiptRow label="Bike" value={bikeName || '—'} />
            {bikePhoto && (
              <div className="mt-3 flex items-center justify-center">
                <img
                  src={bikePhoto}
                  alt={bikeName || 'Bike'}
                  crossOrigin="anonymous"
                  className="max-h-32 w-auto object-contain"
                  style={{ filter: 'grayscale(100%) contrast(1.15)', mixBlendMode: 'multiply' }}
                />
              </div>
            )}
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

          {/* Bike model block — only show placeholder if no bike */}
          {!bikeName && (
            <div className="receipt-bracket text-center" data-bike-slot>
              <span className="receipt-bracket-tr" />
              <span className="receipt-bracket-bl" />
              <div className="text-xl tracking-[0.2em]">BIKE MODEL</div>
              <div className="text-sm opacity-60 mt-1">add in garage</div>
            </div>
          )}

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
                    key={`${member.userId}-${badge.type}`}
                    className="receipt-bracket text-center px-2 py-3"
                  >
                    <span className="receipt-bracket-tr" />
                    <span className="receipt-bracket-bl" />
                    <div className="text-2xl leading-none mb-1">{badge.emoji}</div>
                    <div className="text-[11px] uppercase tracking-wider font-bold leading-tight">
                      {badge.label}
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[10px] opacity-70 mt-1 truncate">
                      {member.isLeader ? <Crown className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                      <span className="truncate">{member.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="my-4 border-t-2 border-dashed border-[--ink] opacity-60" />
          <div className="text-center space-y-2">
            <div className="text-base tracking-[0.25em]">THANK YOU FOR RIDING</div>
            <div className="text-xs opacity-60 tracking-widest">ORDER {orderId}</div>
            <div className="receipt-barcode mt-3" aria-hidden />
            <div className="text-[10px] tracking-[0.4em] opacity-70 mt-1">BLACKTOP · {dateStr}</div>
          </div>

          {!rideStats && badgeAwards.length === 0 && (
            <div className="text-center py-4 text-sm opacity-60">No data to display.</div>
          )}
        </div>
        <div className="receipt-edge-bottom" />

        {/* Action buttons (outside the receipt) */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            className="h-12 text-base font-semibold gap-2"
          >
            {saved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            onClick={onClose}
            className="h-12 text-base font-semibold"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
