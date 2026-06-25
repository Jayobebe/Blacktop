import type { CardTier } from '../types';
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
}

const PREFIX = 'BTCARD:';

function utf8ToBase64(s: string): string {
  // Handle unicode safely
  return btoa(unescape(encodeURIComponent(s)));
}

function base64ToUtf8(b: string): string {
  return decodeURIComponent(escape(atob(b)));
}

export function encodeCard(card: VehicleCardData, owner?: string): string {
  const payload: SharedCardPayload = {
    v: 1,
    i: card.bike.id,
    n: card.bike.name,
    m: card.bike.makeModel || undefined,
    o: owner?.trim() || undefined,
    t: card.tier,
    tl: card.tierLabel,
    s: {
      totalRides: card.stats.totalRides,
      totalDistanceMi: card.stats.totalDistanceMi,
      totalDurationSec: card.stats.totalDurationSec,
      topSpeedMph: card.stats.topSpeedMph,
      maxLean: card.stats.maxLean,
      maxGForce: card.stats.maxGForce,
    },
    ts: Date.now(),
  };
  return PREFIX + utf8ToBase64(JSON.stringify(payload));
}

export function decodeCard(raw: string): SharedCardPayload | null {
  try {
    if (!raw.startsWith(PREFIX)) return null;
    const json = base64ToUtf8(raw.slice(PREFIX.length));
    const parsed = JSON.parse(json) as SharedCardPayload;
    if (parsed?.v !== 1 || !parsed.n || !parsed.t || !parsed.s) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Stable id for a collected card so duplicates can be detected. */
export function collectedCardKey(p: SharedCardPayload): string {
  return `${p.i}::${p.o ?? ''}::${p.n}`;
}
