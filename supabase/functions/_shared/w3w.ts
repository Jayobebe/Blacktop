// what3words: a name for every 3 m square ("///filled.count.soap").
//
// Needs the W3W_API_KEY Edge Function secret (a paid what3words API plan: the
// free plan only has AutoSuggest). Without it `w3wEnabled` is false and every
// helper answers null, so nothing shows anywhere. On the paid plans turning a
// position into words is unlimited; turning words into a position is counted
// against the plan's monthly allowance, so only a rider's pick of a search
// suggestion does that.

import { fetchWithTimeout } from "./upstream.ts";

const env = (k: string): string => {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } };
  return (g.Deno?.env.get(k) ?? "").trim();
};

const KEY = env("W3W_API_KEY");
const BASE = "https://api.what3words.com/v3";

export const w3wEnabled = KEY !== "";

/** Languages what3words names squares in that Blacktop is also translated into. */
const LANGUAGES = new Set(["en", "da", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt", "sv", "tr", "uk", "zh", "nb"]);
/** what3words uses "no" for Norwegian. */
const w3wLanguage = (lang: string | undefined) => {
  const l = (lang ?? "en").toLowerCase().slice(0, 2);
  if (l === "nb") return "no";
  return LANGUAGES.has(l) ? l : "en";
};

/** Three words: letters (any script) separated by one dot-like character each. */
export const W3W_PATTERN = /^\/{0,3}[\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+$/u;

async function call(path: string, params: Record<string, string>, timeoutMs = 6000): Promise<any | null> {
  if (!KEY) return null;
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString(), { headers: { "X-Api-Key": KEY, Accept: "application/json" } }, timeoutMs);
  if (!res.ok) {
    // 400 = bad words / position (an answer), anything else an outage or the plan's allowance.
    if (res.status !== 400) console.warn("[w3w]", path, res.status);
    return null;
  }
  return res.json();
}

// The same square asked about again (every rescue card, every refresh) is answered from here.
const wordsCache = new Map<string, { words: string; nearest: string }>();

/** The words for a position, and the nearest place, e.g. { words: "filled.count.soap", nearest: "Bayswater, London" }. */
export async function wordsAt(lat: number, lng: number, lang?: string): Promise<{ words: string; nearest: string } | null> {
  if (!KEY || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const language = w3wLanguage(lang);
  // Squares are 3 m; 5 decimals (~1 m) keeps neighbours apart.
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${language}`;
  const hit = wordsCache.get(key);
  if (hit) return hit;
  const j = await call("convert-to-3wa", { coordinates: `${lat},${lng}`, language }).catch(() => null);
  if (typeof j?.words !== "string") return null;
  const out = { words: j.words, nearest: typeof j.nearestPlace === "string" ? j.nearestPlace : "" };
  if (wordsCache.size > 5000) wordsCache.clear();
  wordsCache.set(key, out);
  return out;
}

export interface W3wSuggestion {
  words: string;
  nearest: string;
  country: string;
  distanceKm: number | null;
}

/** Suggestions for what a rider typed (typos and word order forgiven), nearest to `focus` first. */
export async function suggest(input: string, focus: { lat: number; lng: number } | null, lang?: string): Promise<W3wSuggestion[]> {
  const text = input.trim().replace(/^\/+/, "");
  if (!KEY || text.length < 5 || text.length > 120) return [];
  const params: Record<string, string> = { input: text, language: w3wLanguage(lang), "n-results": "5" };
  if (focus) params.focus = `${focus.lat},${focus.lng}`;
  const j = await call("autosuggest", params).catch(() => null);
  return (Array.isArray(j?.suggestions) ? j.suggestions : []).map((s: any) => ({
    words: String(s.words ?? ""),
    nearest: String(s.nearestPlace ?? ""),
    country: String(s.country ?? ""),
    distanceKm: typeof s.distanceToFocusKm === "number" ? s.distanceToFocusKm : null,
  })).filter((s: W3wSuggestion) => s.words);
}

/** Where some words are (counted against the plan's allowance). */
export async function positionOf(words: string): Promise<{ lat: number; lng: number; nearest: string } | null> {
  const w = words.trim().replace(/^\/+/, "");
  if (!KEY || !W3W_PATTERN.test(w)) return null;
  const j = await call("convert-to-coordinates", { words: w }).catch(() => null);
  const c = j?.coordinates;
  if (typeof c?.lat !== "number" || typeof c?.lng !== "number") return null;
  return { lat: c.lat, lng: c.lng, nearest: typeof j.nearestPlace === "string" ? j.nearestPlace : "" };
}
