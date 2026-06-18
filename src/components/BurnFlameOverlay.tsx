import { useEffect, useState } from 'react';

/**
 * Full-screen stylized flame-up overlay used by the Burn Button.
 * Mount with `active` true to play once; calls onComplete after the animation.
 */
export function BurnFlameOverlay({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const t = setTimeout(() => {
      onComplete?.();
    }, 1600);
    return () => clearTimeout(t);
  }, [active, onComplete]);

  if (!visible) return null;

  // Generate a fixed set of flame tongues
  const tongues = Array.from({ length: 14 });

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden animate-burn-fade">
      {/* Heat haze darken */}
      <div className="absolute inset-0 bg-black/40 animate-burn-darken" />

      {/* Rising glow gradient */}
      <div
        className="absolute inset-x-0 bottom-0 h-full animate-burn-rise"
        style={{
          background:
            'radial-gradient(ellipse 120% 60% at 50% 110%, hsl(45 100% 60% / 0.95) 0%, hsl(20 100% 50% / 0.85) 25%, hsl(10 90% 40% / 0.6) 50%, transparent 75%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Individual flame tongues */}
      <div className="absolute inset-x-0 bottom-0 h-full flex justify-around items-end">
        {tongues.map((_, i) => {
          const delay = (i % 5) * 60;
          const height = 70 + ((i * 37) % 25);
          const width = 8 + ((i * 13) % 8);
          return (
            <div
              key={i}
              className="animate-burn-tongue"
              style={{
                width: `${width}%`,
                height: `${height}%`,
                animationDelay: `${delay}ms`,
                background:
                  'radial-gradient(ellipse 50% 70% at 50% 100%, hsl(48 100% 65% / 0.9) 0%, hsl(25 100% 55% / 0.85) 35%, hsl(10 95% 45% / 0.55) 60%, transparent 80%)',
                filter: 'blur(6px)',
                mixBlendMode: 'screen',
                transformOrigin: 'bottom center',
              }}
            />
          );
        })}
      </div>

      {/* Embers */}
      <div className="absolute inset-0">
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full animate-burn-ember"
            style={{
              left: `${(i * 53) % 100}%`,
              bottom: '-10px',
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              background: i % 2 ? 'hsl(45 100% 70%)' : 'hsl(20 100% 60%)',
              boxShadow: '0 0 8px hsl(30 100% 60% / 0.9)',
              animationDelay: `${(i * 80) % 1200}ms`,
              animationDuration: `${1000 + (i * 53) % 600}ms`,
            }}
          />
        ))}
      </div>

      {/* Final white flash */}
      <div className="absolute inset-0 bg-white animate-burn-flash" />
    </div>
  );
}
