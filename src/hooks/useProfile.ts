import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { UserProfile, NavigationApp } from '@/types/blacktop';

const PROFILE_KEY = 'blacktop_profile';

const defaultProfile: UserProfile = {
  name: '',
  createdAt: '',
  preferredNavApp: 'google',
};

export function useProfile() {
  const [profile, setProfile] = useLocalStorage<UserProfile>(PROFILE_KEY, defaultProfile);

  const createProfile = useCallback((name: string) => {
    setProfile({
      name,
      createdAt: new Date().toISOString(),
      preferredNavApp: 'google',
    });
  }, [setProfile]);

  const updateNavApp = useCallback((app: NavigationApp) => {
    setProfile(prev => ({ ...prev, preferredNavApp: app }));
  }, [setProfile]);

  const hasProfile = profile.name !== '';

  return {
    profile,
    hasProfile,
    createProfile,
    updateNavApp,
  };
}
