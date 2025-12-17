import { useCallback, useEffect, useState } from 'react';
import { NavigationApp, UserProfile } from '@/types/blacktop';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

const PROFILE_KEY = 'blacktop_profile';

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
        parsed.preferredNavApp === 'google' || parsed.preferredNavApp === 'waze' || parsed.preferredNavApp === 'apple'
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

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => readLocalProfile());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync local profile with state
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROFILE_KEY) {
        setProfile(readLocalProfile());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const createProfile = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Sign in anonymously if not already authenticated
    let currentUser = user;
    if (!currentUser) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Failed to sign in anonymously:', error);
        return;
      }
      currentUser = data.user;
      setUser(currentUser);
    }

    if (!currentUser) return;

    // Create/update profile in database
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: currentUser.id,
        display_name: trimmedName,
      });

    if (profileError) {
      console.error('Failed to create profile:', profileError);
    }

    // Save locally
    const next: UserProfile = {
      name: trimmedName,
      createdAt: new Date().toISOString(),
      preferredNavApp: profile.preferredNavApp,
    };
    writeLocalProfile(next);
    setProfile(next);
  }, [user, profile.preferredNavApp]);

  const updateNavApp = useCallback((app: NavigationApp) => {
    const next: UserProfile = { ...profile, preferredNavApp: app };
    writeLocalProfile(next);
    setProfile(next);
  }, [profile]);

  const updateName = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === profile.name) return;

    // Update in database if authenticated
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmedName })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to update profile name:', error);
      }
    }

    // Update locally
    const next: UserProfile = { ...profile, name: trimmedName };
    writeLocalProfile(next);
    setProfile(next);
  }, [user, profile]);

  const hasProfile = profile.name.trim().length > 0;

  return {
    profile,
    hasProfile,
    isLoading,
    user,
    createProfile,
    updateNavApp,
    updateName,
  };
}
