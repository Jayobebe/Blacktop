import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Users, Clock, MapPin, Pencil } from 'lucide-react';
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
      <header className="flex items-center gap-4 mb-4 landscape:mb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <h1 className="text-xl landscape:text-lg font-display font-bold">Ride History</h1>
      </header>

      {/* Rides List - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 landscape:space-y-1.5 animate-fade-in pr-1">
        {rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 landscape:py-6 text-center">
            <MapPin className="w-10 h-10 landscape:w-8 landscape:h-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No rides yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start your first ride to see it here</p>
          </div>
        ) : (
          rides.map((ride, index) => {
            const isLatest = index === 0;
            const displayName = ride.name || formatDate(ride.startedAt);
            
            return (
              <button
                key={ride.id}
                onClick={() => navigate(`/ride/${ride.id}`)}
                className={cn(
                  "w-full bg-card border rounded-lg p-3 landscape:p-2.5 text-left hover:bg-muted/50 transition-all animate-slide-up touch-target",
                  isLatest 
                    ? "border-accent/40 shadow-[0_0_20px_-5px] shadow-accent/30" 
                    : "border-border"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-1.5 landscape:mb-1">
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
                        className="h-7 text-sm font-medium"
                        placeholder="Ride name"
                      />
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <p className="font-medium text-sm truncate">{displayName}</p>
                        <button
                          onClick={(e) => handleEditStart(ride.id, ride.name || '', e)}
                          className="p-1 rounded hover:bg-muted transition-all"
                        >
                          <Pencil className="w-3 h-3 text-accent" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {ride.isConvoyRide && (
                        <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          <Users className="w-2.5 h-2.5" />
                          Convoy
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(ride.duration)}
                      </span>
                      {isLatest && (
                        <span className="text-[10px] text-accent font-medium">Latest</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="font-mono text-base landscape:text-sm font-bold">{formatDistance(ride.distance, settings.distanceUnit)}</p>
                    <p className="text-[10px] text-muted-foreground">{getDistanceLabel(settings.distanceUnit)}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
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
