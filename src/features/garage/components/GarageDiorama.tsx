import { Bike } from '../types';
import { MechaNick } from './MechaNick';

interface Props {
  bike: Bike | null;
  tip?: string | null;
}

export function GarageDiorama({ bike, tip }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-[#1c1b1f] via-[#15141a] to-[#0d0c10] shadow-[inset_0_1px_0_hsl(220_15%_100%/0.05),0_24px_48px_-24px_hsl(0_0%_0%/0.7)]">
      {/* ============ BACK WALL ============ */}
      <div className="absolute inset-x-0 top-0 h-[58%] pointer-events-none overflow-hidden">
        {/* Brick / panel texture */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 31px, hsl(var(--foreground)/0.8) 31px 32px), repeating-linear-gradient(90deg, transparent 0 64px, hsl(var(--foreground)/0.5) 64px 65px)',
          }}
        />
        {/* Warm overhead spotlight */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[80%] h-40 rounded-full blur-3xl opacity-40 bg-accent" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-1.5 rounded-full bg-accent/60 shadow-[0_0_24px_hsl(var(--accent))]" />

        {/* Pegboard tools silhouette (right) */}
        <div className="absolute top-6 right-4 flex gap-2 opacity-50">
          <div className="w-2 h-10 rounded-b-md bg-foreground/40" />
          <div className="w-3 h-12 rounded-b-md bg-foreground/40" />
          <div className="w-2 h-8 rounded-b-md bg-foreground/40" />
        </div>

        {/* Neon "GARAGE" sign (left) */}
        <div className="absolute top-6 left-4 px-2.5 py-1 rounded-md border border-accent/60 text-[10px] uppercase tracking-[0.3em] text-accent shadow-[0_0_18px_hsl(var(--accent)/0.45)] bg-accent/5">
          Open
        </div>
      </div>

      {/* ============ SHOP FLOOR ============ */}
      <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none overflow-hidden">
        {/* Floor base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, hsl(220 18% 11%) 0%, hsl(220 22% 5%) 100%)',
          }}
        />
        {/* Perspective checker tiles */}
        <div
          className="absolute inset-x-[-20%] top-0 bottom-[-20%] opacity-[0.18]"
          style={{
            transform: 'perspective(420px) rotateX(58deg)',
            transformOrigin: 'center top',
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)/0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.5) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
          }}
        />
        {/* Floor / wall seam glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-accent/10 to-transparent" />
        {/* Oil stain */}
        <div
          className="absolute left-[20%] bottom-4 w-32 h-3 rounded-[50%] blur-md opacity-50"
          style={{ background: 'radial-gradient(ellipse, hsl(0 0% 0% / 0.9) 0%, transparent 70%)' }}
        />
      </div>

      {/* ============ CONTENT ============ */}
      <div className="relative px-4 pt-5 pb-3 h-[360px] sm:h-[400px] flex items-end gap-2">
        {/* Bike hero */}
        <div className="flex-1 relative h-full flex items-end justify-center">
          {bike ? (
            <div className="relative w-full h-full">
              <img
                src={bike.photos.hero}
                alt={bike.name}
                className="absolute left-1/2 bottom-10 -translate-x-1/2 max-h-[72%] max-w-[88%] object-contain drop-shadow-[0_14px_10px_rgba(0,0,0,0.75)] animate-fade-in"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* Contact shadow */}
              <div
                className="absolute left-1/2 bottom-7 -translate-x-1/2 w-[62%] h-7 rounded-[50%] blur-md opacity-80"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.85) 0%, transparent 70%)' }}
              />
            </div>
          ) : (
            <div className="text-center text-muted-foreground self-center mb-12">
              <p className="text-sm uppercase tracking-widest opacity-60">No bike yet</p>
              <p className="text-xs opacity-50 mt-1">Add one to fill the garage</p>
            </div>
          )}
        </div>

        {/* Mecha-Nick */}
        <MechaNick tip={tip} className="flex-shrink-0 self-end -mr-1" />
      </div>
    </div>
  );
}
