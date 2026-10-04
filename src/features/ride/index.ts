export { useActiveRide, useRideSpeed, attachRideToConvoy, subscribeRawFixes, setGpsHighRate, setActiveRidePaused, getActiveRideStatus } from './hooks/useActiveRide';
export type { RawFix } from './hooks/useActiveRide';
export { useRideHistory } from './hooks/useRideHistory';
export { keepPeakTelemetry, usePeaksHidden, PEAK_HIDDEN } from './lib/telemetryPrivacy';
export { burnExpiredTrips, burnedAggregate, readBurnedLog, BURNED_LOG_KEY, NO_BIKE, aggregateRides, mergeAggregates, emptyAggregate, BURNED_TOTALS_KEY } from './lib/tripBurner';
export type { BurnTripsInterval, BurnedAggregate, BurnedTotals } from './lib/tripBurner';
export { useCrashDetection } from './hooks/useCrashDetection';
export { RideSummary } from './components/RideSummary';
export { RidePhotos } from './components/RidePhotos';
export { CornerReportCard } from './components/CornerReportCard';
export { analyseCorners } from './lib/cornerScoring';
export type { Corner, CornerReport } from './lib/cornerScoring';
export { renderRecapCard, shareRecapCard } from './lib/recapCard';
export {
  useSoloRoute,
  setSoloRoute,
  clearSoloRoute,
  addSoloStop,
  removeSoloStopAt,
} from './lib/soloRoute';
export type { SoloStop, SoloRouteState } from './lib/soloRoute';


export { badgeWallet, recordBadges, spendBadgesForCopy, soloBadgesForRide, BADGES_PER_COPY } from './lib/badgeWallet';
export type { BadgeWallet } from './lib/badgeWallet';
export { BadgeWalletPanel } from './components/BadgeWalletPanel';
