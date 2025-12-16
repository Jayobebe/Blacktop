import { Crown, Volume2, VolumeX, Gauge } from 'lucide-react';
import { ConvoyMember } from '@/types/convoy';
import { cn } from '@/lib/utils';

interface MemberListProps {
  members: ConvoyMember[];
}

export function MemberList({ members }: MemberListProps) {
  const sortedMembers = [...members].sort((a, b) => {
    if (a.isLeader) return -1;
    if (b.isLeader) return 1;
    return 0;
  });

  return (
    <div className="glass rounded-2xl p-4 animate-slide-up delay-100">
      <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3 tracking-wider uppercase">
        Convoy Members
      </h2>
      <div className="space-y-2">
        {sortedMembers.map((member, index) => (
          <MemberCard key={member.id} member={member} index={index} />
        ))}
      </div>
    </div>
  );
}

function MemberCard({ member, index }: { member: ConvoyMember; index: number }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-xl transition-all duration-300",
        member.isSpeaking 
          ? "bg-accent/10 border border-accent/30 shadow-glow-accent" 
          : "bg-secondary/30 hover:bg-secondary/50"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm",
            member.isLeader 
              ? "bg-warning/20 text-warning" 
              : "bg-primary/20 text-primary"
          )}>
            {member.name.charAt(0)}
          </div>
          {member.isOnline && (
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
              member.isSpeaking ? "bg-accent animate-voice-pulse" : "bg-accent"
            )} />
          )}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{member.name}</span>
            {member.isLeader && (
              <Crown className="w-3.5 h-3.5 text-warning" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Gauge className="w-3 h-3" />
            <span className="font-mono">{member.currentSpeed} mph</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {member.isSpeaking ? (
          <div className="flex items-center gap-1.5 text-accent">
            <Volume2 className="w-4 h-4 animate-voice-pulse" />
            <div className="flex gap-0.5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-accent rounded-full animate-voice-pulse"
                  style={{
                    height: `${8 + Math.random() * 8}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <VolumeX className="w-4 h-4 text-muted-foreground/50" />
        )}
      </div>
    </div>
  );
}
