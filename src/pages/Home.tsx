import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { History, BarChart3, Settings, Users, UserPlus, Play, Download, X } from 'lucide-react';
import { BTLogo } from '@/components/BTLogo';
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
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-3 safe-top safe-bottom md:p-4 lg:p-5">
      {/* Install Banner - hidden in landscape */}
      {showInstallBanner && (
        <div className="mb-2 bg-accent/10 border border-accent/20 rounded-lg p-1.5 flex items-center gap-2 animate-slide-up landscape:hidden">
          <div className="w-7 h-7 bg-accent/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Download className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium">Install Blacktop</p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/install')}
            className="flex-shrink-0 h-6 text-[10px] px-2"
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
      <header className="flex items-center justify-between mb-2 landscape:mb-1 animate-fade-in">
        <div>
          <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5 landscape:hidden">Welcome back</p>
          <h1 className="text-lg md:text-xl font-display font-semibold tracking-tight">{profile.name}</h1>
        </div>
        <BTLogo size="sm" />
      </header>

      {/* Main content - vertical in portrait, horizontal in landscape */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-2 md:gap-3 min-h-0 overflow-hidden">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 landscape:grid-cols-2 gap-1.5 landscape:w-36 md:landscape:w-44 flex-shrink-0 landscape:content-start">
          {[
            { label: 'Rides', value: stats.totalRides, unit: null },
            { label: 'Dist', value: formatDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
            { label: 'Top', value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) },
            { label: 'Time', value: formatDuration(stats.totalDuration), unit: null },
          ].map((stat, i) => (
            <div 
              key={stat.label}
              className="bg-card/50 backdrop-blur-sm rounded-lg p-1.5 md:p-2 border border-border/30 animate-slide-up overflow-hidden"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-muted-foreground text-[8px] uppercase tracking-widest mb-0.5 truncate">{stat.label}</p>
              <p className="text-xs md:text-sm font-mono font-semibold tracking-tight truncate">
                {stat.value}
                {stat.unit && <span className="text-[9px] text-muted-foreground/70 ml-0.5 font-normal">{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Convoy Buttons */}
        <div className="flex-1 flex flex-col gap-1.5 md:gap-2 animate-slide-up delay-100">
          <button
            onClick={() => navigate('/create-convoy')}
            className="flex-1 min-h-[56px] landscape:min-h-0 bg-transparent hover:bg-accent/10 border-2 border-accent text-accent rounded-xl flex items-center justify-center gap-2.5 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
          >
            <div className="w-8 h-8 landscape:w-7 landscape:h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Users className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold tracking-tight block">Start Convoy</span>
              <span className="text-[9px] opacity-70 landscape:hidden">Create a new ride group</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/join-convoy')}
            className="flex-1 min-h-[48px] landscape:min-h-0 bg-card/50 hover:bg-secondary border border-border/40 hover:border-border rounded-xl flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-7 h-7 landscape:w-6 landscape:h-6 rounded-lg bg-secondary flex items-center justify-center">
              <UserPlus className="w-3.5 h-3.5 landscape:w-3 landscape:h-3 text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold tracking-tight block">Join Convoy</span>
              <span className="text-[9px] text-muted-foreground landscape:hidden">Enter a convoy code</span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Navigation - compact */}
      <nav className="flex justify-around mt-2 pt-1.5 border-t border-border/30 animate-slide-up delay-200">
        <button
          onClick={() => navigate('/demo')}
          className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-accent/10 text-accent transition-all duration-200 touch-target"
        >
          <Play className="w-4 h-4" />
          <span className="text-[9px] font-medium">Demo</span>
        </button>
        <button
          onClick={() => navigate('/history')}
          className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground font-medium">History</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground font-medium">Stats</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-secondary/50 transition-all duration-200 touch-target"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground font-medium">Settings</span>
        </button>
      </nav>
    </div>
  );
}
