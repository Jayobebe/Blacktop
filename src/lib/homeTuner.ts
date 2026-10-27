/**
 * Home's tuner strip (components/HomeTuner): which channels the rider has
 * switched off. Kept on the phone (`blacktop_home_tuner`, carried by
 * backups). Imports nothing heavy: Home reads it.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

export type TunerChannelId =
  | 'welcome'
  | 'sun'
  | 'daylight'
  | 'lastride'
  | 'riding'
  | 'yearago'
  | 'year'
  | 'total'
  | 'earth'
  | 'saddle'
  | 'next'
  | 'best'
  | 'near'
  | 'drops';

export const TUNER_CHANNELS: TunerChannelId[] = ['welcome', 'sun', 'daylight', 'lastride', 'riding', 'yearago', 'year', 'total', 'earth', 'saddle', 'next', 'best', 'near', 'drops'];

export function channelName(id: TunerChannelId): string {
  switch (id) {
    case 'welcome':
      return tr("Welcome");
    case 'sun':
      return tr("Sunset and sunrise");
    case 'daylight':
      return tr("Daylight today");
    case 'lastride':
      return tr("Your last ride");
    case 'total':
      return tr("All time");
    case 'earth':
      return tr("Round the world");
    case 'saddle':
      return tr("Time in the saddle");
    case 'next':
      return tr("Your next milestone ride");
    case 'riding':
      return tr("Riding now worldwide");
    case 'yearago':
      return tr("On this day");
    case 'year':
      return tr("This year");
    case 'best':
      return tr("Personal best");
    case 'near':
      return tr("Riders near you");
    default:
      return tr("Card drops near you");
  }
}

const KEY = 'blacktop_home_tuner';
const listeners = new Set<() => void>();

function read(): TunerChannelId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { hidden?: unknown } | null;
    return Array.isArray(v?.hidden) ? (v!.hidden as TunerChannelId[]).filter((x) => TUNER_CHANNELS.includes(x)) : [];
  } catch {
    return [];
  }
}

let hidden = read();

export function useTunerHidden(): TunerChannelId[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden,
    () => hidden,
  );
}

export function setTunerHidden(id: TunerChannelId, hide: boolean) {
  hidden = hide ? Array.from(new Set([...hidden, id])) : hidden.filter((h) => h !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify({ hidden }));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}
