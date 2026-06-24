import { useCallback } from 'react';
import { useProfile } from '@/features/profile';
import { openBlacktopMap } from '@/features/map';

function isIOSDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isAndroidDevice() {
  return /Android/.test(navigator.userAgent);
}

export function useNavigation() {
  const { profile, updateNavApp } = useProfile();

  const openNavigation = useCallback((lat?: number, lng?: number, destination?: string) => {
    const app = profile.preferredNavApp;

    if (app === 'blacktop') {
      openBlacktopMap(lat != null && lng != null ? { lat, lng, name: destination } : undefined);
      return;
    }

    const isIOS = isIOSDevice();
    const isAndroid = isAndroidDevice();

    const coords = (lat != null && lng != null) ? { lat, lng } : null;

    let url = '';

    if (coords) {
      const { lat: dLat, lng: dLng } = coords;
      // Encode destination name/address for search query fallback
      const query = destination ? encodeURIComponent(destination) : '';

      switch (app) {
        case 'google':
          if (isIOS) {
            // iOS: Use universal link which works whether app is installed or not
            url = `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`;
          } else if (isAndroid) {
            // Android: geo intent with coordinates
            url = `geo:${dLat},${dLng}?q=${dLat},${dLng}`;
          } else {
            url = `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`;
          }
          break;
        case 'apple':
          // Apple Maps works via universal links on all platforms
          url = `https://maps.apple.com/?daddr=${dLat},${dLng}&dirflg=d`;
          break;
        case 'waze':
          // Waze universal link works on all platforms
          url = `https://waze.com/ul?ll=${dLat},${dLng}&navigate=yes`;
          break;
      }
    } else if (destination) {
      const q = encodeURIComponent(destination);
      switch (app) {
        case 'google':
          url = `https://www.google.com/maps/search/?api=1&query=${q}`;
          break;
        case 'apple':
          url = `https://maps.apple.com/?q=${q}`;
          break;
        case 'waze':
          url = `https://waze.com/ul?q=${q}&navigate=yes`;
          break;
      }
    } else {
      // Just open the app with no destination
      switch (app) {
        case 'google':
          url = 'https://www.google.com/maps';
          break;
        case 'apple':
          url = 'https://maps.apple.com/';
          break;
        case 'waze':
          url = 'https://waze.com/ul';
          break;
      }
    }

    if (url) {
      // Use window.open for universal links - works reliably across platforms
      // and automatically opens the app if installed, or web otherwise
      window.open(url, '_blank');
    }
  }, [profile.preferredNavApp]);

  return {
    preferredNavApp: profile.preferredNavApp,
    updateNavApp,
    openNavigation,
  };
}
