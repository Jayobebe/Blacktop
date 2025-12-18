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
import { cn } from '@/lib/utils';

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useRideHistory();
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
      {/* Install Banner */}
      {showInstallBanner && (
        <div className="mb-3 bg-accent/10 border border-accent/20 rounded-2xl p-3 flex items-center gap-3 animate-slide-down landscape:hidden">
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
            className="flex-shrink-0 h-8 text-xs px-3 rounded-xl"
          >
            Install
          </Button>
          <button
            onClick={dismissInstallBanner}
            className="p-1.5 rounded-full hover:bg-secondary/50 flex-shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between mb-4 landscape:mb-2 animate-fade-in">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5 landscape:hidden">
            Welcome back
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{profile.name}</h1>
        </div>
        <BTLogo size="md" />
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-4 landscape:gap-3 min-h-0 overflow-hidden">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 landscape:grid-cols-2 gap-2 landscape:w-40 md:landscape:w-48 flex-shrink-0 landscape:content-start">
          {[
            { label: 'Rides', value: stats.totalRides, unit: null },
            { label: 'Distance', value: formatDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
            { label: 'Top Speed', value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) },
            { label: 'Time', value: formatDuration(stats.totalDuration), unit: null },
          ].map((stat, i) => (
            <div 
              key={stat.label}
              className="bg-card/50 rounded-2xl p-2 md:p-3 border border-border/30 animate-scale-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">{stat.label}</p>
              <p className="text-base md:text-lg font-mono font-bold tracking-tighter leading-tight">
                {stat.value}
                {stat.unit && <span className="text-[10px] md:text-xs text-muted-foreground/70 ml-0.5 font-normal">{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Convoy Buttons */}
        <div className="flex-1 flex flex-col gap-3 animate-slide-up delay-200">
          <button
            onClick={() => navigate('/create-convoy')}
            className="flex-1 min-h-[72px] landscape:min-h-0 bg-transparent border-[3px] border-accent text-accent hover:bg-accent/10 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
          >
            <div className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Users className="w-6 h-6 landscape:w-5 landscape:h-5 text-accent" />
            </div>
            <div className="text-left">
              <span className="text-lg font-semibold tracking-tight block text-accent">Start Convoy</span>
              <span className="text-xs text-accent/70 landscape:hidden">Create a new ride group</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/join-convoy')}
            className="flex-1 min-h-[64px] landscape:min-h-0 bg-card/50 hover:bg-secondary border border-border/30 hover:border-border rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-secondary flex items-center justify-center">
              <UserPlus className="w-5 h-5 landscape:w-4 landscape:h-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="text-base font-semibold tracking-tight block">Join Convoy</span>
              <span className="text-xs text-muted-foreground landscape:hidden">Enter a convoy code</span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex justify-around mt-4 pt-3 border-t border-border/30 animate-slide-up delay-300">
        {[
          { icon: Play, label: 'Demo', path: '/demo', active: true },
          { icon: History, label: 'History', path: '/history', active: false },
          { icon: BarChart3, label: 'Stats', path: '/stats', active: false },
          { icon: Settings, label: 'Settings', path: '/settings', active: false },
        ].map(({ icon: Icon, label, path, active }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 touch-target",
              active 
                ? "text-accent hover:bg-accent/10" 
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
