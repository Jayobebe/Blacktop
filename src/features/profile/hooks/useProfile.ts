import { useCallback, useEffect, useState } from 'react';
import { NavigationApp, UserProfile } from '@/types/blacktop';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { displayNameSchema } from '@/lib/validation';
import { toast } from 'sonner';

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
  const [isValidSession, setIsValidSession] = useState(false);

  // Initialize auth state and validate session
  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        
        // If session exists, verify profile exists in database
        if (session?.user) {
          setTimeout(() => {
            validateProfile(session.user.id);
          }, 0);
        } else {
          setIsValidSession(false);
          setIsLoading(false);
        }
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        validateProfile(session.user.id);
      } else {
        setIsValidSession(false);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Validate that the user has a profile in the database
  const validateProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data?.display_name) {
        // No valid profile in database - clear local storage and require onboarding
        window.localStorage.removeItem(PROFILE_KEY);
        setProfile(defaultProfile);
        setIsValidSession(false);
      } else {
        // Valid profile exists - sync local state
        const localProfile = readLocalProfile();
        if (localProfile.name !== data.display_name) {
          const updated = { ...localProfile, name: data.display_name };
          writeLocalProfile(updated);
          setProfile(updated);
        }
        setIsValidSession(true);
      }
    } catch (e) {
      console.error('Failed to validate profile:', e);
      setIsValidSession(false);
    }
    setIsLoading(false);
  };

  const resetIdentity = useCallback(async () => {
    setIsLoading(true);
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

    window.localStorage.removeItem(PROFILE_KEY);
    setProfile(defaultProfile);
    setUser(null);
    setIsValidSession(false);
    setIsLoading(false);
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
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    const trimmedName = parsed.data;

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
    setIsValidSession(true);
  }, [user, profile.preferredNavApp]);

  const updateNavApp = useCallback((app: NavigationApp) => {
    const next: UserProfile = { ...profile, preferredNavApp: app };
    writeLocalProfile(next);
    setProfile(next);
  }, [profile]);

  const updateName = useCallback(async (name: string) => {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    const trimmedName = parsed.data;
    if (trimmedName === profile.name) return;

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

  // hasProfile requires both local profile AND valid database session
  const hasProfile = profile.name.trim().length > 0 && isValidSession;

  return {
    profile,
    hasProfile,
    isLoading,
    user,
    createProfile,
    updateNavApp,
    updateName,
    resetIdentity,
  };
}
