import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { useRideHistory, useActiveRide } from '@/features/ride';
import { useConvoyState } from '@/features/convoy';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { History, BarChart3, Settings, Users, UserPlus, User, Play, Download, X, Wrench, Map as MapIcon } from 'lucide-react';
import { BTLogo } from '@/components/BTLogo';
import { EarthGlobe } from '@/components/EarthGlobe';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { PermissionsPrompt, usePermissionsPrompt } from '@/features/permissions/PermissionsPrompt';
import { openBlacktopMap } from '@/features/map';


export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useRideHistory();
  const { rideState } = useActiveRide();
  const { convoy } = useConvoyState();
  const { settings } = useSettings();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const { show: showPermsPrompt, dismiss: dismissPermsPrompt } = usePermissionsPrompt();

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
    if (!convoy.isRestoring && convoy.isActive) {
      navigate('/lobby');
    }
  }, [convoy.isActive, convoy.isRestoring, navigate]);

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('install-banner-dismissed', 'true');
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
      {showPermsPrompt && <PermissionsPrompt onComplete={dismissPermsPrompt} />}

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

        {/* Ride Buttons */}
        <div className="flex-1 flex flex-col gap-3 animate-slide-up delay-200 relative">
          {/* Start Buttons Row */}
          <div className="flex gap-3 flex-1">
            <button
              onClick={() => navigate('/create-convoy')}
              style={{
                WebkitMaskImage:
                  'radial-gradient(circle 40px at calc(100% + 6px) calc(100% + 6px), transparent 38px, black 40px)',
                maskImage:
                  'radial-gradient(circle 40px at calc(100% + 6px) calc(100% + 6px), transparent 38px, black 40px)',
              }}
              className="flex-1 bg-transparent border-[3px] border-accent text-accent hover:bg-accent/10 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
            >
              <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Users className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
              </div>
              <div className="text-left">
                <span className="text-base font-semibold tracking-tight block text-accent">Convoy</span>
                <span className="text-xs text-accent/70 landscape:hidden">Group ride</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/solo-lobby')}
              style={{
                WebkitMaskImage:
                  'radial-gradient(circle 40px at calc(0% - 6px) calc(100% + 6px), transparent 38px, black 40px)',
                maskImage:
                  'radial-gradient(circle 40px at calc(0% - 6px) calc(100% + 6px), transparent 38px, black 40px)',
              }}
              className="flex-1 bg-transparent border-[3px] border-accent text-accent hover:bg-accent/10 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
            >
              <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <User className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
              </div>
              <div className="text-left">
                <span className="text-base font-semibold tracking-tight block text-accent">Solo</span>
                <span className="text-xs text-accent/70 landscape:hidden">Ride alone</span>
              </div>
            </button>
          </div>

          <button
            onClick={() => navigate('/join-convoy')}
            style={{
              WebkitMaskImage:
                'radial-gradient(circle 40px at 50% -6px, transparent 38px, black 40px)',
              maskImage:
                'radial-gradient(circle 40px at 50% -6px, transparent 38px, black 40px)',
            }}
            className="flex-1 bg-card/50 hover:bg-secondary border border-border/30 hover:border-border rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-secondary flex items-center justify-center">
              <UserPlus className="w-5 h-5 landscape:w-4 landscape:h-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="text-base font-semibold tracking-tight block">Join Convoy</span>
              <span className="text-xs text-muted-foreground landscape:hidden">Enter a convoy code</span>
            </div>
          </button>

          {/* Rotating earth globe — sits at the junction of the 3 tiles */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <EarthGlobe size={64} />
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex justify-around mt-4 pt-3 border-t border-border/30 animate-slide-up delay-300">
        {[
          { icon: Play, label: 'Demo', onClick: () => navigate('/demo') },
          { icon: Wrench, label: 'Garage', onClick: () => navigate('/garage') },
          { icon: MapIcon, label: 'Maps', onClick: () => openBlacktopMap() },
          { icon: History, label: 'History', onClick: () => navigate('/history') },
          { icon: BarChart3, label: 'Stats', onClick: () => navigate('/stats') },
          { icon: Settings, label: 'Settings', onClick: () => navigate('/settings') },
        ].map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 touch-target text-accent hover:bg-accent/10"
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
