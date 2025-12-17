import { ConvoyMemberInfo, calculateBadges, MemberBadge } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RideSummaryProps {
  members: ConvoyMemberInfo[];
  onClose: () => void;
}

export function RideSummary({ members, onClose }: RideSummaryProps) {
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

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">Ride Complete</h2>
              <p className="text-sm text-muted-foreground">Badge Awards</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Badges */}
        {badgeAwards.length > 0 ? (
          <div className="space-y-4">
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
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No badges awarded this ride.</p>
            <p className="text-sm mt-1">Keep riding to earn achievements!</p>
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
