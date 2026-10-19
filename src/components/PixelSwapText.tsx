import { useEffect, useRef } from 'react';
import { isThermal } from '@/lib/thermal';

/** How long each line stays, and how long the pixel swap between two takes. */
const HOLD_MS = 2400;
const SWAP_MS = 560;
/** The coarsest the pixels get at the middle of a swap, in CSS px. */
const BLOCK = 7;

/**
 * A line of text that steps through `lines`, each swap a pixel transition in
 * the look of the app's page warp: the text breaks into blocks, the next line
 * takes its place at the coarsest point and comes back sharp. Drawn on a canvas
 * in the element's own font, colour and alignment (so a parent's classes style
 * it); the first line is the real text for screen readers (`label`). Stays on
 * the first line under Thermal mode and reduced motion, and pauses while the
 * page is hidden.
 */
export function PixelSwapText({ lines, label, className }: { lines: string[]; label: string; className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d');
    if (!sctx) return;
    const still = isThermal() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let font = '';
    let color = '';
    let align: CanvasTextAlign = 'center';
    const measure = () => {
      const cs = getComputedStyle(box);
      dpr = Math.min(3, window.devicePixelRatio || 1);
      w = box.clientWidth;
      h = Math.max(1, Math.ceil(parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4));
      font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      color = cs.color;
      align = cs.textAlign === 'left' || cs.textAlign === 'start' ? 'left' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'center';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.height = `${h}px`;
    };

    /** One line, drawn at `block` CSS px a pixel (1: sharp). */
    const draw = (text: string, block: number) => {
      // CSS px per drawn pixel: the screen's own at rest, a block mid-swap.
      const px = block <= 1.01 ? 1 / dpr : block;
      const sw = Math.max(1, Math.round(w / px));
      const sh = Math.max(1, Math.round(h / px));
      const scale = sw / w;
      small.width = sw;
      small.height = sh;
      sctx.clearRect(0, 0, sw, sh);
      sctx.save();
      sctx.scale(scale, sh / h);
      sctx.font = font;
      sctx.fillStyle = color;
      sctx.textAlign = align;
      sctx.textBaseline = 'middle';
      sctx.fillText(text, align === 'left' ? 0 : align === 'right' ? w : w / 2, h / 2);
      sctx.restore();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    };

    measure();
    draw(lines[0] ?? '', 1);
    if (still || lines.length < 2) {
      const ro = new ResizeObserver(() => {
        measure();
        draw(lines[0] ?? '', 1);
      });
      ro.observe(box);
      return () => ro.disconnect();
    }

    let i = 0;
    let raf = 0;
    let timer = 0;
    let swapping = false;
    const swap = () => {
      if (document.hidden) {
        timer = window.setTimeout(swap, HOLD_MS);
        return;
      }
      const from = lines[i];
      i = (i + 1) % lines.length;
      const to = lines[i];
      const began = performance.now();
      swapping = true;
      const frame = (now: number) => {
        const u = Math.min(1, (now - began) / SWAP_MS);
        // Coarser to the middle, the next line from there, sharp again at the end.
        const k = u < 0.5 ? u / 0.5 : (1 - u) / 0.5;
        const block = 1 + (BLOCK - 1) * (1 - (1 - k) ** 2);
        draw(u < 0.5 ? from : to, block);
        if (u < 1) raf = requestAnimationFrame(frame);
        else {
          swapping = false;
          timer = window.setTimeout(swap, HOLD_MS);
        }
      };
      raf = requestAnimationFrame(frame);
    };
    timer = window.setTimeout(swap, HOLD_MS);
    const ro = new ResizeObserver(() => {
      measure();
      if (!swapping) draw(lines[i], 1);
    });
    ro.observe(box);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [lines]);

  return (
    <span ref={boxRef} className={className} style={{ display: 'block' }}>
      <span className="sr-only">{label}</span>
      <canvas ref={canvasRef} aria-hidden style={{ display: 'block', width: '100%' }} />
    </span>
  );
}
