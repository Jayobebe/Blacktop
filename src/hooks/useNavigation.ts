import { useCallback } from 'react';
import { useProfile } from '@/features/profile';
import { openBlacktopMap, openInNavApp } from '@/features/map';

export function useNavigation() {
  const { profile, updateNavApp } = useProfile();

  const openNavigation = useCallback((lat?: number, lng?: number, destination?: string) => {
    const app = profile.preferredNavApp;

    if (app === 'blacktop') {
      openBlacktopMap(lat != null && lng != null ? { lat, lng, name: destination } : undefined);
      return;
    }

    openInNavApp(app, lat, lng, destination);
  }, [profile.preferredNavApp]);

  return {
    preferredNavApp: profile.preferredNavApp,
    updateNavApp,
    openNavigation,
  };
}
