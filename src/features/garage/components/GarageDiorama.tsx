import { Bike } from '../types';
import { MechaNick } from './MechaNick';

interface Props {
  bike: Bike | null;
  tip?: string | null;
}

/**
 * Shop diorama — back-wall fixtures (garage door, shelves, tires, tool chests,
 * pegboard) rendered as flat silhouettes lit by warm track lighting.
 */
export function GarageDiorama({ bike, tip }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-[#0b0a0d] via-[#070608] to-[#030203] shadow-[inset_0_1px_0_hsl(220_15%_100%/0.04),0_24px_48px_-24px_hsl(0_0%_0%/0.9)]">
      {/* ============ BACK WALL ============ */}
      <div className="absolute inset-x-0 top-0 h-[62%] pointer-events-none overflow-hidden">
        {/* Concrete wall texture */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 31px, hsl(var(--foreground)/0.8) 31px 32px), repeating-linear-gradient(90deg, transparent 0 64px, hsl(var(--foreground)/0.5) 64px 65px)',
          }}
        />

        {/* ===== Track lighting rail ===== */}
        <div className="absolute top-3 left-[4%] right-[4%] h-px bg-foreground/25" />
        {[8, 22, 36, 50, 64, 78, 92].map((left) => (
          <div key={left} className="absolute top-3" style={{ left: `${left}%` }}>
            {/* fixture */}
            <div className="w-2 h-2 -ml-1 rounded-sm bg-foreground/50" />
            {/* bulb */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_hsl(var(--accent)/0.95)]" />
            {/* light cone */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-40 opacity-25"
              style={{
                background:
                  'radial-gradient(ellipse at top, hsl(var(--accent)/0.6) 0%, hsl(var(--accent)/0.18) 35%, transparent 70%)',
                clipPath: 'polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)',
              }}
            />
          </div>
        ))}

        {/* Ambient warm wash */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[110%] h-56 rounded-full blur-3xl opacity-25 bg-accent" />

        {/* ===== Garage roller door (center back) ===== */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-[26%] w-[42%] h-[58%] rounded-t-md"
          style={{
            background:
              'linear-gradient(180deg, hsl(220 10% 12%) 0%, hsl(220 12% 8%) 100%)',
            backgroundImage:
              'repeating-linear-gradient(180deg, hsl(220 10% 14%) 0px, hsl(220 10% 14%) 5px, hsl(220 10% 9%) 5px, hsl(220 10% 9%) 6px)',
            boxShadow: 'inset 0 2px 0 hsl(0 0% 0% / 0.6)',
          }}
        />
        {/* Door window slats */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-[32%] w-[34%] h-3 rounded-sm opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, hsl(var(--accent)/0.4) 0 4px, transparent 4px 8px)',
          }}
        />

        {/* ===== Left wall: shelving silhouette ===== */}
        <div className="absolute left-1 top-[28%] w-[16%] h-[55%]">
          {/* uprights */}
          <div className="absolute inset-y-0 left-0 w-0.5 bg-foreground/30" />
          <div className="absolute inset-y-0 right-0 w-0.5 bg-foreground/30" />
          {/* shelves */}
          {[10, 35, 60, 85].map((top) => (
            <div key={top} className="absolute left-0 right-0 h-px bg-foreground/30" style={{ top: `${top}%` }} />
          ))}
          {/* helmet shapes */}
          <div className="absolute left-1 top-[12%] w-4 h-3 rounded-t-full bg-foreground/40" />
          <div className="absolute right-1 top-[12%] w-3 h-2.5 rounded-t-full bg-foreground/35" />
          {/* boxes */}
          <div className="absolute left-1 top-[40%] w-3 h-3 bg-accent/40" />
          <div className="absolute left-5 top-[42%] w-2.5 h-2.5 bg-foreground/30" />
          <div className="absolute right-1 top-[40%] w-3 h-3 bg-foreground/30" />
          {/* jerry can */}
          <div className="absolute left-2 top-[65%] w-3 h-4 rounded-sm bg-foreground/35" />
          <div className="absolute right-1 top-[66%] w-3 h-3 rounded-sm bg-accent/30" />
        </div>

        {/* ===== Right wall: pegboard with tools ===== */}
        <div
          className="absolute right-1 top-[28%] w-[18%] h-[40%] rounded-sm"
          style={{
            background: 'hsl(25 35% 18%)',
            backgroundImage:
              'radial-gradient(circle, hsl(0 0% 0% / 0.5) 0.5px, transparent 1px)',
            backgroundSize: '6px 6px',
            opacity: 0.7,
          }}
        />
        {/* wrench silhouettes on pegboard */}
        <div className="absolute right-3 top-[32%] w-1 h-7 rounded-sm bg-foreground/55" />
        <div className="absolute right-6 top-[31%] w-1 h-8 rounded-sm bg-foreground/55" />
        <div className="absolute right-9 top-[33%] w-1 h-6 rounded-sm bg-foreground/55" />
        <div className="absolute right-12 top-[32%] w-1.5 h-7 rounded-sm bg-foreground/55" />
        {/* gear */}
        <div className="absolute right-4 top-[50%] w-4 h-4 rounded-full border-2 border-foreground/50" />

        {/* ===== Tire stacks (mid-right of door) ===== */}
        <div className="absolute top-[58%]" style={{ right: '24%' }}>
          <div className="w-7 h-2 rounded-full bg-foreground/40 mb-0.5" />
          <div className="w-7 h-2 rounded-full bg-foreground/45 mb-0.5" />
          <div className="w-7 h-2 rounded-full bg-foreground/50" />
        </div>
        <div className="absolute top-[60%]" style={{ right: '32%' }}>
          <div className="w-6 h-1.5 rounded-full bg-foreground/35 mb-0.5" />
          <div className="w-6 h-1.5 rounded-full bg-foreground/40 mb-0.5" />
          <div className="w-6 h-1.5 rounded-full bg-foreground/45" />
        </div>

        {/* ===== Tool chests under door (left & right of opening) ===== */}
        <div
          className="absolute bottom-1 left-[20%] w-12 h-10 rounded-sm"
          style={{
            background: 'linear-gradient(180deg, hsl(220 10% 16%) 0%, hsl(220 12% 10%) 100%)',
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 5px, hsl(0 0% 0% / 0.5) 5px 6px)',
          }}
        />
        <div
          className="absolute bottom-1 right-[22%] w-14 h-12 rounded-sm"
          style={{
            background: 'linear-gradient(180deg, hsl(220 10% 16%) 0%, hsl(220 12% 10%) 100%)',
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 5px, hsl(0 0% 0% / 0.5) 5px 6px)',
          }}
        />
        {/* red oil drum */}
        <div
          className="absolute bottom-1 left-[34%] w-5 h-9 rounded-sm"
          style={{
            background: 'linear-gradient(180deg, hsl(0 55% 28%) 0%, hsl(0 60% 18%) 100%)',
          }}
        />

        {/* Neon OPEN sign */}
        <div className="absolute top-12 left-3 px-2 py-0.5 rounded-md border border-accent/70 text-[9px] uppercase tracking-[0.3em] text-accent shadow-[0_0_18px_hsl(var(--accent)/0.5)] bg-accent/5">
          Open
        </div>
      </div>

      {/* ============ SHOP FLOOR ============ */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, hsl(220 18% 6%) 0%, hsl(220 22% 2%) 100%)',
          }}
        />
        {/* Perspective tiles */}
        <div
          className="absolute inset-x-[-20%] top-0 bottom-[-20%] opacity-[0.14]"
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
          className="absolute left-1/2 -translate-x-1/2 top-0 w-[75%] h-28 rounded-[50%] blur-2xl opacity-30"
          style={{ background: 'radial-gradient(ellipse, hsl(var(--accent)) 0%, transparent 70%)' }}
        />
        {/* Wall seam glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-accent/15 to-transparent" />
        {/* Oil stains */}
        <div
          className="absolute left-[18%] bottom-3 w-28 h-3 rounded-[50%] blur-md opacity-70"
          style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.95) 0%, transparent 70%)' }}
        />
        <div
          className="absolute right-[22%] bottom-5 w-20 h-2 rounded-[50%] blur-md opacity-60"
          style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.9) 0%, transparent 70%)' }}
        />
      </div>

      {/* ============ CONTENT ============ */}
      <div className="relative px-4 pt-5 pb-3 h-[360px] sm:h-[400px] flex items-end gap-2">
        <div className="flex-1 relative h-full flex items-end justify-center">
          {bike ? (
            <div className="relative w-full h-full">
              <img
                src={bike.photos.hero}
                alt={bike.name}
                className="absolute left-1/2 bottom-10 -translate-x-1/2 max-h-[68%] max-w-[88%] object-contain drop-shadow-[0_14px_10px_rgba(0,0,0,0.85)] animate-fade-in"
                style={{ imageRendering: 'pixelated' }}
              />
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

        <MechaNick tip={tip} className="flex-shrink-0 self-end -mr-1" />
      </div>
    </div>
  );
}
