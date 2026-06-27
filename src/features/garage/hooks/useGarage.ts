import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Bike, BikePhotos, GarageState, GARAGE_STORAGE_KEY, MaintItem } from '../types';
import { useDemoMode, DEMO_BIKE, DEMO_BIKE_ID } from '@/lib/demoMode';

const DEFAULT_STATE: GarageState = { bikes: [], activeBikeId: null };

/** Migrate legacy 4-photo bikes to the single-hero schema. */
function migrateBike(b: Bike): Bike {
  const p = b.photos as unknown as Partial<BikePhotos> & {
    left?: string; right?: string; front?: string; back?: string;
  };
  if (p?.hero) return b;
  const hero = p?.right || p?.front || p?.left || p?.back || '';
  return { ...b, photos: { hero } };
}

export function useGarage() {
  const [state, setState, clear] = useLocalStorage<GarageState>(GARAGE_STORAGE_KEY, DEFAULT_STATE);
  const { enabled: demoEnabled } = useDemoMode();

  const bikes = useMemo(
    () => (demoEnabled ? [DEMO_BIKE] : state.bikes.map(migrateBike)),
    [state.bikes, demoEnabled],
  );
  const activeBikeId = demoEnabled ? DEMO_BIKE_ID : state.activeBikeId;
  const activeBike = bikes.find((b) => b.id === activeBikeId) || null;

  const addBike = useCallback(
    (input: { name: string; makeModel?: string; photos: BikePhotos; baseOdometerKm: number }) => {
      const id = crypto.randomUUID();
      const bike: Bike = {
        id,
        name: input.name.trim(),
        makeModel: input.makeModel?.trim() || undefined,
        photos: input.photos,
        baseOdometerKm: Math.max(0, input.baseOdometerKm || 0),
        createdAt: Date.now(),
        maintenance: [],
      };
      setState((s) => ({
        bikes: [...s.bikes, bike],
        activeBikeId: s.activeBikeId ?? id,
      }));
      return id;
    },
    [setState],
  );

  const updateBike = useCallback(
    (id: string, patch: Partial<Omit<Bike, 'id' | 'createdAt'>>) => {
      setState((s) => ({
        ...s,
        bikes: s.bikes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));
    },
    [setState],
  );

  const deleteBike = useCallback(
    (id: string) => {
      setState((s) => {
        const remaining = s.bikes.filter((b) => b.id !== id);
        return {
          bikes: remaining,
          activeBikeId:
            s.activeBikeId === id ? (remaining[0]?.id ?? null) : s.activeBikeId,
        };
      });
    },
    [setState],
  );

  const setActiveBike = useCallback(
    (id: string | null) => setState((s) => ({ ...s, activeBikeId: id })),
    [setState],
  );

  const addMaintItem = useCallback(
    (bikeId: string, item: Omit<MaintItem, 'id'>) => {
      setState((s) => ({
        ...s,
        bikes: s.bikes.map((b) =>
          b.id === bikeId
            ? { ...b, maintenance: [...b.maintenance, { ...item, id: crypto.randomUUID() }] }
            : b,
        ),
      }));
    },
    [setState],
  );

  const updateMaintItem = useCallback(
    (bikeId: string, itemId: string, patch: Partial<MaintItem>) => {
      setState((s) => ({
        ...s,
        bikes: s.bikes.map((b) =>
          b.id === bikeId
            ? {
                ...b,
                maintenance: b.maintenance.map((m) =>
                  m.id === itemId ? { ...m, ...patch } : m,
                ),
              }
            : b,
        ),
      }));
    },
    [setState],
  );

  const deleteMaintItem = useCallback(
    (bikeId: string, itemId: string) => {
      setState((s) => ({
        ...s,
        bikes: s.bikes.map((b) =>
          b.id === bikeId
            ? { ...b, maintenance: b.maintenance.filter((m) => m.id !== itemId) }
            : b,
        ),
      }));
    },
    [setState],
  );

  const burnGarage = useCallback(() => clear(), [clear]);

  return {
    bikes,
    activeBike,
    activeBikeId: state.activeBikeId,
    addBike,
    updateBike,
    deleteBike,
    setActiveBike,
    addMaintItem,
    updateMaintItem,
    deleteMaintItem,
    burnGarage,
  };
}

/** Read active bike id without subscribing (for non-React callsites e.g. endRide). */
export function getActiveBikeIdSnapshot(): string | null {
  try {
    const raw = localStorage.getItem(GARAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GarageState;
    return parsed?.activeBikeId ?? null;
  } catch {
    return null;
  }
}

/** Read a bike snapshot without subscribing. */
export function getBikeSnapshot(bikeId: string | null | undefined): Bike | null {
  if (!bikeId) return null;
  try {
    const raw = localStorage.getItem(GARAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GarageState;
    return parsed?.bikes?.find((b) => b.id === bikeId) ?? null;
  } catch {
    return null;
  }
}
