import { useCallback, useSyncExternalStore } from 'react';
import { NavigationApp, UserProfile } from '@/types/blacktop';

const PROFILE_KEY = 'blacktop_profile';

const defaultProfile: UserProfile = {
  name: '',
  createdAt: '',
  preferredNavApp: 'google',
};

type Listener = () => void;
const listeners = new Set<Listener>();

// useSyncExternalStore requires getSnapshot() to return the *same reference*
// when underlying data hasn't changed, otherwise React can get stuck in a rerender loop.
let cachedRaw: string | null = null;
let cachedProfile: UserProfile = defaultProfile;

function readProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);

    if (raw === cachedRaw) return cachedProfile;

    cachedRaw = raw;

    if (!raw) {
      cachedProfile = defaultProfile;
      return cachedProfile;
    }

    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    cachedProfile = {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      preferredNavApp:
        parsed.preferredNavApp === 'google' || parsed.preferredNavApp === 'waze' || parsed.preferredNavApp === 'apple'
          ? parsed.preferredNavApp
          : 'google',
    };

    return cachedProfile;
  } catch (e) {
    console.error('Failed to read profile:', e);
    cachedRaw = null;
    cachedProfile = defaultProfile;
    return cachedProfile;
  }
}

function writeProfile(profile: UserProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);

  // Keep multiple tabs in sync
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROFILE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useProfile() {
  const profile = useSyncExternalStore(subscribe, readProfile, () => defaultProfile);

  const createProfile = useCallback((name: string) => {
    const next: UserProfile = {
      name: name.trim(),
      createdAt: new Date().toISOString(),
      preferredNavApp: 'google',
    };
    writeProfile(next);
    emitChange();
  }, []);

  const updateNavApp = useCallback((app: NavigationApp) => {
    const next: UserProfile = { ...profile, preferredNavApp: app };
    writeProfile(next);
    emitChange();
  }, [profile]);

  const hasProfile = profile.name.trim().length > 0;

  return {
    profile,
    hasProfile,
    createProfile,
    updateNavApp,
  };
}

