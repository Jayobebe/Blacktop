// Note: BlacktopMapOverlay (and its MapLibre dependency) is intentionally NOT
// re-exported here. It's loaded via React.lazy() directly from its file path
// in App.tsx so the heavy map chunk is only fetched once the map is opened.
export { openBlacktopMap, closeBlacktopMap, useMapOverlay } from './hooks/useMapOverlay';
export { useMapPresenceTracker, useMapPresentUserIds } from './hooks/useMapPresence';
export type { MapDestination } from './types';
