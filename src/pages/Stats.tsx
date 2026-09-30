import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { ArrowLeft, Route, Clock, TrendingUp, Hash, Users, Zap, Ruler } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { VehicleCardCarousel } from '@/features/cards';
import { BadgeWalletPanel } from '@/features/ride';
import { useExperience } from '@/features/experience';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';
import { PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';

export default function Stats() {
  const peaksHidden = usePeaksHidden();
  const navigate = useNavigate();
  const { stats } = useRideHistory();
  const { settings } = useSettings();
  const { terms, showGroup } = useExperience();

  // Only the numbers this rider said they care about.
  const statCards = [
    {
      icon: Hash,
      label: tr("Total {0}", [terms.Rides]),
      value: stats.totalRides.toString(),
      unit: terms.rides,
    },
    {
      icon: Route,
      label: tr("Total Distance"),
      value: formatDistance(stats.totalDistance, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      icon: Ruler,
      label: tr("Average {0}", [terms.Ride]),
      value: stats.totalRides > 0 ? formatDistance(stats.averageRideLength, settings.distanceUnit) : '—',
      unit: stats.totalRides > 0 ? getDistanceLabel(settings.distanceUnit) : '',
    },
    {
      icon: Clock,
      label: tr("Time on the Road"),
      value: formatDuration(stats.totalDuration),
      unit: '',
    },
    settings.speedFocusEnabled && {
      icon: TrendingUp,
      label: tr("Top Speed"),
      value: peaksHidden ? PEAK_HIDDEN : formatSpeed(stats.personalTopSpeed, settings.speedUnit).toString(),
      unit: peaksHidden ? '' : getSpeedLabel(settings.speedUnit),
    },
    showGroup && {
      icon: Users,
      label: tr("Convoy {0}", [terms.Rides]),
      value: stats.convoyRides.toString(),
      unit: 'convoys',
    },
    settings.gForceEnabled && {
      icon: Zap,
      label: tr("Max G-Force"),
      value: peaksHidden ? PEAK_HIDDEN : stats.personalMaxGForce > 0 ? stats.personalMaxGForce.toFixed(1) : '—',
      unit: !peaksHidden && stats.personalMaxGForce > 0 ? 'G' : '',
    },
  ].filter(Boolean) as { icon: typeof Hash; label: string; value: string; unit: string }[];

  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom overflow-y-auto">
      {/* Header */}
      <PageHeader title={tr("Statistics")} subtitle={tr("Your journey")} backTo="/" />

      {/* Main content */}
      <div className="flex flex-col landscape:flex-row gap-4 landscape:gap-3 landscape:flex-1 landscape:min-h-0">


        {/* Badges Section */}
        {settings.collectiblesEnabled && (
          <div className="landscape:flex-1 landscape:overflow-y-auto">
            <BadgeWalletPanel />
          </div>
        )}

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
            {settings.blacktopWorldEnabled
              ? tr("Stored on your device. Crew leaderboards only see the totals you publish.")
              : tr("All statistics stored locally on your device")}
          </p>

          {/* Vehicle trading cards — minted from garage vehicles, so they need both */}
          {settings.collectiblesEnabled && settings.garageEnabled && (
            <div className="mt-6 pb-2 animate-fade-in">
              <VehicleCardCarousel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
