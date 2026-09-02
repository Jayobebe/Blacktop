import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { ArrowLeft, Route, Clock, TrendingUp, Hash, Users, Trophy, Zap } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { VehicleCardCarousel } from '@/features/cards';

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
      label: 'Time on the Road',
      value: formatDuration(stats.totalDuration),
      unit: '',
    },
    {
      icon: TrendingUp,
      label: 'Top Speed',
      value: formatSpeed(stats.personalTopSpeed, settings.speedUnit).toString(),
      unit: getSpeedLabel(settings.speedUnit),
    },
    {
      icon: Users,
      label: 'Convoy Rides',
      value: stats.convoyRides.toString(),
      unit: 'convoys',
    },
    {
      icon: Zap,
      label: 'Max G-Force',
      value: stats.personalMaxGForce > 0 ? stats.personalMaxGForce.toFixed(1) : '—',
      unit: stats.personalMaxGForce > 0 ? 'G' : '',
    },
  ];

  const badgeCards = [
    {
      type: 'speed-demon',
      emoji: '⚡',
      label: 'Speed Demon',
      description: 'Highest top speed',
      count: stats.badges.speedDemon,
      color: 'yellow',
    },
    {
      type: 'journeyman',
      emoji: '🛣️',
      label: 'Journeyman',
      description: 'Most distance',
      count: stats.badges.journeyman,
      color: 'blue',
    },
    {
      type: 'fallback',
      emoji: '🪨',
      label: 'Fallback',
      description: 'Longest stationary',
      count: stats.badges.fallback,
      color: 'stone',
    },
  ];

  const totalBadges = stats.badges.speedDemon + stats.badges.journeyman + stats.badges.fallback;

  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom overflow-y-auto">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4 landscape:mb-3 flex-shrink-0 animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <div>
          <h1 className="text-2xl landscape:text-xl font-semibold tracking-tight">Statistics</h1>
          <p className="text-xs text-muted-foreground">Your journey</p>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-col landscape:flex-row gap-4 landscape:gap-3 landscape:flex-1 landscape:min-h-0">


        {/* Badges Section */}
        <div className="landscape:flex-1 landscape:overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 landscape:mb-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Convoy Badges</h2>
            <span className="ml-auto text-xs text-muted-foreground">{totalBadges} earned</span>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {badgeCards.map((badge, index) => (
              <div
                key={badge.type}
                className={cn(
                  "flex flex-col items-center p-4 landscape:p-3 rounded-2xl border transition-all animate-scale-in",
                  badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/30",
                  badge.color === 'blue' && "bg-blue-500/10 border-blue-500/30",
                  badge.color === 'stone' && "bg-stone-500/10 border-stone-500/30",
                  badge.count === 0 && "opacity-50"
                )}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <span className="text-3xl landscape:text-2xl mb-2">{badge.emoji}</span>
                <span className={cn(
                  "font-mono text-2xl landscape:text-xl font-bold",
                  badge.color === 'yellow' && "text-yellow-400",
                  badge.color === 'blue' && "text-blue-400",
                  badge.color === 'stone' && "text-stone-400"
                )}>
                  {badge.count}
                </span>
                <span className={cn(
                  "text-[10px] font-medium text-center mt-1",
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
        <div className="landscape:flex-1 landscape:min-h-0 pr-1">



          <div className="flex flex-col gap-2">
            {statCards.map((stat, index) => (
              <div
                key={stat.label}
                className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up"
                style={{ animationDelay: `${(index + 3) * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-secondary/50 rounded-xl flex-shrink-0">
                    <stat.icon className="w-5 h-5 landscape:w-4 landscape:h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      {stat.label}
                    </p>
                    <p className="font-mono text-xl landscape:text-lg font-bold break-words">
                      {stat.value}
                      {stat.unit && (
                        <span className="text-xs text-muted-foreground ml-1 font-normal">{stat.unit}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground text-center mt-4 px-4 landscape:mt-3">
            All statistics stored locally on your device
          </p>

          {/* Vehicle trading cards */}
          <div className="mt-6 pb-2 animate-fade-in">
            <VehicleCardCarousel />
          </div>
        </div>
      </div>
    </div>
  );
}
