import { Bike } from '../types';
import { MechaNick } from './MechaNick';

interface Props {
  bike: Bike | null;
  tip?: string | null;
}

export function GarageDiorama({ bike, tip }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-[#0b0a0d] via-[#070608] to-[#030203] shadow-[inset_0_1px_0_hsl(220_15%_100%/0.04),0_24px_48px_-24px_hsl(0_0%_0%/0.9)]">
      {/* ============ BACK WALL ============ */}
      <div className="absolute inset-x-0 top-0 h-[58%] pointer-events-none overflow-hidden">
        {/* Brick / panel texture */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 31px, hsl(var(--foreground)/0.8) 31px 32px), repeating-linear-gradient(90deg, transparent 0 64px, hsl(var(--foreground)/0.5) 64px 65px)',
          }}
        />

        {/* ===== Track lighting rail (ceiling) ===== */}
        <div className="absolute top-3 left-[6%] right-[6%] h-px bg-foreground/20" />
        {/* Light fixtures */}
        {[12, 28, 44, 60, 76, 92].map((left) => (
          <div key={left} className="absolute top-3" style={{ left: `${left}%` }}>
            {/* fixture body */}
            <div className="w-2 h-2 -ml-1 rounded-sm bg-foreground/40" />
            {/* glowing bulb */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_hsl(var(--accent)/0.9)]" />
            {/* cone of light */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-44 opacity-30"
              style={{
                background:
                  'radial-gradient(ellipse at top, hsl(var(--accent)/0.55) 0%, hsl(var(--accent)/0.15) 35%, transparent 70%)',
                clipPath: 'polygon(35% 0%, 65% 0%, 100% 100%, 0% 100%)',
              }}
            />
          </div>
        ))}

        {/* Ambient warm wash from above */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[110%] h-56 rounded-full blur-3xl opacity-30 bg-accent" />

        {/* Pegboard tools silhouette (right) */}
        <div className="absolute top-12 right-4 flex gap-2 opacity-30">
          <div className="w-2 h-10 rounded-b-md bg-foreground/50" />
          <div className="w-3 h-12 rounded-b-md bg-foreground/50" />
          <div className="w-2 h-8 rounded-b-md bg-foreground/50" />
        </div>

        {/* Neon "OPEN" sign (left) */}
        <div className="absolute top-12 left-4 px-2.5 py-1 rounded-md border border-accent/70 text-[10px] uppercase tracking-[0.3em] text-accent shadow-[0_0_18px_hsl(var(--accent)/0.5)] bg-accent/5">
          Open
        </div>
      </div>

      {/* ============ SHOP FLOOR ============ */}
      <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none overflow-hidden">
        {/* Floor base — deep concrete */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, hsl(220 18% 7%) 0%, hsl(220 22% 3%) 100%)',
          }}
        />
        {/* Perspective checker tiles */}
        <div
          className="absolute inset-x-[-20%] top-0 bottom-[-20%] opacity-[0.12]"
          style={{
            transform: 'perspective(420px) rotateX(58deg)',
            transformOrigin: 'center top',
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)/0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.5) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
          }}
        />
        {/* Accent pool of light on floor */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-2 w-[70%] h-24 rounded-[50%] blur-2xl opacity-25"
          style={{ background: 'radial-gradient(ellipse, hsl(var(--accent)) 0%, transparent 70%)' }}
        />
        {/* Floor / wall seam glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-accent/15 to-transparent" />
        {/* Oil stain */}
        <div
          className="absolute left-[20%] bottom-4 w-32 h-3 rounded-[50%] blur-md opacity-60"
          style={{ background: 'radial-gradient(ellipse, hsl(0 0% 0% / 0.95) 0%, transparent 70%)' }}
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
                className="absolute left-1/2 bottom-10 -translate-x-1/2 max-h-[72%] max-w-[88%] object-contain drop-shadow-[0_14px_10px_rgba(0,0,0,0.85)] animate-fade-in"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* Contact shadow */}
              <div
                className="absolute left-1/2 bottom-7 -translate-x-1/2 w-[62%] h-7 rounded-[50%] blur-md opacity-90"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.9) 0%, transparent 70%)' }}
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
