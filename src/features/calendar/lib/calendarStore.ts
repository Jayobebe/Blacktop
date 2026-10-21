/**
 * What the rider puts on the Blacktop Calendar themselves, kept on the phone
 * (`blacktop_calendar`, carried by backups; Burn sweeps it): ride plans (a
 * saved route, a place or nothing, maybe a trip's leg), reminders (MOT,
 * insurance, tax, tyres, anything; yearly if asked), Track Day bookings with
 * a packing list. Plus a private log of things the app noticed on the day
 * (`blacktop_activity_log`): rescue drills, and rescue calls sent and
 * answered. Light on purpose: Home's pip reads it.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';
import { isDemoModeActive, onDemoModeChange } from '@/lib/demoMode';
import { demoBlocked } from '@/lib/demoGuard';

export type ReminderType = 'mot' | 'insurance' | 'tax' | 'tyres' | 'other';

interface Base {
  id: string;
  /** The day, local, YYYY-MM-DD. */
  day: string;
  /** HH:MM, local (a reminder without one is for the day). */
  time?: string;
  title: string;
  notes?: string;
  /** Ping the phone (calendar push category) ahead of it. */
  notify: boolean;
  createdAt: number;
}

export interface PlanItem extends Base {
  kind: 'plan';
  /** Where to: a saved route, or a single place. */
  routeId?: string;
  place?: { lat: number; lng: number; name: string; address?: string };
  /** A leg of an unfinished trip, ridden that day. */
  tripId?: string;
  leg?: number;
}

export interface ReminderItem extends Base {
  kind: 'reminder';
  type: ReminderType;
  /** Comes round again a year on (MOT, insurance, tax). */
  yearly: boolean;
}

export interface TrackItem extends Base {
  kind: 'track';
  circuit: string;
  /** The circuit library layout, when picked from it. */
  circuitId?: number;
  packing: Array<{ item: string; done: boolean }>;
}

export type CalendarItem = PlanItem | ReminderItem | TrackItem;

export type ActivityKind = 'drill' | 'rescue_sent' | 'rescue_answered';
export interface Activity {
  kind: ActivityKind;
  at: number;
  note?: string;
}

const KEY = 'blacktop_calendar';
const LOG_KEY = 'blacktop_activity_log';
const MAX_LOG = 400;

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

let items: CalendarItem[] = typeof window !== 'undefined' ? read<CalendarItem>(KEY).filter((i) => i && typeof i.day === 'string') : [];
let log: Activity[] = typeof window !== 'undefined' ? read<Activity>(LOG_KEY) : [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function saveItems(next: CalendarItem[]) {
  items = next.sort((a, b) => (a.day + (a.time ?? '')).localeCompare(b.day + (b.time ?? '')));
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* this launch only */
  }
  emit();
}

// Demo mode: a calendar of its own (nothing the rider adds is kept there).
let demo: { items: CalendarItem[]; log: Activity[] } | null = null;
function demoData() {
  if (demo) return demo;
  const t = dayKey(Date.now());
  const day = (n: number) => addDays(t, n);
  const made = Date.now();
  demo = {
    items: [
      { id: 'demo-cal-1', kind: 'plan', day: day(2), time: '08:30', title: 'Wales weekend: the last leg', notify: true, createdAt: made, tripId: 'demo-trip-wales', leg: 2 },
      { id: 'demo-cal-2', kind: 'track', day: day(9), time: '07:45', title: 'Brands Hatch', circuit: 'Brands Hatch', notify: true, createdAt: made, packing: [tr("Helmet"), tr("Leathers or suit"), tr("Gloves"), tr("Boots"), tr("Tyre warmers"), tr("Fuel")].map((item, i) => ({ item, done: i < 3 })) },
      { id: 'demo-cal-3', kind: 'reminder', day: day(12), title: '', type: 'mot', yearly: true, notify: true, createdAt: made },
      { id: 'demo-cal-4', kind: 'reminder', day: day(40), title: '', type: 'insurance', yearly: true, notify: true, createdAt: made },
      { id: 'demo-cal-5', kind: 'plan', day: day(5), time: '18:00', title: 'Evening loop', notify: false, createdAt: made, place: { lat: 50.9006, lng: -0.1063, name: 'Ditchling Beacon' } },
    ] as CalendarItem[],
    log: [{ kind: 'drill', at: Date.now() - 100 * 86_400_000 }],
  };
  return demo;
}
if (typeof window !== 'undefined') onDemoModeChange(() => emit());

export const getCalendarItems = () => (isDemoModeActive() ? demoData().items : items);
export const getActivityLog = () => (isDemoModeActive() ? demoData().log : log);

export function addCalendarItem(item: Omit<PlanItem, 'id' | 'createdAt'> | Omit<ReminderItem, 'id' | 'createdAt'> | Omit<TrackItem, 'id' | 'createdAt'>): CalendarItem {
  const full = { ...item, id: crypto.randomUUID(), createdAt: Date.now() } as CalendarItem;
  if (demoBlocked()) return full;
  saveItems([...items, full]);
  return full;
}

export function updateCalendarItem(id: string, patch: Partial<CalendarItem>) {
  if (isDemoModeActive()) {
    const d = demoData();
    d.items = d.items.map((i) => (i.id === id ? ({ ...i, ...patch } as CalendarItem) : i));
    return emit();
  }
  saveItems(items.map((i) => (i.id === id ? ({ ...i, ...patch } as CalendarItem) : i)));
}

export function removeCalendarItem(id: string) {
  if (demoBlocked()) return;
  saveItems(items.filter((i) => i.id !== id));
}

/** Something happened today worth seeing on the calendar later (never sent anywhere). */
export function logActivity(kind: ActivityKind, note?: string) {
  if (isDemoModeActive()) return;
  log = [{ kind, at: Date.now(), note }, ...log].slice(0, MAX_LOG);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* this launch only */
  }
  emit();
}

export function useCalendarStore(): { items: CalendarItem[]; log: Activity[] } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot(),
    () => snapshot(),
  );
  return snap;
}

let last: { items: CalendarItem[]; log: Activity[] } = { items, log };
function snapshot() {
  const now = { items: getCalendarItems(), log: getActivityLog() };
  if (last.items !== now.items || last.log !== now.log) last = now;
  return last;
}

// ── Days ─────────────────────────────────────────────────────────────────────

/** A local day as YYYY-MM-DD. */
export function dayKey(d: Date | number): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Midnight local of a day key. */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** When an item happens (its time, else 09:00 that day). */
export function itemTime(i: Pick<CalendarItem, 'day' | 'time'>): number {
  const d = dayStart(i.day);
  const [h, m] = (i.time ?? '09:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/**
 * Where a reminder falls: a yearly one comes round on its date each year, so
 * the next one from `from` on (else its own date).
 */
export function reminderDayFrom(r: ReminderItem, from: string): string {
  if (!r.yearly || r.day >= from) return r.day;
  const [, m, d] = r.day.split('-');
  const y = Number(from.slice(0, 4));
  const candidate = `${y}-${m}-${d}`;
  return candidate >= from ? candidate : `${y + 1}-${m}-${d}`;
}

/** Something of the rider's own on this day (for the Console's date square). */
export function hasItemsOn(key: string): boolean {
  return getCalendarItems().some((i) => (i.kind === 'reminder' ? reminderDayFrom(i, key) === key : i.day === key));
}

/** A reminder's name: its type's, or what the rider typed. */
export function reminderName(r: ReminderItem): string {
  switch (r.type) {
    case 'mot':
      return tr("MOT / inspection");
    case 'insurance':
      return tr("Insurance renewal");
    case 'tax':
      return tr("Vehicle tax");
    case 'tyres':
      return tr("Tyre swap");
    default:
      return r.title || tr("Reminder");
  }
}

