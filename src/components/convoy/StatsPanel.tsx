import { Gauge, Route, Clock, TrendingUp, User, Users } from 'lucide-react';
import { ConvoyStats } from '@/types/convoy';
import { cn } from '@/lib/utils';

interface StatsPanelProps {
  stats: ConvoyStats;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="glass rounded-2xl p-4 animate-slide-up delay-300">
      <h2 className="font-display text-sm font-semibold text-muted-foreground mb-4 tracking-wider uppercase">
        Trip Statistics
      </h2>
      
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Route className="w-4 h-4" />}
          label="Group Distance"
          value={`${stats.groupDistance.toFixed(1)}`}
          unit="mi"
          iconColor="text-primary"
          type="group"
        />
        <StatCard
          icon={<Gauge className="w-4 h-4" />}
          label="Group Top Speed"
          value={`${stats.groupTopSpeed}`}
          unit="mph"
          iconColor="text-destructive"
          type="group"
        />
        <StatCard
          icon={<Route className="w-4 h-4" />}
          label="Your Distance"
          value={`${stats.personalDistance.toFixed(1)}`}
          unit="mi"
          iconColor="text-accent"
          type="personal"
        />
        <StatCard
          icon={<Gauge className="w-4 h-4" />}
          label="Your Top Speed"
          value={`${stats.personalTopSpeed}`}
          unit="mph"
          iconColor="text-warning"
          type="personal"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Avg Speed"
          value={`${stats.averageSpeed}`}
          unit="mph"
          iconColor="text-primary"
          type="neutral"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Trip Duration"
          value={formatDuration(stats.tripDuration)}
          unit=""
          iconColor="text-muted-foreground"
          type="neutral"
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  iconColor: string;
  type: 'group' | 'personal' | 'neutral';
}

function StatCard({ icon, label, value, unit, iconColor, type }: StatCardProps) {
  return (
    <div className="bg-secondary/30 rounded-xl p-3 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-1.5 rounded-lg bg-background/50", iconColor)}>
          {icon}
        </div>
        {type === 'group' && <Users className="w-3 h-3 text-muted-foreground" />}
        {type === 'personal' && <User className="w-3 h-3 text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-xl font-bold animate-count-up">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
