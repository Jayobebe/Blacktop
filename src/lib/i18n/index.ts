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
const loaders = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json');

let current = 'en';
let dict: Record<string, string> = {};

function supported(code: string | null | undefined): string | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0];
  const mapped = base === 'no' || base === 'nn' ? 'nb' : base;
  return LANGUAGES.some((l) => l.code === mapped) ? mapped : null;
}

/** Saved choice, else the phone's language when we have it, else English. */
function detect(): string {
  try {
    const saved = supported(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {
    /* storage blocked */
  }
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
    const load = loaders[`./locales/${current}.json`];
    try {
      dict = load ? (await load()).default : {};
    } catch (e) {
      console.warn('[i18n] dictionary failed to load, using English', e);
      dict = {};
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
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
