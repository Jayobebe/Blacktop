/**
 * Translations. English source text is the key: `tr("Join Convoy")` looks
 * the text up in the active language's dictionary (src/lib/i18n/locales/<code>.json)
 * and falls back to the English when there's no entry. `{0}`, `{1}` are
 * filled from `params` (`tr("{0} rides", [n])`).
 *
 * The dictionary is loaded before the app itself is imported (main.tsx), so
 * text in module-level data (hazard types, settings options, demo slides) is
 * translated too. Changing language saves the choice and reloads the app.
 *
 * New text: wrap it in tr() (scripts/i18n/wrap.mjs does it for you), then run
 * `npm run i18n:check` to list what each language is missing.
 */

// Each language in two parts (scripts/i18n/vite-split.mjs): what the app shows
// anywhere, loaded before it starts, and the text only the legal pages, the
// demo tour and the Enterprise demos use, loaded when they open (or at idle).
import { parts } from 'virtual:i18n-dicts';

export interface Language {
  code: string;
  /** Its own name, as speakers write it. */
  name: string;
  /** In English, for the picker's second line. */
  english: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'it', name: 'Italiano', english: 'Italian' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch' },
  { code: 'pl', name: 'Polski', english: 'Polish' },
  { code: 'sv', name: 'Svenska', english: 'Swedish' },
  { code: 'da', name: 'Dansk', english: 'Danish' },
  { code: 'nb', name: 'Norsk', english: 'Norwegian' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'uk', name: 'Українська', english: 'Ukrainian' },
  { code: 'ja', name: '日本語', english: 'Japanese' },
  { code: 'ko', name: '한국어', english: 'Korean' },
  { code: 'zh', name: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
];

const STORAGE_KEY = 'blacktop_language';

let current = 'en';
let dict: Record<string, string> = {};

function supported(code: string | null | undefined): string | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0];
  const mapped = base === 'no' || base === 'nn' ? 'nb' : base;
  return LANGUAGES.some((l) => l.code === mapped) ? mapped : null;
}

/** Saved choice, else Nimiq Pay's language inside its mini-app view, else the phone's, else English. */
function detect(): string {
  try {
    const saved = supported(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {
    /* storage blocked */
  }
  // Nimiq Pay sets this before any page script runs (window.nimiqPay.language, ISO 639-1).
  const host = supported((globalThis as { nimiqPay?: { language?: string } }).nimiqPay?.language);
  if (host) return host;
  const langs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const l of langs) {
    const s = supported(l);
    if (s) return s;
  }
  return 'en';
}

/** Loads the active language. Call (and await) before importing the app. */
export async function initI18n(): Promise<void> {
  current = detect();
  if (current !== 'en') {
    const load = parts[current]?.main;
    try {
      dict = load ? { ...(await load()).default } : {};
    } catch (e) {
      console.warn('[i18n] dictionary failed to load, using English', e);
      dict = {};
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

let extra: Promise<void> | null = null;

/**
 * Loads the rest of the active language (legal pages, demo tour, Enterprise
 * demos). Those pages wait for it; it's also fetched once the app is idle.
 */
export function loadLocaleExtra(): Promise<void> {
  if (current === 'en') return Promise.resolve();
  extra ??= (parts[current]?.extra() ?? Promise.resolve({ default: {} }))
    .then((m) => {
      dict = { ...dict, ...m.default };
    })
    .catch((e) => {
      // A failed fetch can be tried again; those pages show English meanwhile.
      console.warn('[i18n] extra text failed to load', e);
      extra = null;
    });
  return extra;
}

export function getLanguage(): string {
  return current;
}

/** Saves the choice and reloads, so every screen and every bit of data switches. */
export function setLanguage(code: string) {
  const next = supported(code) ?? 'en';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* can't persist: this session only */
  }
  if (next !== current) window.location.reload();
}

export function tr(text: string, params?: unknown[]): string {
  const s = dict[text] || text;
  return params ? s.replace(/\{(\d+)\}/g, (_, i) => String(params[+i] ?? '')) : s;
}

/** A name used mid-sentence ("your engine oil"): lower-cased, except in German, where nouns keep their capital. */
export function lowerName(name: string): string {
  return current === 'de' ? name : name.toLowerCase();
}
