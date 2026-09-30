/**
 * Thermal / High-Speed Mode (Settings → Your Blacktop): everything that costs
 * heat or battery goes. App.tsx puts the `thermal` class on <html> from the
 * setting; CSS (index.css) then kills every animation and transition, frost,
 * gradients and shadows and draws the UI as black-and-white outlines, and the
 * JS side checks isThermal(): no WebGL backdrop, no globe or scene animation,
 * maps at 1x.
 */
export function isThermal(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('thermal');
}

/** Read before the app has rendered (maps created early), straight from storage. */
export function thermalSetting(): boolean {
  try {
    return JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}')?.thermalMode === true;
  } catch {
    return false;
  }
}
