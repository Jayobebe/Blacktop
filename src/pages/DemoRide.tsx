import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, Navigation, Users, Crown, User, Gauge, Route, Play } from 'lucide-react';
import { formatDuration, formatDistance } from '@/lib/format';
import { cn } from '@/lib/utils';

// Member colors for visual distinction
const MEMBER_COLORS = [
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: 'ring-emerald-500/50' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500/50' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', ring: 'ring-purple-500/50' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', ring: 'ring-orange-500/50' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', ring: 'ring-pink-500/50' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', ring: 'ring-cyan-500/50' },
];

export default function DemoRide() {
  const navigate = useNavigate();
  const { demoState, startDemo, stopDemo } = useDemoMode();
  const [showMembers, setShowMembers] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  // Start demo on mount
  useEffect(() => {
    startDemo();
    return () => stopDemo();
  }, [startDemo, stopDemo]);

  const handleEndDemo = () => {
    stopDemo();
    navigate('/');
  };

  const getMemberColor = (index: number, isLeader: boolean) => {
    if (isLeader) return { bg: 'bg-accent/20', text: 'text-accent', ring: 'ring-accent/50' };
    return MEMBER_COLORS[(index - 1) % MEMBER_COLORS.length];
  };

  // Sort members by top speed (highest first)
  const sortedMembers = [...demoState.members].sort((a, b) => {
    return (b.topSpeed || 0) - (a.topSpeed || 0);
  });

  if (!demoState.isActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center animate-fade-in">
          <Play className="w-16 h-16 text-accent mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">Starting Demo</h1>
          <p className="text-muted-foreground">Loading simulation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background p-4 safe-top safe-bottom landscape-compact md:p-6 lg:p-8">
      {/* Demo Badge */}
      <div className="absolute top-4 left-4 z-10">
        <span className="px-3 py-1 bg-warning/20 text-warning text-xs font-bold uppercase rounded-full animate-pulse">
          Demo Mode
        </span>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6">
        {/* Left side - Speed and Stats */}
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4 md:mb-6">
            <span className="flex items-center gap-1 text-accent text-sm font-medium px-2 py-1 bg-accent/10 rounded">
              <Users className="w-4 h-4" />
              LEADER
            </span>
            <span className="text-muted-foreground text-sm">Ride Active</span>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2">Current Speed</p>
            <div className={cn(
              "font-mono text-7xl md:text-8xl lg:text-9xl font-bold transition-all",
              demoState.currentSpeed > 80 && "text-warning animate-speed-glow",
              demoState.currentSpeed > 100 && "text-destructive"
            )}>
              {demoState.currentSpeed}
            </div>
            <p className="text-muted-foreground text-lg">MPH</p>
          </div>

          {/* Stats Grid */}
          <div className="flex gap-6 md:gap-8 mt-6 md:mt-8">
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{formatDistance(demoState.distance)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Duration</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{formatDuration(demoState.duration)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{demoState.maxSpeed}</p>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-4 mt-6 md:mt-8">
            {/* Navigation button */}
            <Button
              variant="ghost"
              className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-secondary hover:bg-muted touch-target"
            >
              <Navigation className="w-6 h-6 md:w-7 md:h-7" />
            </Button>

            {/* Voice Toggle Button */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all touch-target-lg",
                  !isMuted
                    ? "bg-ptt-active scale-105 animate-ptt-pulse shadow-glow"
                    : "bg-ptt-inactive hover:bg-muted"
                )}
              >
                {isMuted ? (
                  <MicOff className="w-8 h-8 md:w-10 md:h-10 text-foreground" />
                ) : (
                  <Mic className="w-8 h-8 md:w-10 md:h-10 text-background" />
                )}
              </button>
              <p className={cn(
                "mt-2 text-xs md:text-sm font-medium transition-colors",
                !isMuted ? "text-accent" : "text-muted-foreground"
              )}>
                {isMuted ? "Muted" : "Live"}
              </p>
            </div>

            {/* Toggle members panel button */}
            <Button
              variant="ghost"
              onClick={() => setShowMembers(!showMembers)}
              className={cn(
                "h-14 w-14 md:h-16 md:w-16 rounded-full touch-target",
                showMembers ? "bg-accent/20 text-accent" : "bg-secondary hover:bg-muted"
              )}
            >
              <Users className="w-6 h-6 md:w-7 md:h-7" />
            </Button>
          </div>
        </div>

        {/* Right side - Convoy Members Panel */}
        {showMembers && (
          <div className="lg:w-80 animate-slide-up">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Convoy ({demoState.members.length})
                <span className="ml-auto text-xs text-accent font-normal">Sorted by Top Speed</span>
              </h3>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sortedMembers.map((member, index) => {
                  const color = getMemberColor(index, member.isLeader);
                  const isSpeaking = demoState.speakingUsers.has(member.userId);
                  
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border transition-all",
                        color.bg,
                        isSpeaking ? `ring-2 ${color.ring} border-transparent` : "border-border/50"
                      )}
                    >
                      {/* Position badge */}
                      <div className="w-6 text-center flex-shrink-0">
                        <span className={cn(
                          "text-xs font-bold",
                          index === 0 ? "text-yellow-400" : 
                          index === 1 ? "text-gray-300" :
                          index === 2 ? "text-amber-600" : "text-muted-foreground"
                        )}>
                          #{index + 1}
                        </span>
                      </div>

                      {/* Avatar with speaking glow */}
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                        color.bg,
                        isSpeaking && "shadow-[0_0_12px_4px] shadow-accent/60 scale-110"
                      )}>
                        {member.isLeader ? (
                          <Crown className={cn("w-5 h-5", color.text)} />
                        ) : (
                          <User className={cn("w-5 h-5", color.text)} />
                        )}
                      </div>
                      
                      {/* Name and stats */}
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-sm truncate", color.text)}>
                          {member.name}
                          {isSpeaking && <span className="ml-1 text-xs opacity-75">🎤</span>}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            {member.currentSpeed || 0} mph
                          </span>
                          <span className="flex items-center gap-1">
                            <Route className="w-3 h-3" />
                            {formatDistance(member.distanceDriven || 0)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Top speed badge */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">Top</p>
                        <p className={cn("font-mono text-sm font-bold", color.text)}>
                          {member.topSpeed || 0}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* End Demo Button */}
      <div className="mt-4 md:mt-0 md:absolute md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-auto animate-slide-up delay-100">
        <Button
          onClick={handleEndDemo}
          variant="outline"
          className="w-full md:w-auto md:min-w-[200px] h-12 md:h-14 text-base md:text-lg font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
        >
          <Square className="w-4 h-4 md:w-5 md:h-5 mr-2" />
          END DEMO
        </Button>
      </div>
    </div>
  );
}
