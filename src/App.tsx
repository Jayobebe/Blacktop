import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useProfile } from "@/features/profile";
import { useSettings } from "@/features/settings";
import { useMapOverlay, useMapPresenceTracker } from "@/features/map";
import { OrientationProvider } from "@/hooks/useOrientationLock";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import CreateConvoy from "./pages/CreateConvoy";
import JoinConvoy from "./pages/JoinConvoy";
import Lobby from "./pages/Lobby";
import SoloLobby from "./pages/SoloLobby";
import ActiveRide from "./pages/ActiveRide";
import DemoShowcase from "./pages/DemoShowcase";
import History from "./pages/History";
import RideDetail from "./pages/RideDetail";
import Garage from "./pages/Garage";

import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import Install from "./pages/Install";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Lazy-loaded: MapLibre is heavy, so it's only fetched once the map is opened.
const BlacktopMapOverlay = lazy(() =>
  import("@/features/map/components/BlacktopMapOverlay").then((m) => ({ default: m.BlacktopMapOverlay }))
);

import World from "./pages/World";


function AppRoutes() {
  const { hasProfile, isLoading } = useProfile();
  useSettings(); // Initialize accent color on app load

  // Show nothing while checking auth/profile status
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <Routes>
        <Route path="/demo" element={<DemoShowcase />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create-convoy" element={<CreateConvoy />} />
      <Route path="/join-convoy" element={<JoinConvoy />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/solo-lobby" element={<SoloLobby />} />
      <Route path="/ride" element={<ActiveRide />} />
      <Route path="/demo" element={<DemoShowcase />} />
      <Route path="/history" element={<History />} />
      <Route path="/ride/:id" element={<RideDetail />} />
      
      <Route path="/world" element={<World />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/garage" element={<Garage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/install" element={<Install />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  const { isOpen } = useMapOverlay();
  useMapPresenceTracker(); // Announce/track convoy members' Blacktop Maps presence app-wide.

  return (
    <QueryClientProvider client={queryClient}>
      <OrientationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
            {isOpen && (
              <Suspense fallback={null}>
                <BlacktopMapOverlay />
              </Suspense>
            )}
          </BrowserRouter>
        </TooltipProvider>
      </OrientationProvider>
    </QueryClientProvider>
  );
};

export default App;
