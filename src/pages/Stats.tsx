import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { ArrowLeft, Route, Gauge, Clock, TrendingUp, Hash, Users } from 'lucide-react';
import { formatDuration, formatDistance } from '@/lib/format';

export default function Stats() {
  const navigate = useNavigate();
  const { stats } = useRideHistory();

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
      value: formatDistance(stats.totalDistance),
      unit: 'miles',
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
      value: Math.round(stats.personalTopSpeed).toString(),
      unit: 'mph',
    },
    {
      icon: Gauge,
      label: 'Average Ride Length',
      value: formatDistance(stats.averageRideLength),
      unit: 'miles',
    },
    {
      icon: Users,
      label: 'Convoy Rides',
      value: stats.convoyRides.toString(),
      unit: 'rides',
    },
  ];

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

      {/* Stats Grid */}
      <div className="grid gap-3 animate-fade-in">
        {statCards.map((stat, index) => (
          <div
            key={stat.label}
            className="bg-card rounded-lg p-4 border border-border animate-slide-up"
            style={{ animationDelay: `${index * 50}ms` }}
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
