import { paymentsAvailable } from '@/lib/platform';
import { NativeBackButton } from '@/components/NativeBackButton';
import { installMotionRegrant } from '@/lib/motionPermission';
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import { PushBridge } from "@/features/notifications";
import { CrewStatsPublisher } from "@/features/crew/CrewStatsPublisher";
import { MaintenanceNotifier } from "@/features/garage";
import { EnterpriseSync } from "@/features/enterprise";
import { useProfile } from "@/features/profile";
import { useSettings } from "@/features/settings";
import { burnExpiredTrips, useRideSpeed } from "@/features/ride";
import { useMapOverlay, useMapPresenceTracker } from "@/features/map";
import { RadioOverlay, PlayerProvider, FloatingRadioLayer } from "@/features/radio";

import { OrientationProvider } from "@/hooks/useOrientationLock";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppBootSkeleton } from "@/components/skeletons";
import { AppBackdrop } from "@/components/AppBackdrop";
import { PullToRefresh } from "@/components/PullToRefresh";
import { setBackdropCruise, surgeBackdrop } from "@/lib/backdropMotion";
import { MapLoading } from "@/components/MapLoading";
import { HazardAlerts } from "@/features/hazards";
import { AlarmOverlay, PatternGateDialog } from "@/features/alarm";
import { UiSounds } from "@/components/UiSounds";
import { AutoRescueConsentDialog } from "@/features/rescue";
import { BurnReveal } from "@/components/BurnFlameOverlay";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import CreateConvoy from "./pages/CreateConvoy";
import JoinConvoy from "./pages/JoinConvoy";
import Lobby from "./pages/Lobby";
import SoloLobby from "./pages/SoloLobby";
import ActiveRide from "./pages/ActiveRide";
import PillionRide from "./pages/PillionRide";
import { installDemoGuard } from '@/lib/demoGuard';

// Demo mode never writes to the server (lib/demoGuard).
installDemoGuard();
// iOS forgets motion access when the app closes: the first tap re-grants it.
installMotionRegrant();


const queryClient = new QueryClient();

// Screens off the ride-critical path load on demand, then get prefetched once
// the app is idle so they still open instantly (and offline) later.
const pageLoaders: Array<() => Promise<unknown>> = [];
function lazyPage<T extends React.ComponentType>(load: () => Promise<{ default: T }>) {
  pageLoaders.push(load);
  return lazy(load);
}
function prefetchPages() {
  const run = () => pageLoaders.forEach((load) => void load().catch(() => {}));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}
const Track = lazyPage(() => import("./pages/Track"));
const DemoShowcase = lazyPage(() => import("./pages/DemoShowcase"));
const History = lazyPage(() => import("./pages/History"));
const RideDetail = lazyPage(() => import("./pages/RideDetail"));
const Garage = lazyPage(() => import("./pages/Garage"));
const Stats = lazyPage(() => import("./pages/Stats"));
const Settings = lazyPage(() => import("./pages/Settings"));
const RescueLocation = lazyPage(() => import("./pages/RescueLocation"));
const Speedshop = lazyPage(() => import("./pages/Speedshop"));
const Install = lazyPage(() => import("./pages/Install"));
const PrivacyPolicy = lazyPage(() => import("./pages/PrivacyPolicy"));
const Terms = lazyPage(() => import("./pages/Terms"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
const Pay = lazyPage(() => import("./pages/Pay"));
function JoinLink() {
  const { search } = useLocation();
  return <Navigate to={`/join-convoy${search}`} replace />;
}
const DeviceCheck = lazyPage(() => import("./pages/DeviceCheck"));
const Setup = lazyPage(() => import("./pages/Setup"));
const EnterpriseLink = lazyPage(() => import("./pages/EnterpriseLink"));
const EnterpriseDemo = lazyPage(() => import("./pages/EnterpriseDemo"));
const World = lazyPage(() => import("./pages/World"));
const CrewConvoys = lazyPage(() => import("./pages/CrewConvoys"));
const CrewLeaderboard = lazyPage(() => import("./pages/CrewLeaderboard"));
const CrewJoin = lazyPage(() => import("./pages/CrewJoin"));
const CrewChallenges = lazyPage(() => import("./pages/CrewChallenges"));
const Arcade = lazyPage(() => import("./pages/Arcade"));
const ArcadeHitHeavy = lazyPage(() => import("./pages/ArcadeHitHeavy"));
const ArcadePetrolHead = lazyPage(() => import("./pages/ArcadePetrolHead"));
const ArcadeDerezLegacy = lazyPage(() => import("./pages/ArcadeDerezLegacy"));

// Lazy-loaded: MapLibre is heavy, so it isn't part of the first load.
// Prefetched at idle like the pages, so the map still opens with no signal.
const BlacktopMapOverlay = lazyPage(() =>
  import("@/features/map/components/BlacktopMapOverlay").then((m) => ({ default: m.BlacktopMapOverlay }))
);



/**
 * Replays an entrance animation whenever the path changes: slide in from the
 * right on push, from the left on back/forward, fade on replace. Enter-only
 * (no exit) so the outgoing page unmounts immediately and ride/voice hooks
 * never run twice.
 */
function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const animation = navType === "POP" ? "page-in-back" : navType === "REPLACE" ? "page-in-fade" : "page-in-forward";
  return (
    <div key={location.pathname} className={animation}>
      {children}
    </div>
  );
}

/**
 * Global backdrop. Tapping anything interactive nudges the wordmark belts;
 * arriving on a new page surges them, then they coast back to cruising speed.
 * While the map loads, the backdrop is the loading screen (in front of the
 * page, belts running fast) and pauses once the map has drawn. On the ride and
 * pillion screens it runs without the fish-eye lens (the lens is a CPU filter
 * redrawn every frame, too costly with the screen on all ride), and the belts
 * cruise faster past the amber speed threshold and faster again past red.
 * Pull-to-refresh lives here too since it drives the same backdrop.
 */
const CRUISE_MAP_LOADING = 6;
const CRUISE_AMBER = 3.5;
const CRUISE_RED = 7;
const RIDE_SCREENS = new Set(["/ride", "/pillion"]);

function BackdropHost({ mapOpen }: { mapOpen: boolean }) {
  const { pathname } = useLocation();
  const { ready: mapReady } = useMapOverlay();
  const rideState = useRideSpeed();
  const { settings } = useSettings();
  const mapLoading = mapOpen && !mapReady;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('a, button, [role="button"], [role="tab"], [role="menuitem"], .pressable')) surgeBackdrop(4);
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    surgeBackdrop(30);
  }, [pathname]);

  // Opening the map: a burst, then the loading cruise holds the speed until it has drawn.
  useEffect(() => {
    if (mapOpen) surgeBackdrop(30);
  }, [mapOpen]);

  const rideScreen = RIDE_SCREENS.has(pathname);
  const onRide = pathname === "/ride" && rideState.isActive && settings.speedFocusEnabled;
  const speed = rideState.currentSpeed;
  const cruise = mapLoading
    ? CRUISE_MAP_LOADING
    : onRide && speed >= settings.redSpeedThreshold
      ? CRUISE_RED
      : onRide && speed >= settings.amberSpeedThreshold
        ? CRUISE_AMBER
        : 1;
  useEffect(() => setBackdropCruise(cruise), [cruise]);

  const paused = mapOpen && mapReady;
  return (
    <>
      <AppBackdrop paused={paused} front={mapLoading} flat={rideScreen && !mapLoading} />
      <PullToRefresh disabled={mapOpen || pathname === "/ride"} />
    </>
  );
}

function AppRoutes() {
  const { hasProfile, isLoading } = useProfile();
  useSettings(); // Initialize accent color on app load

  // Burn trips: drop unstarred rides past the chosen window (no-op when off).
  useEffect(() => { burnExpiredTrips(); }, []);
  useEffect(() => { if (!isLoading) prefetchPages(); }, [isLoading]);

  // Skeleton of Home while checking auth/profile status
  if (isLoading) {
    return <AppBootSkeleton />;
  }

  if (!hasProfile) {
    return (
      <PageTransition>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/demo" element={<DemoShowcase />} />
        <Route path="/pay" element={paymentsAvailable() ? <Pay /> : <Navigate to="/" replace />} />
        <Route path="/device-check" element={<DeviceCheck />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/enterprise/demo/:tier" element={<EnterpriseDemo />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
      </Suspense>
      </PageTransition>
    );
  }

  return (
    <>
    {/* Background helpers for signed-in riders (render nothing). */}
    <CrewStatsPublisher />
    <MaintenanceNotifier />
    <EnterpriseSync />
    <PageTransition>
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create-convoy" element={<CreateConvoy />} />
      <Route path="/join-convoy" element={<JoinConvoy />} />
      {/* Shared join links: /join?code=ABC123 opens Join Convoy with the code in. */}
      <Route path="/join" element={<JoinLink />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/solo-lobby" element={<SoloLobby />} />
      <Route path="/ride" element={<ActiveRide />} />
      <Route path="/pillion" element={<PillionRide />} />
      <Route path="/track" element={<Track />} />
      <Route path="/rescue" element={<RescueLocation />} />
      <Route path="/speedshop" element={<Speedshop />} />
      <Route path="/demo" element={<DemoShowcase />} />
      <Route path="/pay" element={paymentsAvailable() ? <Pay /> : <Navigate to="/" replace />} />
      <Route path="/device-check" element={<DeviceCheck />} />
      <Route path="/history" element={<History />} />
      <Route path="/ride/:id" element={<RideDetail />} />
      
      <Route path="/world" element={<World />} />
      <Route path="/crew/convoys" element={<CrewConvoys />} />
      <Route path="/crew/leaderboard" element={<CrewLeaderboard />} />
      <Route path="/crew/join" element={<CrewJoin />} />
      <Route path="/crew/challenges" element={<CrewChallenges />} />
      <Route path="/arcade" element={<Arcade />} />
      <Route path="/arcade/hit-heavy" element={<ArcadeHitHeavy />} />
      <Route path="/arcade/petrol-head" element={<ArcadePetrolHead />} />
      <Route path="/arcade/derez-legacy" element={<ArcadeDerezLegacy />} />
      <Route path="/arcade/derez-legacy/:code" element={<ArcadeDerezLegacy />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/garage" element={<Garage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/install" element={<Install />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/enterprise" element={<EnterpriseLink />} />
      <Route path="/enterprise/demo/:tier" element={<EnterpriseDemo />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </PageTransition>
    </>
  );
}

const App = () => {
  const { isOpen } = useMapOverlay();
  useMapPresenceTracker();

  // Keep the overlay mounted once it's been opened so BlacktopMap retains
  // its MapLibre instance, cached tiles, and calculated route. Visibility
  // is toggled via CSS inside BlacktopMapOverlay instead of unmounting.
  const [hasEverOpened, setHasEverOpened] = useState(false);
  useEffect(() => { if (isOpen) setHasEverOpened(true); }, [isOpen]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <OrientationProvider>
          <PlayerProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <UiSounds />
              <AutoRescueConsentDialog />
              <PatternGateDialog />
              <BrowserRouter>
                <BackdropHost mapOpen={isOpen} />
                <NativeBackButton />
                <PushBridge />
                {/* Hazard warnings ahead + "still there?", on the ride screen or the map. */}
                <HazardAlerts />
                {/* Finishes the burn flames after the post-burn reload. */}
                <BurnReveal />
                <AppRoutes />
                {hasEverOpened && (
                  <Suspense fallback={<MapLoading />}>
                    <BlacktopMapOverlay />
                  </Suspense>
                )}
                <RadioOverlay />
                <FloatingRadioLayer />
                {/* Anti-theft lock: over everything, the map included, while armed. */}
                <AlarmOverlay />

              </BrowserRouter>
            </TooltipProvider>
          </PlayerProvider>
        </OrientationProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
