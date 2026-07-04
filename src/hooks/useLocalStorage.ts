import { useState, useCallback, useEffect } from 'react';

const localStorageChangeEvent = 'bt-local-storage-change';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    const syncValue = () => {
      try {
        const item = window.localStorage.getItem(key);
        setStoredValue(item ? JSON.parse(item) : initialValue);
      } catch (error) {
        console.error(`Error syncing localStorage key "${key}":`, error);
      }
    };

    const handleCustomSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string }>).detail;
      if (detail?.key === key) syncValue();
    };

    const handleStorageSync = (event: StorageEvent) => {
      if (event.key === key) syncValue();
    };

    window.addEventListener(localStorageChangeEvent, handleCustomSync);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      window.removeEventListener(localStorageChangeEvent, handleCustomSync);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [key, initialValue]);

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        // Compute next value synchronously so we can persist immediately
        let prev: T = storedValue;
        try {
          const item = window.localStorage.getItem(key);
          prev = item ? JSON.parse(item) : storedValue;
        } catch {
          // ignore and fall back to in-memory value
        }

        const valueToStore = value instanceof Function ? value(prev) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        setStoredValue(valueToStore);
        window.dispatchEvent(new CustomEvent(localStorageChangeEvent, { detail: { key } }));
        return true;
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
        return false;
      }
    },
    [key, storedValue]
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
      window.dispatchEvent(new CustomEvent(localStorageChangeEvent, { detail: { key } }));
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue] as const;
}
