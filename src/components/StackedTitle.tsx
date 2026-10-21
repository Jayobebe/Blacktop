import { forwardRef, useLayoutEffect, useRef, useState } from 'react';

/**
 * Blacktop's big two-line page title (Blacktop Enterprise, Blacktop Console):
 * BLACKTOP / <second word> in white caps, sized so the second word spans the
 * full width, with an accent pill in the gap to the right of BLACKTOP (above
 * the end of the second word). The pill stacks its words ("COMING / SOON",
 * "TUE / 20 OCT") and takes whatever size fits that gap. Everything is
 * measured, so it fits any screen, font and language; a short second word is
 * capped rather than blown up. The forwarded ref is the pill (Enterprise pops
 * it as a stamp).
 */
const PILL_PAD = 0.4; // em, each side

/**
 * `square`, in place of the pill: a rounded square after the second word (the
 * Console's date: the weekday over the day), in the second accent (else the
 * accent), as tall as the line, which opens something when pressed.
 */
export interface TitleSquare {
  top: string;
  big: string;
  label: string;
  onPress: () => void;
  /** Something on today: a small dot in the square's corner. */
  dot?: boolean;
}
/** The square's side, and the gap before it, as shares of the title's font size. */
const SQUARE = 0.86;
const SQUARE_GAP = 0.1;

export const StackedTitle = forwardRef<HTMLSpanElement, { second: string; pill?: string[]; square?: TitleSquare; label: string }>(function StackedTitle({ second, pill: pillWords = [], square, label }, pillRef) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureB = useRef<HTMLSpanElement>(null);
  const measureE = useRef<HTMLSpanElement>(null);
  const measureWords = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ size: number; pill: number; room: number; spread: number; secondW?: number } | null>(null);
  const pillLabel = pillWords.join(' ');

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const W = box.clientWidth;
      // Never more than about a ninth of the screen's height a line: a phone on its side is wide but short.
      const tall = window.innerHeight * 0.11;
      const wB = measureB.current?.getBoundingClientRect().width ?? 0; // at 100px
      const wE = measureE.current?.getBoundingClientRect().width ?? 0; // at 100px
      const words = Array.from(measureWords.current?.children ?? []) as HTMLElement[];
      const wWord = Math.max(0, ...words.map((w) => w.getBoundingClientRect().width)); // longest word at 10px
      if (!W || !wB || !wE) return;
      if (square) {
        // BLACKTOP edge to edge, the second word and its square on the line under it, never taller than a fifth of the width.
        const size = Math.min((W / wB) * 100, (W - 2) / (wE / 100 + SQUARE_GAP + SQUARE), W * 0.2, tall);
        setFit((f) => (f && Math.abs(f.size - size) < 0.2 ? f : { size, pill: 0, room: 0, spread: 0, secondW: (wE * size) / 100 }));
        return;
      }
      if (!wWord) return;
      const GAP = 5;
      const MIN_PILL = 8.5;
      const MAX_PILL = 13;
      // ENTERPRISE edge to edge, but never taller than a fifth of the width.
      let size = Math.min((W / wE) * 100, W * 0.2, tall);
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
    window.addEventListener('resize', measure);
    // Webfonts can land after the first measure.
    void document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [second, pillLabel, !!square]);

  const word = 'font-black uppercase tracking-tight leading-[0.9] whitespace-nowrap';
  const pillText = 'font-black uppercase tracking-normal';

  const side = fit ? fit.size * SQUARE : 0;
  return (
    // Clipped: nothing in the title can reach past its own column (the deck's next card sits right beside it).
    <div className="relative w-full overflow-hidden">
    <div ref={boxRef} className="relative w-full select-none" role="heading" aria-level={1} aria-label={label}>
      {/* Measuring copies, off screen */}
      <div aria-hidden className="absolute invisible pointer-events-none left-0 top-0 w-0 h-0 overflow-hidden whitespace-nowrap">
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
          {!square && <span
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
          </span>}
        </div>
        {square ? (
          <span className={word} style={{ fontSize: fit?.size ?? 48 }}>
            {second}
          </span>
        ) : (
          <span
            className={word}
            style={{ fontSize: fit?.size ?? 48, letterSpacing: fit?.spread ? `calc(-0.025em + ${fit.spread}px)` : undefined }}
          >
            {second}
          </span>
        )}
      </div>
    </div>
      {square && fit && (
        <button
          type="button"
          onClick={square.onPress}
          aria-label={square.label}
          data-tip="title-square"
          className="pressable absolute flex flex-col items-center justify-center rounded-[22%] bg-[hsl(var(--lava,var(--accent)))] text-[hsl(0_0%_6%)] shadow-lg leading-none"
          style={{ left: (fit.secondW ?? 0) + fit.size * SQUARE_GAP, top: fit.size * 0.9 + (fit.size * 0.9 - side) / 2, width: side, height: side }}
        >
          <span className="font-black uppercase tracking-wide" style={{ fontSize: side * 0.2 }}>{square.top}</span>
          <span className="font-black font-mono" style={{ fontSize: side * 0.48, marginTop: side * 0.02 }}>{square.big}</span>
          {square.dot && <span aria-hidden className="absolute rounded-full bg-[hsl(0_0%_6%)]" style={{ width: side * 0.14, height: side * 0.14, top: side * 0.1, right: side * 0.1 }} />}
        </button>
      )}
    </div>
  );
});
