import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { PushBridge } from "@/features/notifications";
import { CrewStatsPublisher } from "@/features/crew/CrewStatsPublisher";
import { MaintenanceNotifier } from "@/features/garage";
import { useProfile } from "@/features/profile";
import { useSettings } from "@/features/settings";
import { burnExpiredTrips } from "@/features/ride";
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
import { BurnReveal } from "@/components/BurnFlameOverlay";
import { useRideSpeed } from "@/features/ride";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import CreateConvoy from "./pages/CreateConvoy";
import JoinConvoy from "./pages/JoinConvoy";
import Lobby from "./pages/Lobby";
import SoloLobby from "./pages/SoloLobby";
import ActiveRide from "./pages/ActiveRide";
import PillionRide from "./pages/PillionRide";
import Track from "./pages/Track";
import DemoShowcase from "./pages/DemoShowcase";
import History from "./pages/History";
import RideDetail from "./pages/RideDetail";
import Garage from "./pages/Garage";

import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import RescueLocation from "./pages/RescueLocation";
import Speedshop from "./pages/Speedshop";
import Install from "./pages/Install";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import Pay from "./pages/Pay";
import Setup from "./pages/Setup";

const queryClient = new QueryClient();

// Lazy-loaded: MapLibre is heavy, so it's only fetched once the map is opened.
const BlacktopMapOverlay = lazy(() =>
  import("@/features/map/components/BlacktopMapOverlay").then((m) => ({ default: m.BlacktopMapOverlay }))
);

import World from "./pages/World";
import CrewConvoys from "./pages/CrewConvoys";
import CrewLeaderboard from "./pages/CrewLeaderboard";
import CrewJoin from "./pages/CrewJoin";
import CrewChallenges from "./pages/CrewChallenges";
import Arcade from "./pages/Arcade";
import ArcadeHitHeavy from "./pages/ArcadeHitHeavy";
import ArcadePetrolHead from "./pages/ArcadePetrolHead";
import ArcadeDerezLegacy from "./pages/ArcadeDerezLegacy";


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
 * page, belts running fast) and pauses once the map has drawn. On the ride
 * screen the belts speed up with you: faster past the amber speed threshold,
 * faster again past red (the same moments the speed turns yellow / red).
 * Pull-to-refresh lives here too since it drives the same backdrop.
 */
const CRUISE_MAP_LOADING = 6;
const CRUISE_AMBER = 3.5;
const CRUISE_RED = 7;

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
      <AppBackdrop paused={paused} front={mapLoading} />
      <PullToRefresh disabled={mapOpen || pathname === "/ride"} />
    </>
  );
}

function AppRoutes() {
  const { hasProfile, isLoading } = useProfile();
  useSettings(); // Initialize accent color on app load

  // Burn trips: drop unstarred rides past the chosen window (no-op when off).
  useEffect(() => { burnExpiredTrips(); }, []);

  // Skeleton of Home while checking auth/profile status
  if (isLoading) {
    return <AppBootSkeleton />;
  }

  if (!hasProfile) {
    return (
      <PageTransition>
      <Routes>
        <Route path="/demo" element={<DemoShowcase />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
      </PageTransition>
    );
  }

  return (
    <>
    {/* Background helpers for signed-in riders (render nothing). */}
    <CrewStatsPublisher />
    <MaintenanceNotifier />
    <PageTransition>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create-convoy" element={<CreateConvoy />} />
      <Route path="/join-convoy" element={<JoinConvoy />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/solo-lobby" element={<SoloLobby />} />
      <Route path="/ride" element={<ActiveRide />} />
      <Route path="/pillion" element={<PillionRide />} />
      <Route path="/track" element={<Track />} />
      <Route path="/rescue" element={<RescueLocation />} />
      <Route path="/speedshop" element={<Speedshop />} />
      <Route path="/demo" element={<DemoShowcase />} />
      <Route path="/pay" element={<Pay />} />
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
      <Route path="*" element={<NotFound />} />
    </Routes>
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
              <BrowserRouter>
                <BackdropHost mapOpen={isOpen} />
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

              </BrowserRouter>
            </TooltipProvider>
          </PlayerProvider>
        </OrientationProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
