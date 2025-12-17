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
    <div className="min-h-screen flex flex-col p-5 safe-top safe-bottom landscape-compact md:p-6 lg:p-8">
      {/* Install Banner */}
      {showInstallBanner && (
        <div className="mb-4 bg-accent/10 border border-accent/20 rounded-2xl p-3 flex items-center gap-3 animate-slide-up">
          <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Install Blacktop</p>
            <p className="text-xs text-muted-foreground">Add to home screen for the best experience</p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/install')}
            className="flex-shrink-0"
          >
            Install
          </Button>
          <button
            onClick={dismissInstallBanner}
            className="p-1 rounded-full hover:bg-secondary/50 flex-shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Welcome back</p>
          <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-tight">{profile.name}</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="p-3 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border/30 transition-all duration-200 touch-target"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>

      {/* Main content - horizontal layout on wider screens */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 lg:gap-6">
        {/* Quick Stats - side panel on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-3 animate-slide-up lg:w-72 lg:flex-shrink-0">
          {[
            { label: 'Total Rides', value: stats.totalRides, unit: null },
            { label: 'Distance', value: formatDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
            { label: 'Top Speed', value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) },
            { label: 'Time Riding', value: formatDuration(stats.totalDuration), unit: null },
          ].map((stat, i) => (
            <div 
              key={stat.label}
              className="bg-card/50 backdrop-blur-sm rounded-2xl p-4 border border-border/30 animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1.5">{stat.label}</p>
              <p className="text-2xl font-mono font-semibold tracking-tight">
                {stat.value}
                {stat.unit && <span className="text-sm text-muted-foreground/70 ml-1 font-normal">{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Convoy Buttons - main area */}
        <div className="flex-1 flex flex-col md:flex-row lg:flex-col gap-3 animate-slide-up delay-100">
          <button
            onClick={() => navigate('/create-convoy')}
            className="flex-1 min-h-[110px] md:min-h-[130px] bg-accent hover:bg-accent/90 text-accent-foreground rounded-3xl flex flex-col items-center justify-center gap-2 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
          >
            <div className="w-14 h-14 rounded-2xl bg-accent-foreground/10 flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Start Convoy</span>
            <span className="text-xs opacity-70 landscape-hidden">Create a new ride group</span>
          </button>

          <button
            onClick={() => navigate('/join-convoy')}
            className="flex-1 min-h-[90px] md:min-h-[110px] bg-card/50 hover:bg-secondary border border-border/40 hover:border-border rounded-3xl flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="text-base font-semibold tracking-tight">Join Convoy</span>
            <span className="text-xs text-muted-foreground landscape-hidden">Enter a convoy code</span>
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex justify-around mt-5 pt-4 border-t border-border/30 animate-slide-up delay-200 md:justify-center md:gap-6">
        <button
          onClick={() => navigate('/demo')}
          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-accent/10 text-accent transition-all duration-200 touch-target group"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium">Demo</span>
        </button>
        <button
          onClick={() => navigate('/history')}
          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-secondary/50 transition-all duration-200 touch-target group"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center group-hover:scale-105 transition-transform">
            <History className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">History</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-secondary/50 transition-all duration-200 touch-target group"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center group-hover:scale-105 transition-transform">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">Stats</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-secondary/50 transition-all duration-200 touch-target group"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Settings className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">Settings</span>
        </button>
      </nav>
    </div>
  );
}
