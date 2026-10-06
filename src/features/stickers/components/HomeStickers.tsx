import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { BringToFront, Check, FlipHorizontal2, Maximize2, Trash2 } from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { STICKER_SIZE, bringToFront, removeSticker, setArranging, tidy, updateSticker, useArranging, useStickers, type Sticker } from '../lib/store';

/** A button stickers show on: the layer put inside it, and where its inner edge sits in the column. */
interface Surface {
  host: HTMLElement;
  x: number;
  y: number;
}

interface Area {
  w: number;
  h: number;
  surfaces: Surface[];
}

const HOST = 'data-sticker-host';

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const HANDLE = 22; // the corner handle's radius

/**
 * The stickers on Home's ride buttons. It fills the button column (`columnRef`,
 * which is `relative`): buttons in it carry `data-sticker-surface` and the
 * globe `data-sticker-hole`. Each button gets a layer of its own, under its text
 * and icons and inside its border, holding every sticker at its place in the
 * column: so one hanging off a button is cut at its edge, one across two shows
 * on both, two can overlap, and the notch the buttons leave for the globe keeps
 * them off it. Taps go straight through to the buttons.
 *
 * Arranging (asked for from the vault): the buttons stop taking taps, each
 * sticker's hidden part shows faintly, and a sticker is moved by dragging it,
 * resized and turned by its corner handle or with two fingers, and flipped,
 * brought to the front or peeled off from the bar.
 */
export function HomeStickers({ columnRef }: { columnRef: RefObject<HTMLElement> }) {
  const saved = useStickers();
  const arranging = useArranging();
  const [area, setArea] = useState<Area | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // The sticker under the fingers, as it is mid-gesture (saved when they lift).
  const [live, setLive] = useState<Sticker | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ mode: 'move' | 'handle' | 'pinch'; start: Sticker; from: Pt; d0: number; a0: number } | null>(null);

  useEffect(() => () => setArranging(false), []);
  useEffect(() => {
    if (!arranging) {
      setSelected(null);
      setLive(null);
      gesture.current = null;
      pointers.current.clear();
    }
  }, [arranging]);

  const active = saved.length > 0 || arranging;
  // An effect, not a layout effect: the column's ref isn't set yet when a child's layout effects run.
  useEffect(() => {
    const column = columnRef.current;
    if (!column || !active) return;
    let frame = 0;
    const measure = () => {
      const c = column.getBoundingClientRect();
      if (!c.width || !c.height) return;
      const w = Math.round(c.width);
      const h = Math.round(c.height);
      const surfaces = Array.from(column.querySelectorAll<HTMLElement>('[data-sticker-surface]'))
        .filter((el) => el.getClientRects().length > 0)
        .map((el): Surface => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const b = parseFloat(cs.borderTopWidth) || 0;
          // The stickers' layer lives inside the button, under its own text and icons and inside
          // its border: the button's rounded corners (and the notch cut for the globe) trim it.
          let host = el.querySelector<HTMLElement>(`:scope > [${HOST}]`);
          if (!host) {
            host = document.createElement('div');
            host.setAttribute(HOST, '');
            host.setAttribute('aria-hidden', 'true');
            host.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;border-radius:inherit';
            el.prepend(host);
          }
          // Below the button's contents but above its background needs the button to be its own layer.
          if (cs.position === 'static') el.style.position = 'relative';
          el.style.isolation = 'isolate';
          host.style.borderRadius = `${Math.max(0, (parseFloat(cs.borderTopLeftRadius) || 0) - b)}px`;
          return { host, x: r.left - c.left + b, y: r.top - c.top + b };
        });
      setArea((a) =>
        a && a.w === w && a.h === h && a.surfaces.length === surfaces.length && a.surfaces.every((o, i) => o.host === surfaces[i].host && Math.abs(o.x - surfaces[i].x) < 0.5 && Math.abs(o.y - surfaces[i].y) < 0.5)
          ? a
          : { w, h, surfaces },
      );
    };
    // Home places its globe in its own layout pass: measure a frame later, so that has happened.
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    later();
    const ro = new ResizeObserver(later);
    ro.observe(column);
    window.addEventListener('resize', later);
    column.addEventListener('animationend', later);
    const settle = window.setTimeout(measure, 750);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', later);
      column.removeEventListener('animationend', later);
      window.clearTimeout(settle);
      column.querySelectorAll(`[${HOST}]`).forEach((host) => host.remove());
      setArea(null);
    };
  }, [columnRef, active]);

  if (!active || !area) return null;

  const stickers = saved.map((s) => (live && live.id === s.id ? live : s));
  const base = Math.min(area.w, area.h);
  const box = (s: Sticker) => {
    const width = s.w * base;
    return { cx: s.x * area.w, cy: s.y * area.h, width, height: width * s.ar };
  };
  const place = (s: Sticker, mirrored = true): CSSProperties => {
    const b = box(s);
    return { left: b.cx, top: b.cy, width: b.width, height: b.height, transform: `translate(-50%, -50%) rotate(${s.rot}deg)${mirrored && s.flip ? ' scaleX(-1)' : ''}` };
  };
  /** Every sticker, placed in a layer whose corner is `dx`, `dy` into the column. */
  const images = (extra?: string, dx = 0, dy = 0) =>
    stickers.map((s) => {
      const at = place(s);
      return <img key={s.id} src={s.src} alt="" draggable={false} className={cn('sticker-img absolute max-w-none select-none', extra)} style={{ ...at, left: (at.left as number) - dx, top: (at.top as number) - dy }} />;
    });

  const current = stickers.find((s) => s.id === selected) ?? null;

  // ── Arranging: one finger moves (or pulls the handle), two resize and turn ──
  const at = (e: ReactPointerEvent): Pt => {
    const r = layer.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** The point in a sticker's own frame (its centre at 0, 0, unturned). */
  const local = (s: Sticker, p: Pt): Pt => {
    const b = box(s);
    const t = (-s.rot * Math.PI) / 180;
    const dx = p.x - b.cx;
    const dy = p.y - b.cy;
    return { x: dx * Math.cos(t) - dy * Math.sin(t), y: dx * Math.sin(t) + dy * Math.cos(t) };
  };
  const hit = (p: Pt): Sticker | null => {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      const b = box(s);
      const l = local(s, p);
      // Never a smaller target than a thumb.
      if (Math.abs(l.x) <= Math.max(24, b.width / 2) && Math.abs(l.y) <= Math.max(24, b.height / 2)) return s;
    }
    return null;
  };
  const onHandle = (s: Sticker, p: Pt) => {
    const b = box(s);
    const l = local(s, p);
    return Math.hypot(l.x - b.width / 2, l.y - b.height / 2) <= HANDLE + 8;
  };
  const centre = (s: Sticker): Pt => ({ x: s.x * area.w, y: s.y * area.h });

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2 && current) {
      gesture.current = { mode: 'pinch', start: current, from: p, d0: Math.max(1, dist(pts[0], pts[1])), a0: angle(pts[0], pts[1]) };
      return;
    }
    if (pts.length !== 1) return;
    if (current && onHandle(current, p)) {
      const c = centre(current);
      gesture.current = { mode: 'handle', start: current, from: p, d0: Math.max(1, dist(c, p)), a0: angle(c, p) };
      return;
    }
    const s = hit(p);
    if (!s) {
      setSelected(null);
      gesture.current = null;
      return;
    }
    if (s.id !== selected) haptics.light();
    setSelected(s.id);
    gesture.current = { mode: 'move', start: s, from: p, d0: 1, a0: 0 };
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = at(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    const s = g.start;
    if (g.mode === 'move') {
      setLive(tidy({ ...s, x: s.x + (p.x - g.from.x) / area.w, y: s.y + (p.y - g.from.y) / area.h }));
    } else if (g.mode === 'handle') {
      const c = centre(s);
      setLive(tidy({ ...s, w: (s.w * dist(c, p)) / g.d0, rot: s.rot + angle(c, p) - g.a0 }));
    } else {
      const pts = Array.from(pointers.current.values());
      if (pts.length < 2) return;
      setLive(tidy({ ...s, w: (s.w * dist(pts[0], pts[1])) / g.d0, rot: s.rot + angle(pts[0], pts[1]) - g.a0 }));
    }
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch' && pointers.current.size >= 2) return;
    gesture.current = null;
    if (live) {
      const { x, y, w, rot } = live;
      updateSticker(live.id, { x, y, w, rot });
    }
    setLive(null);
  };

  const bar = arranging
    ? createPortal(
        <div className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none" style={{ bottom: 'calc(0.75rem + var(--safe-bottom))' }}>
          <p className="max-w-sm rounded-full bg-black/70 px-3 py-1 text-center text-[11px] leading-snug text-white/85">
            {saved.length === 0
              ? tr("No stickers yet. Turn a card over in your collection to stick one here.")
              : current
                ? tr("Drag to move. Pull the corner, or use two fingers, to resize and turn.")
                : tr("Tap a sticker to pick it up.")}
          </p>
          <div className="frost-accent pointer-events-auto flex items-stretch gap-1 rounded-2xl p-1.5" role="toolbar" aria-label={tr("Stickers")}>
            <BarButton icon={FlipHorizontal2} label={tr("Flip")} disabled={!current} onClick={() => current && updateSticker(current.id, { flip: !current.flip })} />
            <BarButton icon={BringToFront} label={tr("To front")} disabled={!current || saved[saved.length - 1]?.id === current.id} onClick={() => current && bringToFront(current.id)} />
            <BarButton
              icon={Trash2}
              label={tr("Peel off")}
              disabled={!current}
              onClick={() => {
                if (!current) return;
                removeSticker(current.id);
                setSelected(null);
              }}
            />
            <BarButton icon={Check} label={tr("Done")} primary onClick={() => setArranging(false)} />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* What's off a button, faintly, so a sticker can't be lost in a gap while arranging. */}
      {arranging && (
        <div className="pointer-events-none absolute inset-0 z-[9] overflow-hidden opacity-30" aria-hidden>
          {images('sticker-img-ghost')}
        </div>
      )}
{area.surfaces.map((o) => createPortal(images(undefined, o.x, o.y), o.host))}
      {arranging && (
        <div
          ref={layer}
          data-no-pull
          data-no-ui-sound
          className="absolute inset-0 z-40 touch-none select-none rounded-3xl outline-dashed outline-1 outline-offset-4 outline-white/30"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {current && (
            <div className="absolute border border-dashed border-white/80 rounded-md" style={place(current, false)}>
              <span className="absolute flex items-center justify-center rounded-full bg-white text-black shadow-lg" style={{ width: HANDLE * 2, height: HANDLE * 2, right: -HANDLE, bottom: -HANDLE }}>
                <Maximize2 className="w-4 h-4" aria-hidden />
              </span>
            </div>
          )}
        </div>
      )}
      {bar}
    </>
  );
}

function BarButton({ icon: Icon, label, onClick, disabled, primary }: { icon: typeof Check; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptics.light();
        onClick();
      }}
      className={cn(
        'flex min-h-12 min-w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold transition-colors disabled:opacity-35',
        primary ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/10',
      )}
    >
      <Icon className={cn('w-5 h-5', primary ? '!text-accent-foreground' : 'text-accent')} aria-hidden />
      {label}
    </button>
  );
}
