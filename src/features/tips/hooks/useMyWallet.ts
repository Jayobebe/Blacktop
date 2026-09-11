import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'blacktop_my_wallet';

export interface MyWallet {
  nimAddress?: string;
  usdtAddress?: string;
}

let wallet: MyWallet = load();
const listeners = new Set<() => void>();

function load(): MyWallet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persist(next: MyWallet) {
  wallet = next;
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

export function useMyWallet() {
  const value = useSyncExternalStore(subscribe, () => wallet, () => wallet);

  const saveWallet = useCallback((next: MyWallet) => {
    persist({
      nimAddress: next.nimAddress || undefined,
      usdtAddress: next.usdtAddress || undefined,
    });
  }, []);

  const hasWallet = Boolean(value.nimAddress || value.usdtAddress);

  return { wallet: value, hasWallet, saveWallet };
}

export function burnMyWallet() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  persist({});
}
