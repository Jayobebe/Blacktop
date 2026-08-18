import { TIER_LADDER, type CardTier } from '../types';
import type { VehicleCardData } from '../hooks/useVehicleCards';

/** Compact, serializable shape that fits comfortably in a QR code. */
export interface SharedCardPayload {
  v: 1;
  /** Card uid (bike id from the originating device). */
  i: string;
  /** Vehicle name. */
  n: string;
  /** Make/model. */
  m?: string;
  /** Owner display name. */
  o?: string;
  /** Tier id. */
  t: CardTier;
  /** Tier human label. */
  tl: string;
  s: {
    totalRides: number;
    totalDistanceMi: number;
    totalDurationSec: number;
    topSpeedMph: number;
    maxLean: number;
    maxGForce: number;
  };
  /** Capture timestamp (when QR was generated). */
  ts: number;
  /** Storage path of the shared vehicle photo (card-photos bucket). */
  p?: string;
}

const PREFIX = 'BTCARD:';
/** v2: compact pipe-delimited, no base64 — roughly a third of the v1 payload size. */
const PREFIX_V2 = 'BTC2:';
const SEP = '|';

function utf8ToBase64(s: string): string {
  // Handle unicode safely
  return btoa(unescape(encodeURIComponent(s)));
}

function base64ToUtf8(b: string): string {
  return decodeURIComponent(escape(atob(b)));
}

function esc(s: string | undefined): string {
  return (s ?? '').replace(/[|\\]/g, '/');
}

function tierLabel(t: string): string {
  return TIER_LADDER.find((d) => d.id === t)?.label ?? 'Locked';
}

function num(n: number | undefined, dp = 1): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v * 10 ** dp) / 10 ** dp);
}

export function encodeCard(card: VehicleCardData, owner?: string, photoPath?: string): string {
  const s = card.stats;
  const fields = [
    esc(card.bike.id).replace(/-/g, ''),
    esc(card.bike.name),
    esc(card.bike.makeModel || ''),
    esc(owner?.trim() || ''),
    esc(card.tier),
    num(s.totalRides, 0),
    num(s.totalDistanceMi),
    num(s.totalDurationSec, 0),
    num(s.topSpeedMph),
    num(s.maxLean),
    num(s.maxGForce, 2),
    String(Math.round(Date.now() / 1000)),
    esc(photoPath || ''),
  ];
  return PREFIX_V2 + fields.join(SEP);
}

export function decodeCard(raw: string): SharedCardPayload | null {
  try {
    const trimmed = raw.trim();

    if (trimmed.startsWith(PREFIX_V2)) {
      const f = trimmed.slice(PREFIX_V2.length).split(SEP);
      if (f.length < 12) return null;
      const [i, n, m, o, t, rides, dist, dur, top, lean, g, ts, photo] = f;
      if (!n || !t) return null;
      return {
        v: 1,
        i,
        n,
        m: m || undefined,
        o: o || undefined,
        t: t as CardTier,
        tl: tierLabel(t),
        s: {
          totalRides: Number(rides) || 0,
          totalDistanceMi: Number(dist) || 0,
          totalDurationSec: Number(dur) || 0,
          topSpeedMph: Number(top) || 0,
          maxLean: Number(lean) || 0,
          maxGForce: Number(g) || 0,
        },
        ts: (Number(ts) || 0) * 1000,
        p: photo || undefined,
      };
    }

    if (!trimmed.startsWith(PREFIX)) return null;
    const json = base64ToUtf8(trimmed.slice(PREFIX.length));
    const parsed = JSON.parse(json) as SharedCardPayload;
    if (parsed?.v !== 1 || !parsed.n || !parsed.t || !parsed.s) return null;
    if (!parsed.tl) parsed.tl = tierLabel(parsed.t);
    return parsed;
  } catch {
    return null;
  }
}

/** Stable id for a collected card so duplicates can be detected. */
export function collectedCardKey(p: SharedCardPayload): string {
  return `${p.i}::${p.o ?? ''}::${p.n}`;
}
