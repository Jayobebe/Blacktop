import { useEffect, useMemo, useState } from 'react';

type Origin = { x: number; y: number } | null;

/**
 * Full-screen burn overlay. Flames spread radially OUT from the burn
 * button's position, leaving rolling smoke behind — no hard yellow edge.
 */
export function BurnFlameOverlay({
  active,
  origin,
  onComplete,
}: {
  active: boolean;
  origin?: Origin;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const t = setTimeout(() => {
      onComplete?.();
    }, 2200);
    return () => clearTimeout(t);
  }, [active, onComplete]);

  // Origin in CSS pixels; fallback to viewport center
  const ox = origin?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const oy = origin?.y ?? (typeof window !== 'undefined' ? window.innerHeight * 0.85 : 0);

  // Random tongues of fire shooting in many directions
  const tongues = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => {
        const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 60 + Math.random() * 45; // vmax
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist,
          size: 18 + Math.random() * 22, // vmax
          delay: Math.random() * 280,
          duration: 1100 + Math.random() * 700,
          hue: 8 + Math.random() * 35, // red→amber, no yellow front
        };
      }),
    [visible]
  );

  const embers = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 60;
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist - 20, // bias slightly up
          size: 2 + Math.random() * 3,
          delay: Math.random() * 600,
          duration: 1200 + Math.random() * 800,
          hot: i % 3 === 0,
        };
      }),
    [visible]
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Smoke fills the screen behind everything, soft and rolling */}
      <div className="absolute inset-0 animate-burn-smoke-fill" />

      {/* Expanding flame core from the origin */}
      <div
        className="absolute animate-burn-core"
        style={{
          left: ox,
          top: oy,
          width: '20vmax',
          height: '20vmax',
          marginLeft: '-10vmax',
          marginTop: '-10vmax',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, hsl(45 100% 65% / 0.95) 0%, hsl(25 100% 55% / 0.9) 30%, hsl(10 95% 45% / 0.75) 55%, hsl(0 80% 30% / 0.4) 75%, transparent 100%)',
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Soft outer heat halo also radiating from origin */}
      <div
        className="absolute animate-burn-halo"
        style={{
          left: ox,
          top: oy,
          width: '10vmax',
          height: '10vmax',
          marginLeft: '-5vmax',
          marginTop: '-5vmax',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, hsl(20 100% 55% / 0.55), hsl(15 90% 40% / 0.25) 50%, transparent 80%)',
          filter: 'blur(20px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Tongues of fire shooting outward in all directions */}
      {tongues.map((t, i) => (
        <span
          key={`t-${i}`}
          className="absolute block animate-burn-tongue-out"
          style={{
            left: ox,
            top: oy,
            width: `${t.size}vmax`,
            height: `${t.size}vmax`,
            marginLeft: `-${t.size / 2}vmax`,
            marginTop: `-${t.size / 2}vmax`,
            borderRadius: '50%',
            background: `radial-gradient(circle, hsl(${t.hue + 20} 100% 60% / 0.8) 0%, hsl(${t.hue} 100% 50% / 0.7) 40%, hsl(${t.hue - 5} 90% 35% / 0.35) 70%, transparent 100%)`,
            filter: 'blur(8px)',
            mixBlendMode: 'screen',
            ['--tx' as string]: `${t.tx}vmax`,
            ['--ty' as string]: `${t.ty}vmax`,
            animationDelay: `${t.delay}ms`,
            animationDuration: `${t.duration}ms`,
          }}
        />
      ))}

      {/* Embers flying outward */}
      {embers.map((e, i) => (
        <span
          key={`e-${i}`}
          className="absolute block rounded-full animate-burn-ember-out"
          style={{
            left: ox,
            top: oy,
            width: `${e.size}px`,
            height: `${e.size}px`,
            marginLeft: `-${e.size / 2}px`,
            marginTop: `-${e.size / 2}px`,
            background: e.hot ? 'hsl(50 100% 75%)' : 'hsl(20 100% 60%)',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.9)',
            ['--tx' as string]: `${e.tx}vmax`,
            ['--ty' as string]: `${e.ty}vmax`,
            animationDelay: `${e.delay}ms`,
            animationDuration: `${e.duration}ms`,
          }}
        />
      ))}

      {/* Final smoke wash — replaces the old hard yellow flash */}
      <div className="absolute inset-0 animate-burn-smoke-clear" />
    </div>
  );
}
