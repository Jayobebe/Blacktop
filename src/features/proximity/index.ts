export { useProximity } from './hooks/useProximity';
export { useConvoyMergeSync, announceMergeToConvoy } from './hooks/useConvoyMergeSync';
export { HandshakeButton } from './components/HandshakeButton';
export { MergeBadge } from './components/MergeBadge';
export { useProximityState, getBlocked, clearBlocked } from './lib/proximityStore';
export { getMergeControls } from './lib/controls';
export type { ConvoyActions } from './lib/controls';
export { ALERT_RADIUS_M, VISIBLE_RADIUS_M } from './lib/geo';
export type { NearbyRider, NearbyParty, MergeRecord } from './types';
