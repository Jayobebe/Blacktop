import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useConvoyState } from '@/hooks/useConvoyState';
import { Button } from '@/components/ui/button';
import { History, BarChart3, Settings, Users, UserPlus } from 'lucide-react';
import { formatDuration, formatDistance } from '@/lib/format';

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats, seedDemoData } = useRideHistory();
  const { rideState } = useActiveRide();
  const { convoy } = useConvoyState();

  // Seed demo data on first load if no rides exist
  useEffect(() => {
    seedDemoData();
  }, [seedDemoData]);

  // Redirect to active ride if one exists
  if (rideState.isActive) {
    navigate('/ride');
    return null;
  }

  // Redirect to lobby if in a convoy
  if (convoy.isActive) {
    navigate('/lobby');
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-muted-foreground text-sm uppercase tracking-wide">Welcome back</p>
          <h1 className="text-2xl font-display font-bold">{profile.name}</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <Settings className="w-6 h-6" />
        </button>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6 animate-slide-up">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Total Rides</p>
          <p className="text-2xl font-mono font-bold">{stats.totalRides}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
          <p className="text-2xl font-mono font-bold">{formatDistance(stats.totalDistance)}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Top Speed</p>
          <p className="text-2xl font-mono font-bold">{Math.round(stats.personalTopSpeed)}<span className="text-sm text-muted-foreground ml-1">mph</span></p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Time Riding</p>
          <p className="text-2xl font-mono font-bold">{formatDuration(stats.totalDuration)}</p>
        </div>
      </div>

      {/* Convoy Buttons */}
      <div className="flex-1 flex flex-col gap-4 animate-slide-up delay-100">
        <Button
          onClick={() => navigate('/create-convoy')}
          className="flex-1 h-auto min-h-[120px] text-xl font-display font-bold bg-accent hover:bg-accent/90 text-accent-foreground touch-target-lg"
        >
          <div className="flex flex-col items-center gap-2">
            <Users className="w-10 h-10" />
            <span>START CONVOY</span>
            <span className="text-xs font-normal opacity-80">Create a new convoy</span>
          </div>
        </Button>

        <Button
          onClick={() => navigate('/join-convoy')}
          variant="outline"
          className="flex-1 h-auto min-h-[100px] text-lg font-display font-semibold border-2 hover:bg-secondary touch-target-lg"
        >
          <div className="flex flex-col items-center gap-2">
            <UserPlus className="w-8 h-8" />
            <span>JOIN CONVOY</span>
            <span className="text-xs text-muted-foreground font-normal">Enter a convoy code</span>
          </div>
        </Button>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex justify-around mt-6 pt-4 border-t border-border animate-slide-up delay-200">
        <button
          onClick={() => navigate('/history')}
          className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-secondary transition-colors touch-target"
        >
          <History className="w-6 h-6" />
          <span className="text-xs text-muted-foreground">History</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-secondary transition-colors touch-target"
        >
          <BarChart3 className="w-6 h-6" />
          <span className="text-xs text-muted-foreground">Stats</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-secondary transition-colors touch-target"
        >
          <Settings className="w-6 h-6" />
          <span className="text-xs text-muted-foreground">Settings</span>
        </button>
      </nav>
    </div>
  );
}
