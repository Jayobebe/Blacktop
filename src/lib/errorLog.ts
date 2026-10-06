/**
 * What went wrong lately, kept in memory on this phone and sent nowhere. When
 * a screen crashes, the error screen offers a report built from it for the
 * rider to copy and pass on: the error, the screen it happened on, the app
 * build and the kind of phone. No name, no location, no ride data; ids in the
 * address and anything after a "?" are left out.
 */
declare const __BUILD__: string;

interface Logged {
  at: number;
  what: string;
}

const recent: Logged[] = [];
const KEEP = 8;

/** Addresses lose their query (it can carry codes and tokens). */
const scrub = (text: string) => text.replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1').slice(0, 600);

export function noteError(what: unknown) {
  const text = what instanceof Error ? `${what.name}: ${what.message}` : typeof what === 'string' ? what : (() => {
    try {
      return JSON.stringify(what);
    } catch {
      return String(what);
    }
  })();
  recent.push({ at: Date.now(), what: scrub(text || 'Unknown error') });
  if (recent.length > KEEP) recent.shift();
}

let installed = false;
/** Listens for errors nothing else caught, so a report can say what led up to a crash. */
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => noteError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => noteError(e.reason));
}

/** The screen, without anything that identifies a ride, a lobby or a person. */
function screenName(): string {
  return (
    location.pathname
      .split('/')
      .map((part) => (part.length > 14 || /\d/.test(part) ? ':id' : part))
      .join('/') || '/'
  );
}

export function errorReport(error: Error): string {
  const nav = navigator as Navigator & { standalone?: boolean };
  const installedApp = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  const build = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
  const stack = scrub((error.stack || '').split('\n').slice(0, 14).join('\n'));
  const earlier = recent
    .filter((r) => !r.what.includes(error.message || '\u0000'))
    .map((r) => `  ${Math.round((Date.now() - r.at) / 1000)}s ago: ${r.what}`);
  return [
    'Blacktop error report',
    `Build: ${build}`,
    `Screen: ${screenName()}`,
    `Language: ${document.documentElement.lang || navigator.language}`,
    `Phone: ${navigator.userAgent}`,
    `Display: ${window.innerWidth}x${window.innerHeight} @${Math.round(window.devicePixelRatio * 100) / 100}x${installedApp ? ', installed' : ', in a browser'}`,
    `Online: ${navigator.onLine ? 'yes' : 'no'}`,
    '',
    `Error: ${scrub(`${error.name}: ${error.message}`)}`,
    stack,
    ...(earlier.length ? ['', 'Before that:', ...earlier] : []),
  ].join('\n');
}

/** Copies text, with the old selection trick where the clipboard isn't offered. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
