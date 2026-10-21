/**
 * The calendar as an .ics file, for the phone's own calendar (Google, Apple,
 * Outlook): plans, reminders (yearly ones repeat), Track Day bookings and
 * crew plans the rider is going to or may go to. Times are local ("floating"),
 * so they land at the same clock time wherever the file is opened. Shared
 * through the share sheet, or downloaded where there isn't one.
 */
import { tr } from '@/lib/i18n';
import { isNativeApp } from '@/lib/platform';
import { shareFileNative } from '@/lib/nativeShare';
import { getCalendarItems, itemTime, reminderName } from './calendarStore';
import type { CrewEvent } from './crewEvents';

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};
const dateOnly = (day: string) => day.replace(/-/g, '');
/** RFC 5545 text: commas, semicolons and backslashes escaped, lines folded at 74. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
function fold(line: string) {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? ' ' : '') + line.slice(i, i + 74));
  return out.join('\r\n');
}

export function buildIcs(crew: CrewEvent[]): string {
  const now = stamp(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blacktop//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${text(tr("Blacktop Calendar"))}`];
  const event = (uid: string, fields: string[]) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@blacktoplive.com`, `DTSTAMP:${now}`, ...fields.map(fold), 'END:VEVENT');
  };
  for (const i of getCalendarItems()) {
    if (i.kind === 'reminder') {
      const fields = [`SUMMARY:${text(i.type === 'other' ? i.title : reminderName(i))}`];
      if (i.time) fields.push(`DTSTART:${stamp(itemTime(i))}`, `DTEND:${stamp(itemTime(i) + 3600_000)}`);
      else fields.push(`DTSTART;VALUE=DATE:${dateOnly(i.day)}`);
      if (i.yearly) fields.push('RRULE:FREQ=YEARLY');
      if (i.notes) fields.push(`DESCRIPTION:${text(i.notes)}`);
      event(i.id, fields);
    } else if (i.kind === 'plan') {
      const start = itemTime(i);
      const fields = [`SUMMARY:${text(i.title)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 2 * 3600_000)}`];
      if (i.place) fields.push(`LOCATION:${text(i.place.name)}`, `GEO:${i.place.lat.toFixed(5)};${i.place.lng.toFixed(5)}`);
      if (i.notes) fields.push(`DESCRIPTION:${text(i.notes)}`);
      event(i.id, fields);
    } else {
      const start = itemTime(i);
      const fields = [`SUMMARY:${text(tr("Track Day: {0}", [i.circuit]))}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 8 * 3600_000)}`, `LOCATION:${text(i.circuit)}`];
      fields.push(`DESCRIPTION:${text(i.packing.map((p) => `${p.done ? '✓' : '·'} ${p.item}`).join('\n'))}`);
      event(i.id, fields);
    }
  }
  for (const e of crew) {
    if (e.my_status !== 'going' && e.my_status !== 'maybe') continue;
    const start = Date.parse(e.starts_at);
    const fields = [`SUMMARY:${text(e.title)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 3 * 3600_000)}`];
    if (e.place_name) fields.push(`LOCATION:${text(e.place_name)}`);
    if (e.lat != null && e.lng != null) fields.push(`GEO:${e.lat.toFixed(5)};${e.lng.toFixed(5)}`);
    if (e.notes) fields.push(`DESCRIPTION:${text(e.notes)}`);
    event(e.id, fields);
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Hands the file over: the share sheet in the app or where the browser has one, else a download. */
export async function exportIcs(crew: CrewEvent[]): Promise<void> {
  const body = buildIcs(crew);
  const name = 'blacktop-calendar.ics';
  if (isNativeApp()) {
    await shareFileNative(name, new Blob([body], { type: 'text/calendar' }), tr("Blacktop Calendar"));
    return;
  }
  const file = new File([body], name, { type: 'text/calendar' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: tr("Blacktop Calendar") });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
