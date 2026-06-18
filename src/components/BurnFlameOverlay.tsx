import { useEffect, useState } from 'react';

/**
 * Full-screen flame-up overlay, DuckDuckGo-style "Inferno":
 * a thick wall of layered cartoon flames sweeps up from the bottom,
 * covers the screen, then continues out the top trailing smoke,
 * before fading out. Then onComplete fires.
 */
export function BurnFlameOverlay({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const t = setTimeout(() => {
      onComplete?.();
    }, 1900);
    return () => clearTimeout(t);
  }, [active, onComplete]);

  if (!visible) return null;

  // Wavy flame top edge. Repeated peaks across the width.
  const flamePath =
    'M0,80 ' +
    // peaks
    'C 40,30 60,30 100,75 ' +
    'C 140,15 170,15 200,70 ' +
    'C 230,25 260,25 300,72 ' +
    'C 340,18 370,18 400,76 ' +
    'C 430,28 460,28 500,68 ' +
    'C 540,12 570,12 600,74 ' +
    'C 630,30 660,30 700,70 ' +
    'C 740,18 770,18 800,78 ' +
    'C 830,28 860,28 900,72 ' +
    'C 940,20 970,20 1000,76 ' +
    'L1000,200 L0,200 Z';

  const layers = [
    { color: 'hsl(0 85% 35%)', delay: 0, duration: 1500, scale: 1.0, opacity: 0.95 },   // deep red back
    { color: 'hsl(12 95% 48%)', delay: 80, duration: 1450, scale: 1.04, opacity: 0.95 }, // red-orange
    { color: 'hsl(25 100% 55%)', delay: 160, duration: 1400, scale: 1.08, opacity: 0.95 },// orange
    { color: 'hsl(40 100% 60%)', delay: 240, duration: 1350, scale: 1.12, opacity: 0.9 }, // amber
    { color: 'hsl(52 100% 68%)', delay: 320, duration: 1300, scale: 1.18, opacity: 0.85 },// yellow front
  ];

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Smoke / haze behind everything */}
      <div className="absolute inset-0 bg-black/30 animate-burn-darken" />

      {/* Soft heat glow from below */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 animate-burn-glow"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 100%, hsl(30 100% 55% / 0.65), transparent 75%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Stacked flame layers sweeping up */}
      {layers.map((l, i) => (
        <svg
          key={i}
          viewBox="0 0 1000 200"
          preserveAspectRatio="none"
          className="absolute left-0 w-full animate-burn-sweep"
          style={{
            bottom: 0,
            height: '140vh',
            color: l.color,
            opacity: l.opacity,
            animationDelay: `${l.delay}ms`,
            animationDuration: `${l.duration}ms`,
            transform: `scaleX(${l.scale})`,
            transformOrigin: 'center bottom',
            filter: i < 2 ? 'blur(1px)' : 'blur(0.5px)',
            mixBlendMode: 'normal',
          }}
        >
          <path d={flamePath} fill="currentColor" />
        </svg>
      ))}

      {/* Flickering top edge highlights (sparks/tips) */}
      <div className="absolute inset-0">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full animate-burn-ember"
            style={{
              left: `${(i * 41 + 7) % 100}%`,
              bottom: '-12px',
              width: `${3 + (i % 3)}px`,
              height: `${3 + (i % 3)}px`,
              background: i % 3 === 0 ? 'hsl(50 100% 75%)' : 'hsl(25 100% 60%)',
              boxShadow: '0 0 10px hsl(30 100% 60% / 0.9)',
              animationDelay: `${(i * 65) % 900}ms`,
              animationDuration: `${1100 + (i * 53) % 700}ms`,
            }}
          />
        ))}
      </div>

      {/* Trailing dark smoke after flames pass */}
      <div
        className="absolute inset-x-0 bottom-0 h-full animate-burn-smoke"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 100%, hsl(0 0% 10% / 0.85), hsl(0 0% 5% / 0.4) 60%, transparent 85%)',
        }}
      />

      {/* Final fade to clear */}
      <div className="absolute inset-0 bg-black animate-burn-clear" />
    </div>
  );
}
