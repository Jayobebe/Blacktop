/**
 * Home's tuner strip (components/HomeTuner): which channels the rider has
 * switched off. Kept on the phone (`blacktop_home_tuner`, carried by
 * backups). Imports nothing heavy: Home reads it.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

export type TunerChannelId = 'welcome' | 'sun' | 'riding' | 'yearago' | 'year' | 'best' | 'fuel' | 'near' | 'drops';

export const TUNER_CHANNELS: TunerChannelId[] = ['welcome', 'sun', 'riding', 'yearago', 'year', 'best', 'fuel', 'near', 'drops'];

export function channelName(id: TunerChannelId): string {
  switch (id) {
    case 'welcome':
      return tr("Welcome");
    case 'sun':
      return tr("Sunset and sunrise");
    case 'riding':
      return tr("Riding now worldwide");
    case 'yearago':
      return tr("On this day");
    case 'year':
      return tr("This year");
    case 'best':
      return tr("Personal best");
    case 'fuel':
      return tr("Cheapest fuel near you");
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
