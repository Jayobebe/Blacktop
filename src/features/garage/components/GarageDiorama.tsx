import { useState } from 'react';
import { Bike } from '../types';
import { MechaNick } from './MechaNick';
import { cn } from '@/lib/utils';

interface Props {
  bike: Bike | null;
  tip?: string | null;
}

type Angle = 'left' | 'right' | 'front' | 'back';
const THUMBS: Angle[] = ['left', 'right', 'front', 'back'];

export function GarageDiorama({ bike, tip }: Props) {
  const [hero, setHero] = useState<Angle>('left');

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-[#1a1a1f] via-[#141417] to-[#0e0e11] shadow-[inset_0_1px_0_hsl(220_15%_100%/0.04),0_20px_40px_-20px_hsl(0_0%_0%/0.6)]">
      {/* Wall */}
      <div className="absolute inset-x-0 top-0 h-1/2 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 23px, hsl(var(--foreground)/0.6) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, hsl(var(--foreground)/0.6) 23px 24px)',
          }}
        />
        {/* Accent rim light */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-3/4 h-24 rounded-full blur-3xl opacity-30 bg-accent" />
      </div>

      {/* Shop floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, hsl(220 15% 9%) 0%, hsl(220 15% 6%) 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            perspective: '600px',
            transform: 'rotateX(55deg) translateY(-10%)',
            transformOrigin: 'center top',
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 40px, hsl(var(--accent)/0.4) 40px 41px), repeating-linear-gradient(90deg, transparent 0 40px, hsl(var(--accent)/0.4) 40px 41px)',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative px-4 pt-6 pb-4 h-[340px] sm:h-[380px] flex items-end">
        {/* Bike cutout */}
        <div className="flex-1 relative h-full flex items-end justify-center">
          {bike ? (
            <div className="relative w-full h-full">
              <img
                key={hero}
                src={bike.photos[hero]}
                alt={`${bike.name} ${hero}`}
                className="absolute left-1/2 bottom-12 -translate-x-1/2 max-h-[70%] max-w-[80%] object-contain drop-shadow-[0_12px_8px_rgba(0,0,0,0.7)] animate-fade-in"
                style={{ filter: 'contrast(1.08) saturate(0.92)' }}
              />
              {/* Contact shadow */}
              <div
                className="absolute left-1/2 bottom-8 -translate-x-1/2 w-[60%] h-6 rounded-[50%] blur-md opacity-70"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.8) 0%, transparent 70%)' }}
              />
              {/* Thumbs */}
              <div className="absolute bottom-1 left-1 flex gap-1">
                {THUMBS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setHero(a)}
                    className={cn(
                      'h-10 w-12 rounded-lg overflow-hidden border-2 transition-all',
                      hero === a ? 'border-accent' : 'border-border/40 opacity-60 hover:opacity-100',
                    )}
                    aria-label={`Show ${a}`}
                  >
                    <img src={bike.photos[a]} alt={a} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
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
