import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { History, BarChart3, Settings, Users, UserPlus, Play, Download, X } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats, seedDemoData } = useRideHistory();
  const { rideState } = useActiveRide();
  const { convoy } = useConvoyState();
  const { settings } = useSettings();
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Check if app can be installed
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem('install-banner-dismissed');
    if (!isStandalone && !dismissed) {
      setShowInstallBanner(true);
    }
  }, []);

  // Seed demo data on first load if no rides exist
  useEffect(() => {
    seedDemoData();
  }, [seedDemoData]);

  // Redirect to active ride if one exists
  useEffect(() => {
    if (rideState.isActive) {
      navigate('/ride');
    }
  }, [rideState.isActive, navigate]);

  // Redirect to lobby if in a convoy
  useEffect(() => {
    if (convoy.isActive) {
      navigate('/lobby');
    }
  }, [convoy.isActive, navigate]);

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('install-banner-dismissed', 'true');
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
      {/* Install Banner - hidden in landscape */}
      {showInstallBanner && (
        <div className="mb-3 bg-accent/10 border border-accent/20 rounded-xl p-2 flex items-center gap-2 animate-slide-up landscape-hidden">
          <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Download className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">Install Blacktop</p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/install')}
            className="flex-shrink-0 h-7 text-xs"
          >
            Install
          </Button>
          <button
            onClick={dismissInstallBanner}
            className="p-1 rounded-full hover:bg-secondary/50 flex-shrink-0"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Header - compact */}
      <header className="flex items-center justify-between mb-3 md:mb-4 animate-fade-in">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-0.5 landscape-hidden">Welcome back</p>
          <h1 className="text-xl md:text-2xl font-display font-semibold tracking-tight">{profile.name}</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-xl bg-secondary/50 hover:bg-secondary border border-border/30 transition-all duration-200 touch-target"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </header>

      {/* Main content - horizontal layout */}
      <div className="flex-1 flex flex-row gap-3 md:gap-4 min-h-0">
        {/* Quick Stats - side panel */}
        <div className="grid grid-cols-2 gap-2 w-40 md:w-48 flex-shrink-0 content-start">
          {[
            { label: 'Rides', value: stats.totalRides, unit: null },
            { label: 'Distance', value: formatDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
            { label: 'Top', value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) },
            { label: 'Time', value: formatDuration(stats.totalDuration), unit: null },
          ].map((stat, i) => (
            <div 
              key={stat.label}
              className="bg-card/50 backdrop-blur-sm rounded-xl p-2 md:p-3 border border-border/30 animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5">{stat.label}</p>
              <p className="text-base md:text-lg font-mono font-semibold tracking-tight">
                {stat.value}
                {stat.unit && <span className="text-[10px] text-muted-foreground/70 ml-0.5 font-normal">{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Convoy Buttons - main area */}
        <div className="flex-1 flex flex-col gap-2 md:gap-3 animate-slide-up delay-100">
          <button
            onClick={() => navigate('/create-convoy')}
            className="flex-1 min-h-[70px] bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
          >
            <div className="w-10 h-10 rounded-xl bg-accent-foreground/10 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-base font-semibold tracking-tight block">Start Convoy</span>
              <span className="text-[10px] opacity-70 landscape-hidden">Create a new ride group</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/join-convoy')}
            className="flex-1 min-h-[60px] bg-card/50 hover:bg-secondary border border-border/40 hover:border-border rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold tracking-tight block">Join Convoy</span>
              <span className="text-[10px] text-muted-foreground landscape-hidden">Enter a convoy code</span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Navigation - compact */}
      <nav className="flex justify-around mt-3 pt-2 border-t border-border/30 animate-slide-up delay-200">
        <button
          onClick={() => navigate('/demo')}
          className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-accent/10 text-accent transition-all duration-200 touch-target"
        >
          <Play className="w-5 h-5" />
          <span className="text-[10px] font-medium">Demo</span>
        </button>
        <button
          onClick={() => navigate('/history')}
          className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <History className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">History</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">Stats</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">Settings</span>
        </button>
      </nav>
    </div>
  );
}
