import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import CreateConvoy from "./pages/CreateConvoy";
import JoinConvoy from "./pages/JoinConvoy";
import Lobby from "./pages/Lobby";
import ActiveRide from "./pages/ActiveRide";
import DemoRide from "./pages/DemoRide";
import History from "./pages/History";
import RideDetail from "./pages/RideDetail";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


function AppRoutes() {
  const { hasProfile } = useProfile();

  if (!hasProfile) {
    return (
      <Routes>
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
      <Route path="/ride" element={<ActiveRide />} />
      <Route path="/demo" element={<DemoRide />} />
      <Route path="/history" element={<History />} />
      <Route path="/ride/:id" element={<RideDetail />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/install" element={<Install />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
