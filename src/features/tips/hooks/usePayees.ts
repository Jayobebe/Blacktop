import { useCallback, useSyncExternalStore } from 'react';
import type { Payee } from '../types';
import { DEVELOPER_PAYEE } from '../lib/nimiqPay';

const STORAGE_KEY = 'blacktop_nimiq_payees';

let payees: Payee[] = load();
const listeners = new Set<() => void>();

function load(): Payee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(next: Payee[]) {
  payees = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePayees() {
  const saved = useSyncExternalStore(subscribe, () => payees, () => payees);

  const addPayee = useCallback((payee: Omit<Payee, 'id'>) => {
    const entry: Payee = { ...payee, id: `payee_${Date.now().toString(36)}` };
    persist([...payees, entry]);
    return entry;
  }, []);

  const removePayee = useCallback((id: string) => {
    persist(payees.filter((p) => p.id !== id));
  }, []);

  return {
    payees: [DEVELOPER_PAYEE, ...saved],
    savedPayees: saved,
    addPayee,
    removePayee,
  };
}

export function burnPayees() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  persist([]);
}
