/**
 * Something new on Blacktop Console, for its pip on Home: notifications not
 * seen yet, rain on its way (dry now, wet within three hours), or something on
 * the calendar tomorrow, that the rider hasn't looked at. Light on purpose: Home imports it. Home keeps the
 * forecast fresh when it opens (`refreshConsoleNews`, Open-Meteo only, half
 * an hour apart), and looking at the Console marks the rain as seen
 * (`blacktop_console_seen`, left out of backups).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useInbox } from '@/lib/inbox';
import { getRiderWeather, rainSoon, refreshRiderWeather, useRiderWeather } from './riderWeather';
import { knownSpot } from './whereRider';
import { hasItemsOn, dayKey, addDays } from '@/features/calendar/lib/calendarStore';

const SEEN_KEY = 'blacktop_console_seen';
const listeners = new Set<() => void>();

function seenSignal(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The rain signal as it stands (the hour it starts), or '' with none. */
function rainSignal(): string {
  const r = rainSoon(getRiderWeather());
  return r ? `rain:${r.t}` : '';
}

/** Something on the calendar tomorrow (a plan, a reminder, a Track Day), or ''. */
function tomorrowSignal(): string {
  const t = addDays(dayKey(Date.now()), 1);
  return hasItemsOn(t) ? `cal:${t}` : '';
}

/** What's news now: each signal the pip is about, joined. */
const signals = () => [rainSignal(), tomorrowSignal()].filter(Boolean);

/** The Console has been looked at: what it showed is no longer news. */
export function markConsoleSeen() {
  const s = signals().join('|');
  if (!s || s === seenSignal()) return;
  try {
    localStorage.setItem(SEEN_KEY, s);
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

/** Home opened: refresh the forecast if it's old, so the pip can say rain is coming. */
export function refreshConsoleNews() {
  void refreshRiderWeather(knownSpot());
}

export function useConsoleNews(): boolean {
  const inbox = useInbox();
  useRiderWeather(null, false); // redrawn when a new forecast arrives
  const [, tick] = useState(0);
  const seen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    seenSignal,
    seenSignal,
  );
  // The rain signal moves with the clock: look again every ten minutes while Home is up.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 10 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  const seenList = seen.split('|');
  return inbox.unread > 0 || signals().some((x) => !seenList.includes(x));
}
