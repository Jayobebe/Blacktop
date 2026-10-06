import { useSyncExternalStore } from 'react';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Stickers: every card in the vault has one (the vehicle, cut out), and a
 * rider can stick it on Home. A sticker sits on Home's ride buttons: it shows
 * only where it's over a button, so one that hangs off an edge is cut there,
 * and it never covers the globe. Stickers overlap in the order of the list
 * (the last is on top). Kept on the phone only; demo mode saves nothing.
 *
 * A sticker is placed by its centre, as a share of the button area's width and
 * height, so it stays put when the screen turns or the layout changes; its
 * width is a share of the area's shorter side.
 */
export interface Sticker {
  id: string;
  /** The card it came from: `cw:<catalog id>`, `card:<key>` or `spectre:<key>`. One sticker per card. */
  card: string;
  name: string;
  /** The cut-out: a site path (Card Wars artwork) or a small data URL (a rider's own photo). */
  src: string;
  /** Height over width. */
  ar: number;
  x: number;
  y: number;
  w: number;
  /** Degrees, clockwise. */
  rot: number;
  flip: boolean;
}

export const STICKERS_KEY = 'blacktop_stickers';
export const MAX_STICKERS = 12;
export const STICKER_SIZE = { min: 0.12, max: 1.1, start: 0.24 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function load(): Sticker[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STICKERS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s.id === 'string' && typeof s.card === 'string' && typeof s.src === 'string' && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.w)).slice(0, MAX_STICKERS);
  } catch {
    return [];
  }
}

let state: Sticker[] = load();
const listeners = new Set<() => void>();
function set(next: Sticker[]) {
  state = next;
  if (!isDemoModeActive()) {
    try {
      localStorage.setItem(STICKERS_KEY, JSON.stringify(next));
    } catch {
      // Storage full: the stickers stay for this visit.
    }
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getStickers = () => state;
export function useStickers(): Sticker[] {
  return useSyncExternalStore(subscribe, getStickers, getStickers);
}

/** Keeps a sticker on the button area and a sensible size. */
export function tidy(s: Sticker): Sticker {
  return { ...s, x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1), w: clamp(s.w, STICKER_SIZE.min, STICKER_SIZE.max), rot: ((s.rot % 360) + 360) % 360 };
}

/**
 * The cut-out as a sticker keeps it: a site path stays as it is (the artwork
 * is already trimmed); a photo is trimmed to what's visible and made small,
 * so a dozen of them fit in storage.
 */
async function prepare(src: string): Promise<{ src: string; ar: number }> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('empty image');
  if (!src.startsWith('data:')) return { src, ar: h / w };
  try {
    const scale = Math.min(1, 320 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) return { src, ar: h / w };
    const tw = x1 - x0 + 1;
    const th = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    out.getContext('2d')!.drawImage(canvas, x0, y0, tw, th, 0, 0, tw, th);
    return { src: out.toDataURL('image/png'), ar: th / tw };
  } catch {
    return { src, ar: h / w };
  }
}

/** Sticks a card's sticker on Home, in the middle of a button, a little askew. */
export async function addSticker(card: string, name: string, src: string): Promise<'added' | 'already' | 'full' | 'failed'> {
  if (state.some((s) => s.card === card)) return 'already';
  if (state.length >= MAX_STICKERS) return 'full';
  try {
    const cut = await prepare(src);
    if (state.some((s) => s.card === card)) return 'already';
    // Spread new ones out so they don't all land in one pile.
    const n = state.length;
    // The corners of the buttons, where no label sits.
    const spots = [
      [0.13, 0.08],
      [0.87, 0.08],
      [0.14, 0.6],
      [0.86, 0.6],
      [0.13, 0.33],
      [0.87, 0.33],
    ];
    const [x, y] = spots[n % spots.length];
    set([...state, tidy({ id: crypto.randomUUID(), card, name, ...cut, x: x + (Math.random() - 0.5) * 0.04, y: y + (Math.random() - 0.5) * 0.03, w: STICKER_SIZE.start, rot: Math.round((Math.random() - 0.5) * 24), flip: false })]);
    return 'added';
  } catch {
    return 'failed';
  }
}

export function removeSticker(id: string) {
  if (state.some((s) => s.id === id)) set(state.filter((s) => s.id !== id));
}

/** Peels off the sticker of a card (the card was removed, or the rider took it down). */
export function removeStickerFor(card: string) {
  if (state.some((s) => s.card === card)) set(state.filter((s) => s.card !== card));
}

export function updateSticker(id: string, patch: Partial<Pick<Sticker, 'x' | 'y' | 'w' | 'rot' | 'flip'>>) {
  set(state.map((s) => (s.id === id ? tidy({ ...s, ...patch }) : s)));
}

export function bringToFront(id: string) {
  const s = state.find((x) => x.id === id);
  if (s && state[state.length - 1] !== s) set([...state.filter((x) => x !== s), s]);
}

/** Whether Home is in its sticker-arranging mode (asked for from the vault). */
let arranging = false;
const arrangeListeners = new Set<() => void>();
export function setArranging(on: boolean) {
  if (arranging === on) return;
  arranging = on;
  arrangeListeners.forEach((l) => l());
}
export function useArranging(): boolean {
  return useSyncExternalStore(
    (l) => {
      arrangeListeners.add(l);
      return () => arrangeListeners.delete(l);
    },
    () => arranging,
    () => arranging,
  );
}
