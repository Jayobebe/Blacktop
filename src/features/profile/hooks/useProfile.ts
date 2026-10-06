import { useSyncExternalStore } from 'react';
import { NavigationApp, UserProfile } from '@/types/blacktop';
import { supabase } from '@/integrations/supabase/client';
import { burnLocalDevice } from '@/lib/burnLocal';
import { User } from '@supabase/supabase-js';
import { displayNameSchema } from '@/lib/validation';
import { toast } from 'sonner';
import { useDemoMode, DEMO_NAME } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { demoBlocked } from '@/lib/demoGuard';

const PROFILE_KEY = 'blacktop_profile';

// Module-level so the cooldown survives the Burn button's own page
// navigation/remount - the only way to defeat a component-state guard would
// be to script around it, which is exactly what this is meant to prevent for
// the destructive burn-account routine.
const IDENTITY_RESET_COOLDOWN_MS = 3000;
let lastIdentityResetAt = 0;

const defaultProfile: UserProfile = {
  name: '',
  createdAt: '',
  preferredNavApp: 'google',
};

function readLocalProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile;

    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      preferredNavApp:
        parsed.preferredNavApp === 'google' ||
        parsed.preferredNavApp === 'waze' ||
        parsed.preferredNavApp === 'apple' ||
        parsed.preferredNavApp === 'blacktop'
          ? parsed.preferredNavApp
          : 'google',
    };
  } catch (e) {
    console.error('Failed to read profile:', e);
    return defaultProfile;
  }
}

function writeLocalProfile(profile: UserProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ── Store ────────────────────────────────────────────────────────────────
//
// One copy of the profile and auth state for the whole app. App.tsx gates
// onboarding vs. the app on it, so every screen has to see the same thing the
// moment it changes (a per-component copy left the gate on onboarding after
// the name step, because only the onboarding screen's copy learned about it).

interface ProfileState {
  profile: UserProfile;
  user: User | null;
  isLoading: boolean;
  /** The signed-in user has a profile row (or we're offline and trust the device). */
  isValidSession: boolean;
}

let state: ProfileState = {
  profile: readLocalProfile(),
  user: null,
  isLoading: true,
  isValidSession: false,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<ProfileState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

/** While createProfile runs, its own sign-in mustn't be judged before the row is written. */
let creating = false;
let validateSeq = 0;
let started = false;

async function validateProfile(userId: string) {
  const seq = ++validateSeq;
  let data: { display_name: string | null } | null = null;
  let failed = false;
  try {
    const res = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    data = res.data;
    failed = !!res.error;
    if (res.error) console.warn('[Profile] Could not check the profile:', res.error.message);
  } catch (e) {
    failed = true;
    console.warn('[Profile] Could not check the profile:', e);
  }
  // A newer check (or a profile being created) owns the result.
  if (seq !== validateSeq || creating) return;

  if (failed) {
    // Offline launch or a server blip: don't throw a rider back to onboarding.
    const local = readLocalProfile();
    setState({ profile: local, isValidSession: local.name.trim().length > 0, isLoading: false });
    return;
  }
  if (!data?.display_name) {
    // Signed in but no profile row: onboarding.
    window.localStorage.removeItem(PROFILE_KEY);
    setState({ profile: defaultProfile, isValidSession: false, isLoading: false });
    return;
  }
  const local = readLocalProfile();
  const profile = local.name !== data.display_name ? { ...local, name: data.display_name } : local;
  if (profile !== local) writeLocalProfile(profile);
  setState({ profile, isValidSession: true, isLoading: false });
}

function start() {
  if (started) return;
  started = true;

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    if (user?.id !== state.user?.id) setState({ user });
    if (creating) return;
    if (!user) {
      validateSeq++;
      setState({ isValidSession: false, isLoading: false });
    } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || !state.isValidSession) {
      // Token refreshes for a rider we've already checked don't need another round trip.
      setTimeout(() => void validateProfile(user.id), 0);
    }
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    const user = session?.user ?? null;
    if (creating) return;
    setState({ user });
    if (user) void validateProfile(user.id);
    else setState({ isValidSession: false, isLoading: false });
  });

  // Another tab changed the profile.
  window.addEventListener('storage', (e) => {
    if (e.key === PROFILE_KEY) setState({ profile: readLocalProfile() });
  });
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const getSnapshot = () => state;

// ── Actions ──────────────────────────────────────────────────────────────

async function createProfile(name: string): Promise<boolean> {
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) {
    toast.error(parsed.error.issues[0]?.message ?? tr("Invalid name"));
    return false;
  }
  const trimmedName = parsed.data;

  creating = true;
  try {
    // Sign in anonymously if not already authenticated
    let currentUser = state.user;
    if (!currentUser) {
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user ?? null;
    }
    if (!currentUser) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Failed to sign in anonymously:', error);
        toast.error(tr("Couldn't set you up. Blacktop needs a connection once, to create your anonymous ID: check yours and try again."));
        return false;
      }
      currentUser = data.user;
    }

    if (!currentUser) {
      toast.error(tr("Couldn't set you up — try again."));
      return false;
    }

    // Create/update profile in database
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: currentUser.id,
        display_name: trimmedName,
      });

    if (profileError) {
      console.error('Failed to create profile:', profileError);
      toast.error(tr("Couldn't save your profile — try again."));
      setState({ user: currentUser });
      return false;
    }

    // Save locally, and let every screen (including the onboarding gate) know.
    const next: UserProfile = {
      name: trimmedName,
      createdAt: new Date().toISOString(),
      preferredNavApp: state.profile.preferredNavApp,
    };
    writeLocalProfile(next);
    validateSeq++; // anything still in flight is stale now
    setState({ profile: next, user: currentUser, isValidSession: true, isLoading: false });
    return true;
  } finally {
    creating = false;
  }
}

function updateNavApp(app: NavigationApp) {
  const next: UserProfile = { ...state.profile, preferredNavApp: app };
  writeLocalProfile(next);
  setState({ profile: next });
}

async function updateName(name: string) {
  if (demoBlocked()) return false;
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) {
    toast.error(parsed.error.issues[0]?.message ?? tr("Invalid name"));
    return;
  }
  const trimmedName = parsed.data;
  if (trimmedName === state.profile.name) return;

  // Update in database if authenticated
  if (state.user) {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmedName })
      .eq('id', state.user.id);

    if (error) {
      console.error('Failed to update profile name:', error);
    }
  }

  // Update locally
  const next: UserProfile = { ...state.profile, name: trimmedName };
  writeLocalProfile(next);
  setState({ profile: next });
}

async function resetIdentity() {
  // A demo session must never burn the real account behind it.
  if (demoBlocked()) return false;
  const now = Date.now();
  if (now - lastIdentityResetAt < IDENTITY_RESET_COOLDOWN_MS) {
    console.warn('[Profile] resetIdentity throttled (cooldown active)');
    return;
  }
  lastIdentityResetAt = now;

  setState({ isLoading: true });
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { error } = await supabase.functions.invoke('burn-account');
      if (error) console.error('Server-side account deletion failed:', error);
    }
  } catch (e) {
    console.error('Server-side account deletion failed:', e);
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }

  // Everything else Blacktop kept on this device (saved places, crew,
  // settings, map position, offline maps, overlays…).
  await burnLocalDevice();
  window.localStorage.removeItem(PROFILE_KEY);
  validateSeq++;
  setState({ profile: defaultProfile, user: null, isValidSession: false, isLoading: false });
}

export function useProfile() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // hasProfile requires both local profile AND valid database session
  const hasProfile = s.profile.name.trim().length > 0 && s.isValidSession;

  const { enabled: demoEnabled } = useDemoMode();
  const effectiveProfile: UserProfile = demoEnabled
    ? { ...s.profile, name: DEMO_NAME }
    : s.profile;

  return {
    profile: effectiveProfile,
    hasProfile,
    isLoading: s.isLoading,
    user: s.user,
    createProfile,
    updateNavApp,
    updateName,
    resetIdentity,
  };
}
