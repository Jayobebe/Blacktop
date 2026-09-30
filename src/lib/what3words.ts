import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLanguage } from '@/lib/i18n';

/**
 * what3words through the `what3words` Edge Function (the key stays on the
 * server). Until Blacktop has a what3words key the function answers
 * `enabled: false`, this module remembers that for the session, and nothing
 * shows anywhere. Turning a position into words is free to call (unlimited on
 * the paid plans); turning words into a position is counted, so it only runs
 * when a rider picks a what3words search suggestion.
 */

// null until the first answer says whether what3words is on.
let enabled: boolean | null = null;
const listeners = new Set<() => void>();
const setEnabled = (on: boolean) => {
  if (enabled === on) return;
  enabled = on;
  listeners.forEach((l) => l());
};

/** Whether what3words is available (false until the server has said so). */
export function useWhat3WordsEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled === true,
    () => false,
  );
}

// After a failed call (offline, or the function not deployed yet) nothing is
// asked for five minutes, so a missing function never costs a request per tap.
let quietUntil = 0;

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  if (enabled === false || Date.now() < quietUntil) return null;
  try {
    const { data, error } = await supabase.functions.invoke('what3words', { body: { ...body, lang: getLanguage() } });
    if (error || !data) {
      quietUntil = Date.now() + 5 * 60_000;
      return null;
    }
    if (data.enabled === false) {
      setEnabled(false);
      return null;
    }
    setEnabled(true);
    return data as T;
  } catch {
    quietUntil = Date.now() + 5 * 60_000;
    return null;
  }
}

/** Three words, optionally with ///, split by a dot (or the dots other scripts use). */
export const W3W_PATTERN = /^\/{0,3}[\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+$/u;
/** Looks like a what3words address being typed ("///filled.count.so"). */
export function looksLikeWhat3Words(text: string): boolean {
  const t = text.trim();
  return W3W_PATTERN.test(t) || /^\/\/\/\S+\.\S+\.\S+/u.test(t);
}

export interface W3wPlace {
  words: string;
  nearest: string;
}

// Squares already looked up this session (5 decimals ≈ 1 m; the squares are 3 m).
const cache = new Map<string, W3wPlace | null>();
const pending = new Map<string, Promise<W3wPlace | null>>();

export function wordsAt(lat: number, lng: number): Promise<W3wPlace | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const p = call<{ words: string | null; nearest: string | null }>({ action: 'words', lat, lng })
    .then((d) => {
      const place = d?.words ? { words: d.words, nearest: d.nearest ?? '' } : null;
      // Only real answers are remembered; a failed call is tried again.
      if (d) cache.set(key, place);
      return place;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** The what3words for a position (null while loading, without a key, or offline). */
export function useWhat3Words(lat: number | null | undefined, lng: number | null | undefined): W3wPlace | null {
  const [place, setPlace] = useState<W3wPlace | null>(null);
  // Only a move of ~10 m or more asks again, so a jittery or moving position
  // can't turn into a lookup per GPS fix.
  const la = typeof lat === 'number' ? Math.round(lat * 1e4) / 1e4 : null;
  const ln = typeof lng === 'number' ? Math.round(lng * 1e4) / 1e4 : null;
  useEffect(() => {
    if (la === null || ln === null || enabled === false) {
      setPlace(null);
      return;
    }
    let live = true;
    void wordsAt(lat as number, lng as number).then((p) => live && setPlace(p));
    return () => {
      live = false;
    };
    // The rounded position decides when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [la, ln]);
  return place;
}

export interface W3wSuggestion {
  words: string;
  nearest: string;
  country: string;
  distanceKm: number | null;
}

/** Suggestions for a what3words address being typed, nearest `focus` first. */
export async function suggestWhat3Words(input: string, focus: { lat: number; lng: number } | null): Promise<W3wSuggestion[]> {
  const d = await call<{ suggestions: W3wSuggestion[] }>({ action: 'suggest', input, ...(focus ?? {}) });
  return Array.isArray(d?.suggestions) ? d.suggestions : [];
}

/** Search results made from what3words suggestions carry this id prefix, and no position until picked. */
export const W3W_RESULT_PREFIX = 'w3w:';

/**
 * For a search box: when the text looks like a what3words address, its
 * suggestions as search results (name "///words", address the nearest place).
 * Their lat / lng are NaN until `resolveWhat3WordsResult` looks them up.
 */
export async function what3wordsResults(
  query: string,
  focus: { lat: number; lng: number } | null,
): Promise<{ id: string; name: string; address: string; lat: number; lng: number }[]> {
  if (!looksLikeWhat3Words(query) || enabled === false) return [];
  const list = await suggestWhat3Words(query, focus);
  return list.map((s) => ({
    id: `${W3W_RESULT_PREFIX}${s.words}`,
    name: `///${s.words}`,
    address: [s.nearest, s.country].filter(Boolean).join(', '),
    lat: Number.NaN,
    lng: Number.NaN,
  }));
}

/** A picked search result with its position filled in (what3words results only; others come back as they are). Null if it can't be found. */
export async function resolveWhat3WordsResult<T extends { id: string; lat: number; lng: number; address: string }>(r: T): Promise<T | null> {
  // Not what3words, or already found (a recent): nothing to look up (and nothing counted).
  if (!r.id.startsWith(W3W_RESULT_PREFIX) || (Number.isFinite(r.lat) && Number.isFinite(r.lng))) return r;
  const at = await locateWhat3Words(r.id.slice(W3W_RESULT_PREFIX.length));
  return at ? { ...r, lat: at.lat, lng: at.lng, address: at.nearest || r.address } : null;
}

/** Where a what3words address is (counted against the plan: only when a rider picks one). */
export async function locateWhat3Words(words: string): Promise<{ lat: number; lng: number; nearest: string } | null> {
  const d = await call<{ lat: number | null; lng: number | null; nearest: string | null }>({ action: 'locate', words });
  return typeof d?.lat === 'number' && typeof d?.lng === 'number' ? { lat: d.lat, lng: d.lng, nearest: d.nearest ?? '' } : null;
}
