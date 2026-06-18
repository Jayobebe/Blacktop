import { useRef, useState } from 'react';
import { ArrowUp, Lock, Gauge, Route, Clock, Hash, Sparkles, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  getDistanceLabel,
  getSpeedLabel,
} from '@/lib/format';
import { TIER_STYLES } from '../types';
import { VehicleCardData } from '../hooks/useVehicleCards';

interface Props {
  card: VehicleCardData;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vehicle';
}

export function VehicleCard({ card }: Props) {
  const { settings } = useSettings();
  const style = TIER_STYLES[card.tier];
  const locked = card.tier === 'locked';
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      // Wait a frame so the button hides before capture.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: 'transparent',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${slugify(card.bike.name)}-${card.tier}-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Card downloaded');
    } catch (err) {
      console.error('Card export failed', err);
      toast.error('Could not save card');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative w-full max-w-[280px] mx-auto aspect-[5/7] rounded-2xl border-2 overflow-hidden shadow-lg flex flex-col',
        style.bg,
        style.border,
        card.isNewTier && 'animate-card-tier-pulse',
      )}
    >
      {/* Sheen / shimmer */}
      {style.shine && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 animate-card-shine" />
        </div>
      )}

      {/* Sparkle overlay (diamond / polyatomic / orion) */}
      {style.sparkle && (
        <div className="absolute inset-0 pointer-events-none opacity-60 [background-image:radial-gradient(circle_at_20%_30%,white_0.5px,transparent_1px),radial-gradient(circle_at_70%_60%,white_0.5px,transparent_1px),radial-gradient(circle_at_45%_80%,white_0.5px,transparent_1px),radial-gradient(circle_at_85%_20%,white_0.5px,transparent_1px)] [background-size:120px_120px,140px_140px,100px_100px,160px_160px]" />
      )}

      {/* Inner content frame */}
      <div className="relative flex-1 flex flex-col p-3.5 gap-2.5">
        {/* Header: name + tier chip */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-tight truncate text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              {card.bike.name}
            </h3>
            {card.bike.makeModel && (
              <p className="text-[10px] uppercase tracking-wider text-white/70 truncate font-medium">
                {card.bike.makeModel}
              </p>
            )}
          </div>
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
              style.chip,
            )}
          >
            {locked ? <Lock className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
            {card.tierLabel}
          </span>
        </div>

        {/* Hero photo */}
        <div className="relative rounded-xl overflow-hidden bg-black/30 aspect-[4/3] border border-white/10">
          {card.bike.photos.hero ? (
            <img
              src={card.bike.photos.hero}
              alt={card.bike.name}
              className={cn(
                'w-full h-full object-contain',
                locked && 'opacity-40 grayscale',
              )}
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
              No photo
            </div>
          )}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Lock className="w-8 h-8 text-white/70" />
            </div>
          )}
        </div>

        {/* Stats grid */}
        {locked ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
            <p className="text-sm font-semibold text-white/90">
              {card.stats.totalRides} / 10 rides
            </p>
            <p className="text-[10px] text-white/60 mt-1">
              First card unlocks at 10 rides
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mt-auto">
            <StatCell
              icon={Gauge}
              label="Top speed"
              value={`${formatSpeed(card.stats.topSpeedMph, settings.speedUnit)}`}
              unit={getSpeedLabel(settings.speedUnit)}
              improved={card.improved.topSpeed}
            />
            {settings.leanAngleEnabled ? (
              <StatCell
                label="Max lean"
                value={`${Math.round(card.stats.maxLean)}`}
                unit="°"
                improved={card.improved.maxLean}
              />
            ) : (
              <StatCell
                icon={Clock}
                label="Time"
                value={formatDuration(card.stats.totalDurationSec)}
                unit=""
                improved={card.improved.duration}
              />
            )}
            <StatCell
              icon={Route}
              label="Distance"
              value={formatDistance(card.stats.totalDistanceMi, settings.distanceUnit)}
              unit={getDistanceLabel(settings.distanceUnit)}
              improved={card.improved.distance}
            />
            <StatCell
              icon={Hash}
              label="Rides"
              value={`${card.stats.totalRides}`}
              unit={
                settings.leanAngleEnabled
                  ? formatDuration(card.stats.totalDurationSec)
                  : ''
              }
              improved={card.improved.rides}
              unitMuted
            />
          </div>
        )}

        {/* Footer: progress to next */}
        {!locked && card.nextTierRides > 0 && (
          <p className="text-center text-[9px] uppercase tracking-widest text-white/60 mt-1">
            {card.nextTierRides} rides to next tier
          </p>
        )}
      </div>
    </div>
  );
}

interface StatCellProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  improved: boolean;
  unitMuted?: boolean;
}

function StatCell({ icon: Icon, label, value, unit, improved, unitMuted }: StatCellProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-black/35 backdrop-blur-sm border border-white/10 px-2 py-1.5',
        improved && 'animate-card-stat-pulse',
      )}
    >
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-white/60">
        {Icon && <Icon className="w-2.5 h-2.5" />}
        <span className="truncate">{label}</span>
        {improved && <ArrowUp className="w-2.5 h-2.5 text-emerald-300 ml-auto" />}
      </div>
      <p className="font-mono text-sm font-bold text-white leading-tight truncate">
        {value}
        {unit && (
          <span
            className={cn(
              'ml-1 text-[10px] font-normal',
              unitMuted ? 'text-white/50' : 'text-white/70',
            )}
          >
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
