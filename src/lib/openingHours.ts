import { getLanguage, tr } from '@/lib/i18n';

/**
 * Opening times from OpenStreetMap's `opening_hours`, read on the phone: is a
 * place open now, and when does that change. Only the common forms are read:
 * 24/7; days, day ranges and lists; one or more time ranges a day, past
 * midnight too ("22:00-02:00") or open-ended ("18:00+"); off / closed; a later
 * rule replacing an earlier one for its days ("Mo-Sa 08:00-20:00; Su off"),
 * and ", Sa 09:00-12:00" adding to them. Anything it can't be sure of
 * (sunrise, months, week numbers, 12-hour times, a rule with no days left once
 * holidays are dropped and nothing else) makes the whole thing unknown: no
 * status beats a wrong one. Public-holiday rules are skipped, since holidays
 * aren't known here. The phone's clock stands in for the place's: these are
 * places nearby. Imports nothing but the language helpers.
 */

/** Minutes from midnight; an end past 1440 runs on into the next day. */
type Span = [number, number];
/** Each day's opening spans, Monday first. */
export type Week = Span[][];

const DAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const D = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
/** One day selector at the start of a piece, then (perhaps) its times. */
const SELECTOR = new RegExp(`^((?:${D}|PH|SH)(?:-${D})?)(?:\\s+(.+))?$`);

const minutesOf = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 48 && min < 60 ? h * 60 + min : null;
};

/** "08:00-12:00,13:00-18:00", "18:00+", "off", "24/7": null when it's none of those. */
function spansOf(text: string): Span[] | null {
  const t = text.trim().toLowerCase();
  if (t === 'off' || t === 'closed') return [];
  if (t === 'open' || t === '24/7') return [[0, 1440]];
  const out: Span[] = [];
  for (const part of t.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const range = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/.exec(p);
    const openEnded = /^(\d{1,2}:\d{2})\+$/.exec(p);
    if (range) {
      const a = minutesOf(range[1]);
      let b = minutesOf(range[2]);
      if (a === null || b === null) return null;
      if (b <= a) b += 1440;
      out.push([a, b]);
    } else if (openEnded) {
      const a = minutesOf(openEnded[1]);
      if (a === null) return null;
      out.push([a, Math.max(a, 1440)]);
    } else return null;
  }
  return out;
}

/** "Mo-Fr", "Sa", "Su-Mo": the days it covers (holidays dropped). */
function daysOf(token: string): number[] {
  if (token === 'PH' || token === 'SH') return [];
  const [from, to] = token.split('-');
  const a = DAY.indexOf(from);
  const b = to ? DAY.indexOf(to) : a;
  const out: number[] = [];
  for (let i = a; ; i = (i + 1) % 7) {
    out.push(i);
    if (i === b) break;
  }
  return out;
}

const parsed = new Map<string, Week | null>();

/** The week an `opening_hours` value describes, or null when it can't be read for certain. */
export function parseOpeningHours(spec: string): Week | null {
  if (parsed.has(spec)) return parsed.get(spec)!;
  const week = parse(spec);
  parsed.set(spec, week);
  return week;
}

function parse(spec: string): Week | null {
  let s = spec.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
  // "Mo-Fr: 08:00-18:00", a common slip: a colon after the days.
  s = s.replace(new RegExp(`(${D}(?:-${D})?):\\s`, 'g'), '$1 ');
  if (!s || /^unknown$/i.test(s)) return null;
  const week: (Span[] | null)[] = Array(7).fill(null);
  let used = false;
  for (const rule of s.split(/\s*(?:;|\|\|)\s*/)) {
    if (!rule) continue;
    // Dated and seasonal rules ("Dec 25 off", "Apr-Sep …", "2025 …", "week 1-26 …") are passed over: they're
    // exceptions to the ordinary week, and with nothing but those the hours stay unknown.
    if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|easter|week\b|\d{4})/i.test(rule)) continue;
    // A rule's pieces: days, then times. A day after times starts an added rule ("Mo-Fr 08:00-18:00, Sa 09:00-12:00").
    const subs: { days: string[]; times: string[] }[] = [];
    let cur: { days: string[]; times: string[] } | null = null;
    let timed = false;
    for (const piece of rule.split(',').map((p) => p.trim()).filter(Boolean)) {
      const m = SELECTOR.exec(piece);
      if (m) {
        if (!cur || timed) {
          cur = { days: [], times: [] };
          subs.push(cur);
          timed = false;
        }
        cur.days.push(m[1]);
        if (m[2]) {
          cur.times.push(m[2]);
          timed = true;
        }
      } else {
        if (!cur) {
          cur = { days: [], times: [] };
          subs.push(cur);
        }
        cur.times.push(piece);
        timed = true;
      }
    }
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      if (!sub.times.length) return null;
      const spans = spansOf(sub.times.join(','));
      if (!spans) return null;
      const days = sub.days.length ? [...new Set(sub.days.flatMap(daysOf))] : [0, 1, 2, 3, 4, 5, 6];
      // Holidays only: nothing to say about an ordinary day.
      if (!days.length) continue;
      for (const d of days) week[d] = i === 0 ? [...spans] : [...(week[d] ?? []), ...spans];
      used = true;
    }
  }
  return used ? week.map((d) => d ?? []) : null;
}

/** A place's state as a list row's tint: faded green while it's open, faded red while it's shut. */
export const openTint = (status: { open: boolean } | null | undefined) => (status ? (status.open ? 'bg-emerald-500/10' : 'bg-red-500/10') : '');
/** The colour its open / closed words are written in. */
export const openText = (status: { open: boolean }) => (status.open ? 'text-emerald-400' : 'text-red-400');

export interface OpenState {
  open: boolean;
  /** Open round the clock, every day. */
  always: boolean;
  /** When it next shuts (open) or opens (closed), within a week; null if it doesn't. */
  next: Date | null;
}

/** Open or closed at `now`, and until when. */
export function openStateAt(week: Week, now: Date): OpenState {
  const t = ((now.getDay() + 6) % 7) * 1440 + now.getHours() * 60 + now.getMinutes();
  // Three weeks on one line of minutes from this Monday: last week's Sunday night runs into this Monday.
  const all: Span[] = [];
  for (let w = -1; w <= 1; w++) {
    for (let d = 0; d < 7; d++) for (const [a, b] of week[d]) all.push([w * 10080 + d * 1440 + a, w * 10080 + d * 1440 + b]);
  }
  all.sort((x, y) => x[0] - y[0]);
  const merged: Span[] = [];
  for (const span of all) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  const at = (m: number) => {
    const d = new Date(now);
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + (m - t));
    return d;
  };
  const span = merged.find(([a, b]) => a <= t && t < b);
  if (span) return span[1] - t >= 7 * 1440 ? { open: true, always: true, next: null } : { open: true, always: false, next: at(span[1]) };
  const next = merged.find(([a]) => a > t);
  return { open: false, always: false, next: next && next[0] - t <= 7 * 1440 ? at(next[0]) : null };
}

/** The phone's own locale where it speaks the app's language (so 24-hour clocks stay 24-hour), else the app's. */
function locale(): string {
  const app = getLanguage();
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith(app) ? navigator.language : app;
}
const clock = (d: Date) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d);
const weekday = (d: Date) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d);
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Open · closes 22:00", "Closed · opens tomorrow at 07:00", "Open 24 hours". */
export function openLabel(state: OpenState, now: Date): string {
  if (state.always) return tr("Open 24 hours");
  if (!state.next) return state.open ? tr("Open") : tr("Closed");
  const time = clock(state.next);
  if (state.open) return tr("Open · closes {0}", [time]);
  const days = Math.round((dayStart(state.next) - dayStart(now)) / 86400000);
  if (days === 0) return tr("Closed · opens {0}", [time]);
  if (days === 1) return tr("Closed · opens tomorrow at {0}", [time]);
  return tr("Closed · opens {0} at {1}", [weekday(state.next), time]);
}

/** A place's status now from its `opening_hours`, ready to show; null when it isn't known. */
export function placeStatus(hours: string | undefined, now = new Date()): { open: boolean; label: string } | null {
  if (!hours) return null;
  const week = parseOpeningHours(hours);
  if (!week) return null;
  const state = openStateAt(week, now);
  return { open: state.open, label: openLabel(state, now) };
}

/**
 * The week in short lines, days with the same hours run together and named in
 * the rider's language: "Mon–Fri 07:00–22:00", "Sat–Sun 08:00–20:00", "Sun
 * closed". Open all week round the clock is one line.
 */
export function weekLines(week: Week): string[] {
  if (week.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return [tr("Open 24 hours")];
  const monday = new Date(2024, 0, 1); // a Monday
  const name = (i: number) => weekday(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const time = (m: number) => clock(new Date(2024, 0, 1, Math.floor(m / 60) % 24, m % 60));
  const key = (d: number) => week[d].map(([a, b]) => `${a}-${b}`).join(',');
  const lines: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && key(j + 1) === key(i)) j++;
    const days = i === j ? name(i) : `${name(i)}–${name(j)}`;
    const times = week[i].length ? week[i].map(([a, b]) => `${time(a)}–${time(b)}`).join(', ') : tr("closed");
    lines.push(`${days} ${times}`);
    i = j + 1;
  }
  return lines;
}
