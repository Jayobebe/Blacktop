import type { NavigationApp } from '@/types/blacktop';
import { tr } from '@/lib/i18n';

/**
 * Hand-off to the rider's own navigation app (Settings → Navigation): the link
 * that opens Google Maps, Apple Maps or Waze with directions to a place. The
 * app opens if it's installed, its website otherwise. Blacktop keeps running
 * (convoy, voice, rescue) underneath.
 */
export type ExternalNavApp = Exclude<NavigationApp, 'blacktop'>;

export const navAppLabel = (app: ExternalNavApp): string =>
  app === 'google' ? tr("Google Maps") : app === 'apple' ? tr("Apple Maps") : tr("Waze");

export function navAppUrl(app: ExternalNavApp, lat?: number | null, lng?: number | null, name?: string | null): string {
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const ua = navigator.userAgent;
  if (hasCoords) {
    switch (app) {
      case 'google':
        // Android: the geo intent opens the Maps app; elsewhere the universal link.
        return /Android/.test(ua)
          ? `geo:${lat},${lng}?q=${lat},${lng}`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      case 'apple':
        return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
      case 'waze':
        return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    }
  }
  if (name) {
    const q = encodeURIComponent(name);
    switch (app) {
      case 'google':
        return `https://www.google.com/maps/search/?api=1&query=${q}`;
      case 'apple':
        return `https://maps.apple.com/?q=${q}`;
      case 'waze':
        return `https://waze.com/ul?q=${q}&navigate=yes`;
    }
  }
  return app === 'google' ? 'https://www.google.com/maps' : app === 'apple' ? 'https://maps.apple.com/' : 'https://waze.com/ul';
}

/** Opens the app (from a tap). */
export function openInNavApp(app: ExternalNavApp, lat?: number | null, lng?: number | null, name?: string | null) {
  window.open(navAppUrl(app, lat, lng, name), '_blank');
}
