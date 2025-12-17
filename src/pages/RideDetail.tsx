import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { RidePhotos } from '@/components/RidePhotos';
import { ArrowLeft, Users, Trash2, Clock, MapPin, Gauge, TrendingUp } from 'lucide-react';
import { formatDuration, formatDistance, formatDate, formatTime, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { useState } from 'react';

export default function RideDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides, deleteRide, addRidePhoto, removeRidePhoto } = useRideHistory();
  const { settings } = useSettings();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const ride = rides.find(r => r.id === id);

  if (!ride) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Ride not found</p>
        <Button onClick={() => navigate('/history')} className="mt-4">
          Back to History
        </Button>
      </div>
    );
  }

  const handleDelete = () => {
    deleteRide(ride.id);
    navigate('/history');
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 landscape:mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="p-2.5 landscape:p-2 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
          >
            <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
          </button>
          <div>
            <h1 className="text-lg landscape:text-base font-display font-bold">{formatDate(ride.startedAt)}</h1>
            <p className="text-xs text-muted-foreground">{formatTime(ride.startedAt)}</p>
          </div>
        </div>
        {ride.isConvoyRide && (
          <span className="flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">
            <Users className="w-3.5 h-3.5" />
            Convoy
          </span>
        )}
      </header>

      {/* Main content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {/* Stats Grid - horizontal layout in landscape */}
        <div className="grid grid-cols-2 landscape:grid-cols-4 gap-2 mb-4 animate-fade-in">
          <div className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Distance</span>
            </div>
            <p className="font-mono text-2xl landscape:text-xl font-bold">{formatDistance(ride.distance, settings.distanceUnit)}</p>
            <p className="text-xs text-muted-foreground">{getDistanceLabel(settings.distanceUnit)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Duration</span>
            </div>
            <p className="font-mono text-2xl landscape:text-xl font-bold">{formatDuration(ride.duration)}</p>
            <p className="text-xs text-muted-foreground">h:mm:ss</p>
          </div>
          <div className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Gauge className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Avg Speed</span>
            </div>
            <p className="font-mono text-2xl landscape:text-xl font-bold">{formatSpeed(ride.averageSpeed, settings.speedUnit)}</p>
            <p className="text-xs text-muted-foreground">{getSpeedLabel(settings.speedUnit)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Max Speed</span>
            </div>
            <p className="font-mono text-2xl landscape:text-xl font-bold">{formatSpeed(ride.maxSpeed, settings.speedUnit)}</p>
            <p className="text-xs text-muted-foreground">{getSpeedLabel(settings.speedUnit)}</p>
          </div>
        </div>

        {/* Photos Section */}
        <div className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border mb-3 animate-slide-up">
          <RidePhotos
            photos={ride.photos || []}
            onAddPhoto={(photo) => addRidePhoto(ride.id, photo)}
            onRemovePhoto={(photoId) => removeRidePhoto(ride.id, photoId)}
          />
        </div>

        {/* GPS Points Info */}
        <div className="bg-card rounded-lg p-2.5 border border-border mb-3 animate-slide-up">
          <p className="text-xs text-muted-foreground">
            {ride.gpsPoints.length} GPS points recorded
          </p>
        </div>
      </div>

      {/* Delete Button - fixed at bottom */}
      <div className="flex-shrink-0 mt-2 animate-slide-up delay-100">
        {!showDeleteConfirm ? (
          <Button
            onClick={() => setShowDeleteConfirm(true)}
            variant="outline"
            size="sm"
            className="w-full h-10 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Ride
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleDelete}
              size="sm"
              className="flex-1 h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              Confirm Delete
            </Button>
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              variant="ghost"
              size="sm"
              className="flex-1 h-10 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
