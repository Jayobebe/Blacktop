import { useEffect, useRef, useState } from 'react';
import { Bike, BikePlacement, DEFAULT_BIKE_PLACEMENT } from '../types';
import { MechaNick } from './MechaNick';
import shopAsset from '@/assets/garage-shop.png.asset.json';

interface Props {
  bike: Bike | null;
  tip?: string | null;
  /** Contextual dialogue lines for Mecha-Nick. */
  nickLines?: string[];
  /** When true, the bike can be dragged & resized. */
  editing?: boolean;
  /** Live placement updates while editing. */
  onPlacementChange?: (p: BikePlacement) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Shop diorama — real photographic backdrop of the workshop floor. The bike
 * render sits on the floor; Nick stands on the right.
 *
 * When `editing` is true, the bike PNG becomes draggable and a size slider is
 * shown. Position/size are reported back through `onPlacementChange`.
 */
export function GarageDiorama({ bike, tip, nickLines, editing = false, onPlacementChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = bike?.placement ?? DEFAULT_BIKE_PLACEMENT;
  const [placement, setPlacement] = useState<BikePlacement>(initial);

  // Sync external bike changes into local state
  useEffect(() => {
    setPlacement(bike?.placement ?? DEFAULT_BIKE_PLACEMENT);
  }, [bike?.id, bike?.placement]);

  const update = (next: Partial<BikePlacement>) => {
    setPlacement((prev) => {
      const merged = { ...prev, ...next };
      onPlacementChange?.(merged);
      return merged;
    });
  };

  const dragRef = useRef<{ startX: number; startY: number; startXPct: number; startYPct: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing || !containerRef.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXPct: placement.xPct,
      startYPct: placement.yPct,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!editing || !dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    update({
      xPct: clamp(dragRef.current.startXPct + dx, 5, 95),
      yPct: clamp(dragRef.current.startYPct - dy, 0, 80),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-3xl border border-accent/60 bg-black select-none touch-none"
      style={{
        boxShadow:
          '0 0 0 1px hsl(var(--accent) / 0.55), 0 18px 40px -12px rgba(0,0,0,0.85), 0 30px 60px -20px rgba(0,0,0,0.7)',
      }}
    >
      {/* Photographic backdrop */}
      <img
        src={shopAsset.url}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Faded black vignette for depth + readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 60%, transparent 40%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {/* Subtle accent floor wash to tie lighting to theme */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(to top, hsl(var(--accent) / 0.18), transparent)',
        }}
      />

      {/* Bike (absolutely positioned over the floor) */}
      {bike?.photos?.hero ? (
        <>
          {/* Shadow puck */}
          <div
            className="absolute pointer-events-none rounded-[50%] blur-md opacity-90"
            style={{
              left: `${placement.xPct}%`,
              bottom: `${Math.max(placement.yPct - 2, 0)}%`,
              width: `${placement.scalePct * 0.7}%`,
              height: `${Math.max(placement.scalePct * 0.06, 10)}px`,
              transform: 'translateX(-50%)',
              background: 'radial-gradient(ellipse, rgba(0,0,0,0.9) 0%, transparent 70%)',
            }}
          />
          <img
            src={bike.photos.hero}
            alt={bike.name}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`absolute object-contain drop-shadow-[0_16px_12px_rgba(0,0,0,0.88)] animate-fade-in ${
              editing ? 'cursor-grab active:cursor-grabbing ring-2 ring-accent/70 rounded-md' : ''
            }`}
            style={{
              left: `${placement.xPct}%`,
              bottom: `${placement.yPct}%`,
              height: `${placement.scalePct}%`,
              maxWidth: '90%',
              transform: 'translateX(-50%)',
              imageRendering: 'pixelated',
              touchAction: 'none',
            }}
            draggable={false}
          />
        </>
      ) : (
        <div className="absolute left-[38%] bottom-16 -translate-x-1/2 text-center text-foreground/80">
          <p className="text-sm uppercase tracking-widest opacity-80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            No vehicle yet
          </p>
          <p className="text-xs opacity-70 mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            Add one to fill the garage
          </p>
        </div>
      )}

      {/* Nick — right side, on top */}
      <div className="relative px-4 pt-5 pb-3 h-[360px] sm:h-[400px] flex items-end justify-end pointer-events-none">
        <div className="pointer-events-auto">
          <MechaNick tip={tip} lines={nickLines} className="flex-shrink-0 self-end -mr-1" />
        </div>
      </div>

      {/* Size slider overlay when editing */}
      {editing && bike?.photos?.hero && (
        <div className="absolute left-3 right-3 top-3 flex items-center gap-2 rounded-xl bg-black/70 backdrop-blur px-3 py-2 border border-accent/40">
          <span className="text-[10px] uppercase tracking-widest text-accent">Size</span>
          <input
            type="range"
            min={20}
            max={100}
            step={1}
            value={placement.scalePct}
            onChange={(e) => update({ scalePct: Number(e.target.value) })}
            className="flex-1 accent-[hsl(var(--accent))]"
          />
          <span className="text-[10px] tabular-nums text-foreground/70 w-8 text-right">
            {placement.scalePct}%
          </span>
        </div>
      )}
      {editing && (
        <div className="absolute left-3 right-3 bottom-3 text-center text-[11px] uppercase tracking-widest text-accent/90 pointer-events-none">
          Drag the vehicle to position it
        </div>
      )}
    </div>
  );
}
