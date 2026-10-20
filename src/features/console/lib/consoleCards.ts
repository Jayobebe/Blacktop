/**
 * The Console's live cards, in the rider's order. Until the rider arranges
 * them the order follows the moment (`contextOrder`): just after a ride the
 * vehicle and where it's parked come first, in the morning the weather. Once
 * they've moved one, theirs is kept. Hidden cards stay hidden either way.
 * Kept on the phone (`blacktop_console_cards`, carried by backups, like the
 * quick actions).
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

export type ConsoleCardId = 'suggest' | 'weather' | 'pickup' | 'vehicle' | 'week' | 'crew' | 'hazards' | 'switchback';

export const CONSOLE_CARDS: ConsoleCardId[] = ['suggest', 'weather', 'pickup', 'vehicle', 'week', 'crew', 'hazards', 'switchback'];

export function cardName(id: ConsoleCardId): string {
  switch (id) {
    case 'suggest':
      return tr("Suggestion");
    case 'weather':
      return tr("Riding weather");
    case 'pickup':
      return tr("Pick up where you left off");
    case 'vehicle':
      return tr("Your vehicle");
    case 'week':
      return tr("Your week");
    case 'crew':
      return tr("Crew live");
    case 'hazards':
      return tr("Hazards near you");
    default:
      return "SwitchBack";
  }
}

interface Stored {
  /** The rider's own order (null: follow the moment). */
  order: ConsoleCardId[] | null;
  hidden: ConsoleCardId[];
}

const KEY = 'blacktop_console_cards';
const listeners = new Set<() => void>();

function read(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Stored> | null;
    const known = (a: unknown) => (Array.isArray(a) ? (a.filter((x) => CONSOLE_CARDS.includes(x as ConsoleCardId)) as ConsoleCardId[]) : []);
    return { order: v?.order ? known(v.order) : null, hidden: known(v?.hidden) };
  } catch {
    return { order: null, hidden: [] };
  }
}

let stored = read();

function commit(next: Stored) {
  stored = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

export function useConsoleCardPrefs(): Stored {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stored,
    () => stored,
  );
}

/** Every card in the rider's order (cards added since they arranged theirs go at the end). */
export function arranged(order: ConsoleCardId[] | null, context: ConsoleCardId[]): ConsoleCardId[] {
  const base = order ?? context;
  return [...base, ...CONSOLE_CARDS.filter((c) => !base.includes(c))];
}

export function setCardOrder(order: ConsoleCardId[]) {
  commit({ ...stored, order });
}

export function setCardHidden(id: ConsoleCardId, hide: boolean) {
  commit({ ...stored, hidden: hide ? Array.from(new Set([...stored.hidden, id])) : stored.hidden.filter((h) => h !== id) });
}

/** Back to the order that follows the moment, nothing hidden. */
export function resetCards() {
  commit({ order: null, hidden: [] });
}

/**
 * The order that suits now: after a ride (in the last three hours) the vehicle
 * and its parked spot lead; in the morning the weather; otherwise the
 * suggestion, then the weather.
 */
export function contextOrder(lastRideEnded: number | null, now = new Date()): ConsoleCardId[] {
  const order = [...CONSOLE_CARDS];
  const lead = (id: ConsoleCardId) => {
    order.splice(order.indexOf(id), 1);
    order.unshift(id);
  };
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) lead('weather');
  if (lastRideEnded && now.getTime() - lastRideEnded < 3 * 3600_000) lead('vehicle');
  return order;
}
