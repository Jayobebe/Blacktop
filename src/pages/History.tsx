import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Users, User, Clock, Route, Pencil, Trophy } from 'lucide-react';
import { formatDuration, formatDistance, formatDate, formatSpeed, getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function History() {
  const navigate = useNavigate();
  const { rides, updateRideName } = useRideHistory();
  const { settings } = useSettings();
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingRideId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingRideId]);

  const handleEditStart = (rideId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRideId(rideId);
    setEditedName(currentName);
  };

  const handleNameSave = (rideId: string) => {
    updateRideName(rideId, editedName);
    setEditingRideId(null);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent, rideId: string) => {
    if (e.key === 'Enter') {
      handleNameSave(rideId);
    } else if (e.key === 'Escape') {
      setEditingRideId(null);
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4 landscape:mb-3 flex-shrink-0 animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <div>
          <h1 className="text-2xl landscape:text-xl font-semibold tracking-tight">Ride History</h1>
          <p className="text-xs text-muted-foreground">{rides.length} rides recorded</p>
        </div>
      </header>

      {/* Rides List */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 landscape:space-y-2 pr-1">
        {rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 landscape:py-8 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-card/50 border border-border/30 flex items-center justify-center mb-4">
              <Route className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium">No rides yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Start your first ride to see it here</p>
          </div>
        ) : (
          rides.map((ride, index) => {
            const isLatest = index === 0;
            const displayName = ride.name || formatDate(ride.startedAt);
            const hasBadges = ride.earnedBadges && ride.earnedBadges.length > 0;
            return (
              <button
                key={ride.id}
                onClick={() => navigate(`/ride/${ride.id}`)}
                className={cn(
                  "w-full bg-card/50 border rounded-2xl p-4 landscape:p-3 text-left hover:bg-secondary/50 transition-all animate-slide-up touch-target",
                  isLatest 
                    ? "border-accent/40 shadow-[0_0_30px_-10px] shadow-accent/30" 
                    : "border-border/30"
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start justify-between mb-2 landscape:mb-1.5">
                  <div className="flex-1 min-w-0">
                    {editingRideId === ride.id ? (
                      <Input
                        ref={nameInputRef}
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={() => handleNameSave(ride.id)}
                        onKeyDown={(e) => handleNameKeyDown(e, ride.id)}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={30}
                        className="h-8 text-sm font-medium rounded-xl"
                        placeholder="Ride name"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{displayName}</p>
                        <button
                          onClick={(e) => handleEditStart(ride.id, ride.name || '', e)}
                          className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5 text-accent" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {ride.isConvoyRide ? (
                        <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-lg font-medium">
                          <Users className="w-2.5 h-2.5" />
                          Convoy
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-lg font-medium">
                          <User className="w-2.5 h-2.5" />
                          Solo
                        </span>
                      )}
                      {hasBadges && (
                        <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-lg font-medium">
                          <Trophy className="w-2.5 h-2.5" />
                          {ride.earnedBadges!.length}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(ride.duration)}
                      </span>
                      {isLatest && (
                        <span className="text-[10px] text-accent font-semibold">Latest</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="font-mono text-xl landscape:text-lg font-bold">{formatDistance(ride.distance, settings.distanceUnit)}</p>
                    <p className="text-[10px] text-muted-foreground">{getDistanceLabel(settings.distanceUnit)}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <span>Avg: {formatSpeed(ride.averageSpeed, settings.speedUnit)} {settings.speedUnit}</span>
                  <span>Max: {formatSpeed(ride.maxSpeed, settings.speedUnit)} {settings.speedUnit}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
