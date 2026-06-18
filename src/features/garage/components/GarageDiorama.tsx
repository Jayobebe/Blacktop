import { Bike } from '../types';
import { MechaNick } from './MechaNick';
import shopAsset from '@/assets/garage-shop.png.asset.json';

interface Props {
  bike: Bike | null;
  tip?: string | null;
}

/**
 * Shop diorama — real photographic backdrop of the workshop floor. The bike
 * render sits left-of-center on the floor; Nick stands on the right.
 */
export function GarageDiorama({ bike, tip }: Props) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-accent/60 bg-black"
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

      {/* ============ CONTENT ============ */}
      <div className="relative px-4 pt-5 pb-3 h-[360px] sm:h-[400px] flex items-end gap-2">
        {/* Bike render — left/middle of floor */}
        <div className="flex-1 relative h-full flex items-end justify-center">
          {bike?.photos?.hero?.startsWith('data:image/') ? (
            <div className="relative w-full h-full">
              <img
                src={bike.photos.hero}
                alt={bike.name}
                className="absolute left-[48%] bottom-16 -translate-x-1/2 max-h-[82%] max-w-[112%] object-contain drop-shadow-[0_16px_12px_rgba(0,0,0,0.88)] animate-fade-in"
                style={{ imageRendering: 'pixelated' }}
              />
              <div
                className="absolute left-[48%] bottom-12 -translate-x-1/2 w-[68%] h-7 rounded-[50%] blur-md opacity-90"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.9) 0%, transparent 70%)' }}
              />
            </div>
          ) : (
            <div className="absolute left-[42%] bottom-16 -translate-x-1/2 text-center text-foreground/80">
              <p className="text-sm uppercase tracking-widest opacity-80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                No bike yet
              </p>
              <p className="text-xs opacity-70 mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                Add one to fill the garage
              </p>
            </div>
          )}
        </div>

        <MechaNick tip={tip} className="flex-shrink-0 self-end -mr-1" />
      </div>
    </div>
  );
}
