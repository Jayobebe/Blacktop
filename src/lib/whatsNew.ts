/**
 * What's new: a short card on Home after an update, the same lines kept in
 * Blacktop Console's notifications, and every release listed on `/whats-new`
 * (Settings, under Burn). Until that list has been opened since the newest
 * release, Home's Settings button glows, and so does What's new in Settings.
 *
 * Releases are written here by hand, newest first, a few short lines each
 * (every line is translated, so keep them short). A release with nothing worth
 * telling riders gets no entry. A rider who set up after the newest release
 * sees neither the card nor the glow (they get the tour).
 *
 * Kept on the phone (`blacktop_whats_new`, left out of backups): the newest
 * release whose card was shown, and the newest whose list was opened.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

export type ReleaseIcon = 'fuel' | 'medical' | 'calendar' | 'storage' | 'console' | 'trip' | 'route' | 'pixels' | 'shape' | 'back' | 'search' | 'bell';

export interface ReleaseLine {
  icon: ReleaseIcon;
  text: string;
  /** Where its link goes, and what the link says. */
  to?: string;
  link?: string;
}
export interface Release {
  /** The day it went out, YYYY-MM-DD, with a letter for a second release that day. */
  id: string;
  lines: ReleaseLine[];
}

/** Newest first. Read through a function so the lines are in the rider's language. */
export function releases(): Release[] {
  return [
    {
      id: '2026-10-21b',
      lines: [
        { icon: 'fuel', text: tr("The logbook keeps a ledger: fill-ups, costs and parts. Pause a ride at the pump and it asks what you put in.") },
        { icon: 'fuel', text: tr("Fuel prices on the map, from riders who share what they paid. Opt in when you fill up.") },
        { icon: 'medical', text: tr("Medical ID: what someone helping you after a crash should know, on the crash screens."), to: '/settings?section=safety', link: tr("Set it up") },
        { icon: 'storage', text: tr("Storage: see what's using space on your phone and clear it."), to: '/storage', link: tr("Open Storage") },
        { icon: 'pixels', text: tr("Swipe between Home, Console and Enterprise and the page breaks into pixels.") },
        { icon: 'shape', text: tr("Every button is the same shape, and selectors slide to your choice.") },
        { icon: 'back', text: tr("Back from anything opened on the Console takes you back to the Console.") },
      ],
    },
    {
      id: '2026-10-21',
      lines: [
        { icon: 'calendar', text: tr("Blacktop Calendar: your rides, plans, reminders, services and crew plans, with a clock and stopwatch."), to: '/calendar', link: tr("Open the calendar") },
        { icon: 'trip', text: tr("Trip receipts list every leg: its date, distance, time and speeds, and the best of the trip.") },
        { icon: 'bell', text: tr("Up next on the Console: what's coming in the next two weeks, with the weather.") },
      ],
    },
    {
      id: '2026-10-20',
      lines: [
        { icon: 'console', text: tr("Blacktop Console, to the left of Home: live cards, quick actions, search and notifications.") },
        { icon: 'route', text: tr("Save a route with as many stops as you like, and ride it in legs over several days."), to: '/routes/new', link: tr("Save a route") },
        { icon: 'search', text: tr("Twisty or Direct: pick how to get anywhere you choose on the map.") },
      ],
    },
  ];
}

const KEY = 'blacktop_whats_new';
interface Kept {
  /** Newest release whose card has been shown. */
  seen?: string;
  /** Newest release whose list has been opened. */
  opened?: string;
}

function read(): Kept {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? (v as Kept) : {};
  } catch {
    return {};
  }
}
let kept: Kept = typeof window !== 'undefined' ? read() : {};
const listeners = new Set<() => void>();
function write(next: Kept) {
  kept = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

export const latestRelease = () => releases()[0]?.id ?? '';

/** A rider who set up after the newest release has nothing to catch up on. */
export function settleForNewRider(createdAt: string | undefined) {
  const latest = latestRelease();
  if (!latest || kept.seen || kept.opened || !createdAt) return;
  if (createdAt.slice(0, 10) >= latest.slice(0, 10)) write({ seen: latest, opened: latest });
}
export function markWhatsNewSeen() {
  const latest = latestRelease();
  if (kept.seen !== latest) write({ ...kept, seen: latest });
}
export function markWhatsNewOpened() {
  const latest = latestRelease();
  if (kept.seen !== latest || kept.opened !== latest) write({ seen: latest, opened: latest });
}

export function useWhatsNew(): { card: boolean; unread: boolean } {
  const k = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kept,
    () => kept,
  );
  const latest = latestRelease();
  return { card: !!latest && k.seen !== latest, unread: !!latest && k.opened !== latest };
}

/** "21 October 2026" from a release id. */
export function releaseDate(id: string): string {
  const d = new Date(`${id.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
