import { useEffect } from 'react';
import { ConvoyMemberInfo, calculateBadges, MemberBadge, BadgeType } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, User, X, Clock, Route, Gauge, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/hooks/useSettings';

interface RideStats {
  duration: number;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
}

interface RideSummaryProps {
  members: ConvoyMemberInfo[];
  currentUserId?: string;
  rideStats?: RideStats;
  onBadgeEarned?: (badge: BadgeType) => void;
  onClose: () => void;
}

export function RideSummary({ members, currentUserId, rideStats, onBadgeEarned, onClose }: RideSummaryProps) {
  const { settings } = useSettings();
  const badgesMap = calculateBadges(members);
  
  // Get all badge awards as flat list for display
  const badgeAwards: { member: ConvoyMemberInfo; badge: MemberBadge }[] = [];
  
  members.forEach(member => {
    const memberBadges = badgesMap.get(member.userId) || [];
    memberBadges.forEach(badge => {
      badgeAwards.push({ member, badge });
    });
  });

  // Sort by badge type priority: speed-demon, journeyman, rocksteady
  const badgeOrder = { 'speed-demon': 0, 'journeyman': 1, 'rocksteady': 2 };
  badgeAwards.sort((a, b) => badgeOrder[a.badge.type] - badgeOrder[b.badge.type]);

  // Report the current user's first earned badge (if any)
  useEffect(() => {
    if (currentUserId && onBadgeEarned) {
      const userBadges = badgesMap.get(currentUserId);
      if (userBadges && userBadges.length > 0) {
        onBadgeEarned(userBadges[0].type);
      }
    }
  }, [currentUserId, onBadgeEarned, badgesMap]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">Ride Complete</h2>
              <p className="text-sm text-muted-foreground">Summary</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Ride Stats */}
        {rideStats && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">{formatDuration(rideStats.duration)}</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <Route className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">
                {formatDistance(rideStats.distance, settings.distanceUnit)}
                <span className="text-xs text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
              </p>
              <p className="text-xs text-muted-foreground">Distance</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <Gauge className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">
                {formatSpeed(rideStats.averageSpeed, settings.speedUnit)}
                <span className="text-xs text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>
              </p>
              <p className="text-xs text-muted-foreground">Avg Speed</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <Zap className="w-5 h-5 mx-auto mb-1 text-accent" />
              <p className="font-mono text-lg font-bold text-accent">
                {formatSpeed(rideStats.maxSpeed, settings.speedUnit)}
                <span className="text-xs text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>
              </p>
              <p className="text-xs text-muted-foreground">Top Speed</p>
            </div>
          </div>
        )}

        {/* Badges Section */}
        {badgeAwards.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Badge Awards</h3>
            <div className="space-y-3">
              {badgeAwards.map(({ member, badge }, index) => (
                <div
                  key={`${member.userId}-${badge.type}`}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    badge.type === 'speed-demon' && "bg-yellow-500/10 border-yellow-500/30",
                    badge.type === 'journeyman' && "bg-blue-500/10 border-blue-500/30",
                    badge.type === 'rocksteady' && "bg-stone-500/10 border-stone-500/30"
                  )}
                >
                  {/* Badge icon */}
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-3xl flex-shrink-0",
                    badge.type === 'speed-demon' && "bg-yellow-500/20",
                    badge.type === 'journeyman' && "bg-blue-500/20",
                    badge.type === 'rocksteady' && "bg-stone-500/20"
                  )}>
                    {badge.emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-bold text-lg",
                      badge.type === 'speed-demon' && "text-yellow-400",
                      badge.type === 'journeyman' && "text-blue-400",
                      badge.type === 'rocksteady' && "text-stone-400"
                    )}>
                      {badge.label}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {member.isLeader ? (
                        <Crown className="w-4 h-4 text-accent" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                      <span className="truncate">{member.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!rideStats && badgeAwards.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No data to display.</p>
          </div>
        )}

        {/* Close button */}
        <Button
          onClick={onClose}
          className="w-full mt-6 h-12 text-base font-semibold"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
