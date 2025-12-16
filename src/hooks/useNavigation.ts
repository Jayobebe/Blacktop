import { useCallback } from 'react';
import { NavigationApp } from '@/types/blacktop';
import { useProfile } from './useProfile';

export function useNavigation() {
  const { profile, updateNavApp } = useProfile();

  const openNavigation = useCallback((lat?: number, lng?: number, destination?: string) => {
    const app = profile.preferredNavApp;
    let url = '';

    if (lat && lng) {
      switch (app) {
        case 'google':
          url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
          break;
        case 'apple':
          url = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
          break;
        case 'waze':
          url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
          break;
      }
    } else if (destination) {
      switch (app) {
        case 'google':
          url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
          break;
        case 'apple':
          url = `maps://maps.apple.com/?q=${encodeURIComponent(destination)}`;
          break;
        case 'waze':
          url = `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
          break;
      }
    } else {
      // Just open the app
      switch (app) {
        case 'google':
          url = 'https://www.google.com/maps';
          break;
        case 'apple':
          url = 'maps://maps.apple.com/';
          break;
        case 'waze':
          url = 'https://waze.com/ul';
          break;
      }
    }

    if (url) {
      window.open(url, '_blank');
    }
  }, [profile.preferredNavApp]);

  return {
    preferredNavApp: profile.preferredNavApp,
    updateNavApp,
    openNavigation,
  };
}
