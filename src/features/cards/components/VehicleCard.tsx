import { useRef, useState } from 'react';
import { ArrowUp, Lock, Gauge, Route, Clock, Hash, Sparkles, Download, Zap, RotateCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  getDistanceLabel,
  getSpeedLabel,
} from '@/lib/format';
import { TIER_STYLES } from '../types';
import { VehicleCardData } from '../hooks/useVehicleCards';
import { encodeCard } from '../lib/cardCodec';

interface Props {
  card: VehicleCardData;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vehicle';
}

export function VehicleCard({ card }: Props) {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const style = TIER_STYLES[card.tier];
  const locked = card.tier === 'locked';
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const qrPayload = locked ? null : encodeCard(card, profile.name);


  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    // Clone the card into an offscreen, transform-free wrapper so embla/carousel
    // transforms don't skew or crop the captured image.
    const source = cardRef.current;
    const rect = source.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.round(width * (7 / 5));

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.zIndex = '-1';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'none';
    wrapper.style.padding = '24px';
    wrapper.style.background = 'transparent';

    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.maxWidth = 'none';
    // Strip the download button from the captured image.
    clone.querySelectorAll('[data-export-hide]').forEach((el) => el.remove());
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: 'transparent',
        width,
        height,
        style: { transform: 'none', margin: '0' },
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
      wrapper.remove();
      setIsExporting(false);
    }
  };

  return (
    <div className="relative w-full max-w-[280px] mx-auto aspect-[5/7] [perspective:1200px]">
      <div
        className={cn(
          'relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]',
          flipped && '[transform:rotateY(180deg)]',
        )}
      >
        {/* FRONT FACE */}
        <div
          ref={cardRef}
          className={cn(
            'absolute inset-0 rounded-2xl border-2 overflow-hidden shadow-lg flex flex-col [backface-visibility:hidden]',
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
              <div className="flex items-center gap-1.5 shrink-0">
                {!isExporting && (
                  <button
                    type="button"
                    data-export-hide
                    onClick={handleDownload}
                    aria-label="Download card as image"
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-full transition-transform active:scale-90',
                      style.chip,
                    )}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                )}
                {!locked && qrPayload && (
                  <button
                    type="button"
                    data-export-hide
                    onClick={() => setFlipped(true)}
                    aria-label="Flip to show QR code"
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-full transition-transform active:scale-90',
                      style.chip,
                    )}
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
                    style.chip,
                  )}
                >
                  {locked ? <Lock className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                  {card.tierLabel}
                </span>
              </div>
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
            ) : (() => {
              const cells: (StatCellProps & { key: string })[] = [
                {
                  key: 'speed',
                  icon: Gauge,
                  label: 'Top speed',
                  value: `${formatSpeed(card.stats.topSpeedMph, settings.speedUnit)}`,
                  unit: getSpeedLabel(settings.speedUnit),
                  improved: card.improved.topSpeed,
                },
                {
                  key: 'time',
                  icon: Clock,
                  label: 'Time',
                  value: formatDuration(card.stats.totalDurationSec),
                  unit: '',
                  improved: card.improved.duration,
                },
                {
                  key: 'distance',
                  icon: Route,
                  label: 'Distance',
                  value: formatDistance(card.stats.totalDistanceMi, settings.distanceUnit),
                  unit: getDistanceLabel(settings.distanceUnit),
                  improved: card.improved.distance,
                },
                {
                  key: 'rides',
                  icon: Hash,
                  label: 'Rides',
                  value: `${card.stats.totalRides}`,
                  unit: '',
                  improved: card.improved.rides,
                  unitMuted: true,
                },
              ];
              if (settings.leanAngleEnabled) {
                cells.push({
                  key: 'lean',
                  label: 'Max lean',
                  value: `${Math.round(card.stats.maxLean)}`,
                  unit: '°',
                  improved: card.improved.maxLean,
                });
              }
              if (settings.gForceEnabled) {
                cells.push({
                  key: 'gforce',
                  icon: Zap,
                  label: 'Max G',
                  value: card.stats.maxGForce > 0 ? card.stats.maxGForce.toFixed(1) : '—',
                  unit: card.stats.maxGForce > 0 ? 'G' : '',
                  improved: card.improved.maxGForce,
                });
              }
              return (
                <div className={cn('grid gap-1.5 mt-auto', cells.length > 4 ? 'grid-cols-3' : 'grid-cols-2')}>
                  {cells.map(({ key, ...cell }) => <StatCell key={key} {...cell} />)}
                </div>
              );
            })()}

            {!locked && card.nextTierRides > 0 && (
              <p className="text-center text-[9px] uppercase tracking-widest text-white/60 mt-1">
                {card.nextTierRides} rides to next tier
              </p>
            )}
          </div>
        </div>

        {/* BACK FACE — QR code for sharing */}
        {!locked && qrPayload && (
          <div
            className={cn(
              'absolute inset-0 rounded-2xl border-2 overflow-hidden shadow-lg flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]',
              style.bg,
              style.border,
            )}
          >
            {style.shine && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 animate-card-shine" />
              </div>
            )}
            <div className="relative flex-1 flex flex-col items-center p-4 gap-3">
              <div className="w-full flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-white/60 truncate">
                    {profile.name || 'Anonymous rider'}
                  </p>
                  <h3 className="text-sm font-bold leading-tight text-white truncate">
                    {card.bike.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFlipped(false)}
                  aria-label="Flip back"
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full transition-transform active:scale-90 shrink-0',
                    style.chip,
                  )}
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center w-full">
                <div className="bg-white p-3 rounded-xl shadow-inner">
                  <QRCodeSVG
                    value={qrPayload}
                    size={180}
                    level="M"
                    marginSize={0}
                  />
                </div>
              </div>

              <p className="text-[9px] uppercase tracking-widest text-white/60 text-center">
                Scan in Blacktop World<br />to add to a collection
              </p>
            </div>
          </div>
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
