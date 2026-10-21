/**
 * The calendar's own notifications, sent by the server at their time (dated
 * push reminders, category `calendar`, so they arrive with the app closed):
 * a plan an hour before; a reminder the day before and on the morning; a Track
 * Day booking the evening before with the packing list; the safety check the
 * evening before a long plan. Handed over whenever the calendar changes, only
 * once the server has the calendar (the `calendar` cap). Mounted once in App.
 */
import { useEffect } from 'react';
import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { syncPushReminders, type PushReminder } from '@/features/notifications';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { useCalendarStore, dayKey, addDays, itemTime, reminderDayFrom, reminderName, type CalendarItem } from './calendarStore';

const at = (day: string, hhmm: string) => itemTime({ day, time: hhmm });

function remindersFor(items: CalendarItem[], longRoutes: Set<string>): PushReminder[] {
  const now = Date.now();
  const today = dayKey(now);
  const out: PushReminder[] = [];
  const add = (key: string, due: number, title: string, body: string, url = '/calendar') => {
    if (due > now) out.push({ key, title, body, url, due_at: new Date(due).toISOString() });
  };
  for (const i of items) {
    if (!i.notify) continue;
    if (i.kind === 'reminder') {
      const day = reminderDayFrom(i, today);
      const name = i.type === 'other' ? i.title : reminderName(i);
      add(`cal:${i.id}:${day}:eve`, at(addDays(day, -1), '09:00'), tr("Tomorrow: {0}", [name]), i.notes || tr("On your Blacktop Calendar."));
      add(`cal:${i.id}:${day}:day`, at(day, i.time ?? '09:00'), tr("Today: {0}", [name]), i.notes || tr("On your Blacktop Calendar."));
    } else if (i.kind === 'plan') {
      const when = itemTime(i);
      add(`cal:${i.id}:soon`, when - 3600_000, tr("In an hour: {0}", [i.title]), i.place?.name ?? tr("On your Blacktop Calendar."));
      if (i.tripId || (i.routeId && longRoutes.has(i.routeId))) {
        add(`cal:${i.id}:check`, at(addDays(i.day, -1), '19:00'), tr("Safety check for tomorrow"), tr("Crash detection, your emergency contact and the safe-arrival text"));
      }
    } else {
      const left = i.packing.filter((p) => !p.done).map((p) => p.item);
      add(`cal:${i.id}:eve`, at(addDays(i.day, -1), '18:00'), tr("Track Day tomorrow: {0}", [i.circuit]), left.length ? tr("Still to pack: {0}", [left.slice(0, 5).join(', ')]) : tr("All packed."));
      add(`cal:${i.id}:check`, at(addDays(i.day, -1), '19:00'), tr("Safety check for tomorrow"), tr("Crash detection, your emergency contact and the safe-arrival text"));
    }
  }
  return out.sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 200);
}

export function CalendarReminders() {
  const { items } = useCalendarStore();
  const routes = useSavedRoutes();
  const cap = useServerCap('calendar');
  useEffect(() => {
    if (!cap) return;
    const long = new Set(routes.filter((r) => (r.via?.length ?? 0) > 0).map((r) => r.id));
    const t = window.setTimeout(() => void syncPushReminders('calendar', remindersFor(items, long)), 1500);
    return () => window.clearTimeout(t);
  }, [cap, items, routes]);
  return null;
}
