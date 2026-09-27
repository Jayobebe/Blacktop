import { VEHICLE_ORDER, type VehicleType } from './vehicles';

/**
 * Experience profile — what the user told us in onboarding about how they
 * use Blacktop. Unlike the "do you care about…" answers (which live as
 * feature flags in AppSettings), these change the shape of the UI itself:
 * which tiles Home shows, the wording ("ride" vs "drive"), which gauges exist.
 */
export type { VehicleType } from './vehicles';
export type RideMode = 'solo' | 'group' | 'both';
export type RideStyle = 'commute' | 'fitness' | 'leisure' | 'performance' | 'social';

export interface ExperienceProfile {
  /** In the order picked; the first is the primary vehicle. */
  vehicles: VehicleType[];
  rideMode: RideMode;
  style: RideStyle | null;
  /** True once the user has been through the setup flow (onboarding or redo). */
  configured: boolean;
}

const STORAGE_KEY = 'blacktop-experience';

// Existing users who predate this flow get today's full UI.
export const DEFAULT_EXPERIENCE: ExperienceProfile = {
  vehicles: ['motorcycle'],
  rideMode: 'both',
  style: null,
  configured: false,
};

const STYLES: RideStyle[] = ['commute', 'fitness', 'leisure', 'performance', 'social'];

function read(): ExperienceProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXPERIENCE;
    const parsed = JSON.parse(raw) as Partial<ExperienceProfile> & { vehicle?: string };

    let vehicles = Array.isArray(parsed.vehicles)
      ? parsed.vehicles.filter((v): v is VehicleType => VEHICLE_ORDER.includes(v as VehicleType))
      : [];
    // v1 stored a single `vehicle`: 'motorcycle' | 'car' | 'both'.
    if (vehicles.length === 0 && parsed.vehicle) {
      vehicles = parsed.vehicle === 'both' ? ['motorcycle', 'car'] : parsed.vehicle === 'car' ? ['car'] : ['motorcycle'];
    }

    return {
      vehicles: vehicles.length > 0 ? vehicles : DEFAULT_EXPERIENCE.vehicles,
      rideMode: parsed.rideMode === 'solo' || parsed.rideMode === 'group' ? parsed.rideMode : 'both',
      style: STYLES.includes(parsed.style as RideStyle) ? (parsed.style as RideStyle) : null,
      configured: parsed.configured === true,
    };
  } catch {
    return DEFAULT_EXPERIENCE;
  }
}

let state: ExperienceProfile = typeof window === 'undefined' ? DEFAULT_EXPERIENCE : read();
const listeners = new Set<() => void>();

export function getExperience(): ExperienceProfile {
  return state;
}

export function setExperience(patch: Partial<ExperienceProfile>) {
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/blocked — keep the in-memory value for this session.
  }
  listeners.forEach((l) => l());
}

export function resetExperience() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  state = DEFAULT_EXPERIENCE;
  listeners.forEach((l) => l());
}

export function subscribeExperience(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = read();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
