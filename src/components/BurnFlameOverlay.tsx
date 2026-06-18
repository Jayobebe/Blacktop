import { useEffect, useMemo, useRef, useState } from 'react';

type Origin = { x: number; y: number } | null;

/**
 * Burn overlay. Fire spreads radially from the burn button, grows to a
 * dense flame mass, hands off to opaque smoke that fully covers the page,
 * then dissipates to reveal whatever is underneath (the onboarding screen).
 */
export function BurnFlameOverlay({
  active,
  origin,
  onPeak,
  onComplete,
}: {
  active: boolean;
  origin?: Origin;
  /** Fires when the screen is fully covered — safe to swap routes underneath. */
  onPeak?: () => void;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState(active);
  const peakFired = useRef(false);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    peakFired.current = false;
    const peak = setTimeout(() => {
      if (!peakFired.current) {
        peakFired.current = true;
        onPeak?.();
      }
    }, 900);
    const done = setTimeout(() => {
      onComplete?.();
    }, 2600);
    return () => {
      clearTimeout(peak);
      clearTimeout(done);
    };
  }, [active, onPeak, onComplete]);

  const ox = origin?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const oy = origin?.y ?? (typeof window !== 'undefined' ? window.innerHeight * 0.85 : 0);

  // Flame "blobs" that get merged by the gooey filter into solid flame shapes.
  const blobs = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => {
        const angle = (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 55 + Math.random() * 55; // vmax
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist - 10, // bias upward like real flame
          size: 22 + Math.random() * 18, // vmax
          delay: Math.random() * 200,
          duration: 900 + Math.random() * 500,
          hue: 8 + Math.random() * 30,
          light: 45 + Math.random() * 18,
        };
      }),
    [visible]
  );

  const embers = useMemo(
    () =>
      Array.from({ length: 40 }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 60;
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist - 30,
          size: 2 + Math.random() * 3,
          delay: Math.random() * 700,
          duration: 1200 + Math.random() * 900,
          hot: i % 3 === 0,
        };
      }),
    [visible]
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* SVG filter that fuses blurred blobs into solid flame shapes */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="burn-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 22 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Initial dark wash that scales from origin to fully cover the screen */}
      <div
        className="absolute animate-burn-cover"
        style={{
          left: ox,
          top: oy,
          width: '40vmax',
          height: '40vmax',
          marginLeft: '-20vmax',
          marginTop: '-20vmax',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, hsl(15 60% 18%) 0%, hsl(10 50% 10%) 60%, hsl(0 0% 4%) 100%)',
        }}
      />

      {/* Flame mass — gooey-fused blobs spreading outward from origin */}
      <div
        className="absolute inset-0"
        style={{ filter: 'url(#burn-goo)' }}
      >
        {/* Core */}
        <div
          className="absolute animate-burn-core"
          style={{
            left: ox,
            top: oy,
            width: '28vmax',
            height: '28vmax',
            marginLeft: '-14vmax',
            marginTop: '-14vmax',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, hsl(48 100% 62%) 0%, hsl(28 100% 55%) 35%, hsl(12 95% 48%) 65%, hsl(0 90% 35%) 100%)',
          }}
        />
        {blobs.map((b, i) => (
          <span
            key={`b-${i}`}
            className="absolute block animate-burn-blob"
            style={{
              left: ox,
              top: oy,
              width: `${b.size}vmax`,
              height: `${b.size}vmax`,
              marginLeft: `-${b.size / 2}vmax`,
              marginTop: `-${b.size / 2}vmax`,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsl(${b.hue + 25} 100% ${b.light + 10}%) 0%, hsl(${b.hue + 10} 100% ${b.light}%) 45%, hsl(${b.hue} 95% ${b.light - 10}%) 100%)`,
              ['--tx' as string]: `${b.tx}vmax`,
              ['--ty' as string]: `${b.ty}vmax`,
              animationDelay: `${b.delay}ms`,
              animationDuration: `${b.duration}ms`,
            }}
          />
        ))}
      </div>

      {/* Embers fly outward */}
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
            background: e.hot ? 'hsl(50 100% 78%)' : 'hsl(22 100% 60%)',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.95)',
            ['--tx' as string]: `${e.tx}vmax`,
            ['--ty' as string]: `${e.ty}vmax`,
            animationDelay: `${e.delay}ms`,
            animationDuration: `${e.duration}ms`,
          }}
        />
      ))}

      {/* Opaque smoke wall takes over once flames peak, fully covering the screen */}
      <div className="absolute inset-0 animate-burn-smoke-wall" />

      {/* Soft drifting smoke wisps as it lifts to reveal the page below */}
      <div className="absolute inset-0 animate-burn-smoke-lift" />
    </div>
  );
}
