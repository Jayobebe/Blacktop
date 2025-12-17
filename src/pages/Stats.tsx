import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettings } from '@/hooks/useSettings';
import { ArrowLeft, Route, Gauge, Clock, TrendingUp, Hash, Users, Trophy, Zap, Map, Mountain } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Stats() {
  const navigate = useNavigate();
  const { stats } = useRideHistory();
  const { settings } = useSettings();

  const statCards = [
    {
      icon: Hash,
      label: 'Total Rides',
      value: stats.totalRides.toString(),
      unit: 'rides',
    },
    {
      icon: Route,
      label: 'Total Distance',
      value: formatDistance(stats.totalDistance, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      icon: Clock,
      label: 'Total Time Riding',
      value: formatDuration(stats.totalDuration),
      unit: '',
    },
    {
      icon: TrendingUp,
      label: 'Personal Top Speed',
      value: formatSpeed(stats.personalTopSpeed, settings.speedUnit).toString(),
      unit: getSpeedLabel(settings.speedUnit),
    },
    {
      icon: Gauge,
      label: 'Average Ride Length',
      value: formatDistance(stats.averageRideLength, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      icon: Users,
      label: 'Total Convoys',
      value: stats.convoyRides.toString(),
      unit: 'convoys',
    },
  ];

  const badgeCards = [
    {
      type: 'speed-demon',
      emoji: '⚡',
      label: 'Speed Demon',
      description: 'Highest top speed in convoy',
      count: stats.badges.speedDemon,
      color: 'yellow',
    },
    {
      type: 'journeyman',
      emoji: '🛣️',
      label: 'Journeyman',
      description: 'Most distance covered',
      count: stats.badges.journeyman,
      color: 'blue',
    },
    {
      type: 'rocksteady',
      emoji: '🪨',
      label: 'Rocksteady',
      description: 'Longest time stationary',
      count: stats.badges.rocksteady,
      color: 'stone',
    },
  ];

  const totalBadges = stats.badges.speedDemon + stats.badges.journeyman + stats.badges.rocksteady;

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4 landscape:mb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <h1 className="text-xl landscape:text-lg font-display font-bold">Statistics</h1>
      </header>

      {/* Main content - scrollable in portrait, side-by-side in landscape */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-4 landscape:gap-3 min-h-0 overflow-hidden">
        {/* Badges Section */}
        <div className="landscape:flex-1 landscape:overflow-y-auto animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h2 className="text-sm landscape:text-xs font-display font-semibold">Convoy Badges</h2>
            <span className="ml-auto text-xs text-muted-foreground">{totalBadges} earned</span>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {badgeCards.map((badge, index) => (
              <div
                key={badge.type}
                className={cn(
                  "flex flex-col items-center p-3 landscape:p-2 rounded-xl border transition-all animate-slide-up",
                  badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/30",
                  badge.color === 'blue' && "bg-blue-500/10 border-blue-500/30",
                  badge.color === 'stone' && "bg-stone-500/10 border-stone-500/30",
                  badge.count === 0 && "opacity-50"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="text-2xl landscape:text-xl mb-1">{badge.emoji}</span>
                <span className={cn(
                  "font-mono text-xl landscape:text-lg font-bold",
                  badge.color === 'yellow' && "text-yellow-400",
                  badge.color === 'blue' && "text-blue-400",
                  badge.color === 'stone' && "text-stone-400"
                )}>
                  {badge.count}
                </span>
                <span className={cn(
                  "text-[10px] font-medium text-center mt-0.5",
                  badge.color === 'yellow' && "text-yellow-400",
                  badge.color === 'blue' && "text-blue-400",
                  badge.color === 'stone' && "text-stone-400"
                )}>
                  {badge.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Grid - scrollable */}
        <div className="flex-1 landscape:flex-1 overflow-y-auto min-h-0 pr-1">
          <div className="grid grid-cols-2 landscape:grid-cols-1 gap-2 animate-fade-in">
            {statCards.map((stat, index) => (
              <div
                key={stat.label}
                className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border animate-slide-up"
                style={{ animationDelay: `${(index + 3) * 50}ms` }}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-secondary rounded-lg flex-shrink-0">
                    <stat.icon className="w-4 h-4 landscape:w-3.5 landscape:h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">
                      {stat.label}
                    </p>
                    <p className="font-mono text-base landscape:text-sm font-bold truncate">
                      {stat.value}
                      {stat.unit && (
                        <span className="text-xs text-muted-foreground ml-1">{stat.unit}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground text-center mt-3 px-2 landscape:mt-2">
            All statistics are stored locally on your device
          </p>
        </div>
      </div>
    </div>
  );
}
