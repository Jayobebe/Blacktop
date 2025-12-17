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
      label: 'Convoy Rides',
      value: stats.convoyRides.toString(),
      unit: 'rides',
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
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-display font-bold">Statistics</h1>
      </header>

      {/* Badges Section */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-display font-semibold">Convoy Badges</h2>
          <span className="ml-auto text-sm text-muted-foreground">{totalBadges} earned</span>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {badgeCards.map((badge, index) => (
            <div
              key={badge.type}
              className={cn(
                "flex flex-col items-center p-4 rounded-xl border transition-all animate-slide-up",
                badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/30",
                badge.color === 'blue' && "bg-blue-500/10 border-blue-500/30",
                badge.color === 'stone' && "bg-stone-500/10 border-stone-500/30",
                badge.count === 0 && "opacity-50"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="text-3xl mb-2">{badge.emoji}</span>
              <span className={cn(
                "font-mono text-2xl font-bold",
                badge.color === 'yellow' && "text-yellow-400",
                badge.color === 'blue' && "text-blue-400",
                badge.color === 'stone' && "text-stone-400"
              )}>
                {badge.count}
              </span>
              <span className={cn(
                "text-xs font-medium text-center mt-1",
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

      {/* Stats Grid */}
      <div className="grid gap-3 animate-fade-in">
        {statCards.map((stat, index) => (
          <div
            key={stat.label}
            className="bg-card rounded-lg p-4 border border-border animate-slide-up"
            style={{ animationDelay: `${(index + 3) * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary rounded-lg">
                <stat.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="font-mono text-2xl font-bold">
                  {stat.value}
                  {stat.unit && (
                    <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center mt-8 px-4">
        All statistics are stored locally on your device
      </p>
    </div>
  );
}
