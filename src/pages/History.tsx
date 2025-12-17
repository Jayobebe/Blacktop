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
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-display font-bold">Ride History</h1>
      </header>

      {/* Rides List */}
      <div className="flex-1 space-y-3 animate-fade-in">
        {rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No rides yet</p>
            <p className="text-sm text-muted-foreground mt-1">Start your first ride to see it here</p>
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
                  "w-full bg-card border rounded-lg p-4 text-left hover:bg-muted/50 transition-all animate-slide-up touch-target",
                  isLatest 
                    ? "border-accent/40 shadow-[0_0_20px_-5px] shadow-accent/30" 
                    : "border-border"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-2">
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
                        className="h-8 text-sm font-medium"
                        placeholder="Ride name"
                      />
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <p className="font-medium truncate">{displayName}</p>
                        <button
                          onClick={(e) => handleEditStart(ride.id, ride.name || '', e)}
                          className="p-1 rounded hover:bg-muted transition-all"
                        >
                          <Pencil className="w-3 h-3 text-accent" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {ride.isConvoyRide && (
                        <span className="flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">
                          <Users className="w-3 h-3" />
                          Convoy
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDuration(ride.duration)}
                      </span>
                      {isLatest && (
                        <span className="text-xs text-accent font-medium">Latest</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="font-mono text-lg font-bold">{formatDistance(ride.distance, settings.distanceUnit)}</p>
                    <p className="text-xs text-muted-foreground">{getDistanceLabel(settings.distanceUnit)}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
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
