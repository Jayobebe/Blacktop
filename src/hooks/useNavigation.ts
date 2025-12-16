import { useCallback } from 'react';
import { useProfile } from './useProfile';

function isIOSDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isAndroidDevice() {
  return /Android/.test(navigator.userAgent);
}

function openUrl(primaryUrl: string, fallbackUrl?: string) {
  const isIOS = isIOSDevice();
  const isAndroid = isAndroidDevice();
  const isMobile = isIOS || isAndroid;

  // For deep links / schemes, prefer location.href
  const isHttp = primaryUrl.startsWith('http://') || primaryUrl.startsWith('https://');

  if (!isHttp || isMobile) {
    window.location.href = primaryUrl;
    if (fallbackUrl) {
      // If the app isn't installed, the deep link fails silently; fall back to web.
      window.setTimeout(() => {
        window.location.href = fallbackUrl;
      }, 800);
    }
    return;
  }

  window.open(primaryUrl, '_blank');
}

export function useNavigation() {
  const { profile, updateNavApp } = useProfile();

  const openNavigation = useCallback((lat?: number, lng?: number, destination?: string) => {
    const app = profile.preferredNavApp;

    const isIOS = isIOSDevice();
    const isAndroid = isAndroidDevice();

    const coords = (lat != null && lng != null) ? { lat, lng } : null;

    // Build primary (deep link) + fallback (web) URLs
    let primary = '';
    let fallback = '';

    if (coords) {
      const { lat: dLat, lng: dLng } = coords;

      switch (app) {
        case 'google':
          primary = isIOS
            ? `comgooglemaps://?daddr=${dLat},${dLng}&directionsmode=driving`
            : isAndroid
              ? `google.navigation:q=${dLat},${dLng}&mode=d`
              : `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`;
          fallback = `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`;
          break;
        case 'apple':
          // Apple Maps only exists on iOS; use web fallback elsewhere.
          primary = isIOS
            ? `maps://maps.apple.com/?daddr=${dLat},${dLng}&dirflg=d`
            : `https://maps.apple.com/?daddr=${dLat},${dLng}&dirflg=d`;
          fallback = `https://maps.apple.com/?daddr=${dLat},${dLng}&dirflg=d`;
          break;
        case 'waze':
          primary = (isIOS || isAndroid)
            ? `waze://?ll=${dLat},${dLng}&navigate=yes`
            : `https://waze.com/ul?ll=${dLat},${dLng}&navigate=yes`;
          fallback = `https://waze.com/ul?ll=${dLat},${dLng}&navigate=yes`;
          break;
      }
    } else if (destination) {
      const q = encodeURIComponent(destination);
      switch (app) {
        case 'google':
          primary = isIOS
            ? `comgooglemaps://?q=${q}`
            : isAndroid
              ? `geo:0,0?q=${q}`
              : `https://www.google.com/maps/search/?api=1&query=${q}`;
          fallback = `https://www.google.com/maps/search/?api=1&query=${q}`;
          break;
        case 'apple':
          primary = isIOS ? `maps://maps.apple.com/?q=${q}` : `https://maps.apple.com/?q=${q}`;
          fallback = `https://maps.apple.com/?q=${q}`;
          break;
        case 'waze':
          primary = (isIOS || isAndroid) ? `waze://?q=${q}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`;
          fallback = `https://waze.com/ul?q=${q}&navigate=yes`;
          break;
      }
    } else {
      switch (app) {
        case 'google':
          primary = isIOS ? 'comgooglemaps://' : isAndroid ? 'geo:0,0?q=' : 'https://www.google.com/maps';
          fallback = 'https://www.google.com/maps';
          break;
        case 'apple':
          primary = isIOS ? 'maps://maps.apple.com/' : 'https://maps.apple.com/';
          fallback = 'https://maps.apple.com/';
          break;
        case 'waze':
          primary = (isIOS || isAndroid) ? 'waze://' : 'https://waze.com/ul';
          fallback = 'https://waze.com/ul';
          break;
      }
    }

    if (primary) openUrl(primary, fallback || undefined);
  }, [profile.preferredNavApp]);

  return {
    preferredNavApp: profile.preferredNavApp,
    updateNavApp,
    openNavigation,
  };
}
