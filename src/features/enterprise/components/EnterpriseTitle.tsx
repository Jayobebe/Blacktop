import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '@/lib/i18n';

/**
 * The Enterprise page's title: BLACKTOP / ENTERPRISE in white caps, sized so
 * the second word spans the full width, with the Coming soon pill in the gap
 * to the right of BLACKTOP (above the end of ENTERPRISE). The pill stacks its
 * words ("COMING / SOON") and takes whatever size fits that gap. Everything is
 * measured, so it fits any screen, font and language; a short translation of
 * "Enterprise" is capped rather than blown up. The pill is the stamp that pops
 * when the not-yet-open parts are tried (the forwarded ref).
 */
const PILL_PAD = 0.4; // em, each side

export const EnterpriseTitle = forwardRef<HTMLSpanElement>(function EnterpriseTitle(_, pillRef) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureB = useRef<HTMLSpanElement>(null);
  const measureE = useRef<HTMLSpanElement>(null);
  const measureWords = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ size: number; pill: number; room: number; spread: number } | null>(null);
  const second = tr("Enterprise");
  const pillLabel = tr("Coming soon");
  const pillWords = pillLabel.split(/\s+/).filter(Boolean);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const W = box.clientWidth;
      const wB = measureB.current?.getBoundingClientRect().width ?? 0; // at 100px
      const wE = measureE.current?.getBoundingClientRect().width ?? 0; // at 100px
      const words = Array.from(measureWords.current?.children ?? []) as HTMLElement[];
      const wWord = Math.max(0, ...words.map((w) => w.getBoundingClientRect().width)); // longest word at 10px
      if (!W || !wB || !wE || !wWord) return;
      const GAP = 5;
      const MIN_PILL = 8.5;
      const MAX_PILL = 13;
      // ENTERPRISE edge to edge, but never taller than a fifth of the width.
      let size = Math.min((W / wE) * 100, W * 0.2);
      const pillWidthAt = (fs: number) => (wWord / 10) * fs + 2 * PILL_PAD * fs;
      let room = W - (wB * size) / 100 - GAP;
      let pill = room / (wWord / 10 + 2 * PILL_PAD);
      if (pill < MIN_PILL) {
        // Even stacked the pill won't fit: give it its minimum and shrink the title to suit.
        pill = MIN_PILL;
        size = Math.min(size, ((W - pillWidthAt(MIN_PILL) - GAP) / wB) * 100);
        room = W - (wB * size) / 100 - GAP;
      }
      pill = Math.min(MAX_PILL, pill);
      // If the pill cost the title a few percent, open ENTERPRISE's letters by
      // the difference so it still ends on the right edge (not for a short
      // translation that's capped well under the width).
      const short = W - (wE * size) / 100;
      const spread = short > 0 && short < W * 0.08 ? short / Math.max(1, Array.from(second).length) : 0;
      setFit((f) =>
        f && Math.abs(f.size - size) < 0.2 && Math.abs(f.pill - pill) < 0.1 && Math.abs(f.room - room) < 0.5 && Math.abs(f.spread - spread) < 0.1
          ? f
          : { size, pill, room, spread },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    // Webfonts can land after the first measure.
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [second, pillLabel]);

  const word = 'font-black uppercase tracking-tight leading-[0.9] whitespace-nowrap';
  const pillText = 'font-black uppercase tracking-normal';

  return (
    <div ref={boxRef} className="relative w-full select-none" role="heading" aria-level={1} aria-label={tr("Blacktop Enterprise")}>
      {/* Measuring copies, off screen */}
      <div aria-hidden className="absolute invisible pointer-events-none left-0 top-0 whitespace-nowrap">
        <span ref={measureB} className={word} style={{ fontSize: 100 }}>Blacktop</span>
        <span ref={measureE} className={word} style={{ fontSize: 100 }}>{second}</span>
        <div ref={measureWords}>
          {pillWords.map((w, i) => (
            <span key={i} className={pillText} style={{ fontSize: 10 }}>{w}</span>
          ))}
        </div>
      </div>

      <div aria-hidden className="flex flex-col items-start text-foreground" style={{ opacity: fit ? 1 : 0 }}>
        <div className="w-full flex items-center justify-between">
          <span className={word} style={{ fontSize: fit?.size ?? 48 }}>Blacktop</span>
          <span
            ref={pillRef}
            className={`${pillText} rounded-md bg-accent text-accent-foreground text-center leading-[1.05] rotate-3 shadow`}
            style={{
              fontSize: fit?.pill ?? 10,
              padding: `${PILL_PAD * 0.8}em ${PILL_PAD}em`,
              maxWidth: fit ? fit.room : undefined,
              transformOrigin: '70% 50%',
            }}
          >
            {pillWords.map((w, i) => (
              <span key={i} className="block">{w}</span>
            ))}
          </span>
        </div>
        <span
          className={word}
          style={{ fontSize: fit?.size ?? 48, letterSpacing: fit?.spread ? `calc(-0.025em + ${fit.spread}px)` : undefined }}
        >
          {second}
        </span>
      </div>
    </div>
  );
});
