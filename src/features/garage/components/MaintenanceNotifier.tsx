import { useEffect } from 'react';
import { useDemoMode } from '@/lib/demoMode';
import { useSettings } from '@/features/settings';
import { getDistanceLabel } from '@/lib/format';
import { showLocalNotification, syncPushReminders, usePush, type PushReminder } from '@/features/notifications';
import { useGarage } from '../hooks/useGarage';
import { useBikeStats } from '../hooks/useBikeStats';
import type { Bike } from '../types';
import { tr } from '@/lib/i18n';

/**
 * Maintenance notifications ("due soon" / "overdue"), mounted once:
 *  - mileage: checked on this phone whenever a bike's odometer moves (i.e.
 *    after a ride) and notified here, once per state per service interval
 *  - time (e.g. a 12-month service): handed to the server as dated
 *    reminders, so they arrive even if Blacktop isn't opened
 */

const NOTIFIED_KEY = 'bt.maint.notified.v1';
const SEEDED_KEY = 'bt.maint.seeded.v1';
/** Same thresholds as the Garage list (serviceReminders.ts). */
const WARN_KM = 200;
const WARN_DAYS = 14;
const DAY = 86400000;
const KM_TO_MI = 0.621371;

type Tone = 'ok' | 'warn' | 'over';
const RANK: Record<Tone, number> = { ok: 0, warn: 1, over: 2 };

function readNotified(): Record<string, Tone> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeNotified(map: Record<string, Tone>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
  } catch {
    /* not fatal */
  }
}

function seeded() {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return true;
  }
}

export function MaintenanceNotifier() {
  const { bikes } = useGarage();
  const push = usePush();
  const { enabled: demo } = useDemoMode();

  // Time-based reminders for the server (replaces the previous set).
  useEffect(() => {
    if (demo) return;
    const now = Date.now();
    const reminders: PushReminder[] = [];
    for (const bike of bikes) {
      for (const item of bike.maintenance) {
        if (!item.intervalMonths || !item.lastServiceAt) continue;
        const due = new Date(item.lastServiceAt + item.intervalMonths * 30.44 * DAY);
        due.setHours(9, 0, 0, 0); // a sensible time of day on the due date
        const warn = new Date(due.getTime() - WARN_DAYS * DAY);
        const base = `maint:${bike.id}:${item.id}:${due.toISOString().slice(0, 10)}`;
        const months = `${item.intervalMonths}-month`;
        if (warn.getTime() > now) {
          reminders.push({
            key: `${base}:warn`,
            title: tr("🔧 {0} due soon", [item.name]),
            body: tr("{0}: its {1} service is due in two weeks.", [bike.name, months]),
            url: '/garage',
            due_at: warn.toISOString(),
          });
        }
        if (due.getTime() > now) {
          reminders.push({
            key: `${base}:over`,
            title: tr("🔧 {0} is due", [item.name]),
            body: tr("{0}: time for its {1} service.", [bike.name, months]),
            url: '/garage',
            due_at: due.toISOString(),
          });
        }
      }
    }
    const t = window.setTimeout(() => void syncPushReminders('maintenance', reminders), 1500);
    return () => window.clearTimeout(t);
  }, [bikes, demo, push.enabled, push.categories]);

  // After the first pass, only changes from here on are notified.
  useEffect(() => {
    if (demo || seeded()) return;
    try {
      localStorage.setItem(SEEDED_KEY, '1');
    } catch {
      /* not fatal */
    }
  }, [demo]);

  if (demo) return null;
  return (
    <>
      {bikes.map((b) => (
        <BikeMileageWatch key={b.id} bike={b} />
      ))}
    </>
  );
}

/** Watches one bike's odometer against its mileage intervals. */
function BikeMileageWatch({ bike }: { bike: Bike }) {
  const { odometerKm } = useBikeStats(bike);
  const { settings } = useSettings();
  const push = usePush();
  const miles = settings.distanceUnit === 'miles';
  const unit = getDistanceLabel(settings.distanceUnit);

  useEffect(() => {
    const notified = readNotified();
    const silent = !seeded();
    let changed = false;
    const fmt = (km: number) => {
      const v = miles ? km * KM_TO_MI : km;
      return v < 10 ? v.toFixed(1) : Math.round(v).toString();
    };
    for (const item of bike.maintenance) {
      if (!item.intervalKm) continue;
      const dueInKm = item.lastServiceKm + item.intervalKm - odometerKm;
      const tone: Tone = dueInKm <= 0 ? 'over' : dueInKm <= WARN_KM ? 'warn' : 'ok';
      // Keyed by the service interval, so servicing it starts afresh.
      const key = `${bike.id}:${item.id}:${Math.round(item.lastServiceKm)}`;
      const before = notified[key] ?? 'ok';
      if (RANK[tone] <= RANK[before]) continue;
      notified[key] = tone;
      changed = true;
      if (silent) continue;
      void showLocalNotification('maintenance', {
        title: tone === 'over' ? tr("🔧 {0} is overdue", [item.name]) : tr("🔧 {0} due soon", [item.name]),
        body:
          tone === 'over'
            ? tr("{0}: overdue by {1} {2}.", [bike.name, fmt(-dueInKm), unit])
            : tr("{0}: due in {1} {2}.", [bike.name, fmt(dueInKm), unit]),
        tag: `maint-${bike.id}-${item.id}`,
        url: '/garage',
      });
    }
    if (changed) writeNotified(notified);
  }, [bike, odometerKm, miles, unit, push.enabled]);

  return null;
}
