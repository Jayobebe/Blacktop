import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Trash2, Clock, MapPin, Gauge, TrendingUp } from 'lucide-react';
import { formatDuration, formatDistance, formatDate, formatTime } from '@/lib/format';
import { useState } from 'react';

export default function RideDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides, deleteRide } = useRideHistory();
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
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/history')}
            className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold">{formatDate(ride.startedAt)}</h1>
            <p className="text-sm text-muted-foreground">{formatTime(ride.startedAt)}</p>
          </div>
        </div>
        {ride.isConvoyRide && (
          <span className="flex items-center gap-1 text-sm text-accent bg-accent/10 px-3 py-1 rounded">
            <Users className="w-4 h-4" />
            Convoy
          </span>
        )}
      </header>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in">
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <MapPin className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Distance</span>
          </div>
          <p className="font-mono text-3xl font-bold">{formatDistance(ride.distance)}</p>
          <p className="text-sm text-muted-foreground">miles</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Duration</span>
          </div>
          <p className="font-mono text-3xl font-bold">{formatDuration(ride.duration)}</p>
          <p className="text-sm text-muted-foreground">h:mm:ss</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Gauge className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Avg Speed</span>
          </div>
          <p className="font-mono text-3xl font-bold">{Math.round(ride.averageSpeed)}</p>
          <p className="text-sm text-muted-foreground">mph</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Max Speed</span>
          </div>
          <p className="font-mono text-3xl font-bold">{Math.round(ride.maxSpeed)}</p>
          <p className="text-sm text-muted-foreground">mph</p>
        </div>
      </div>

      {/* GPS Points Info */}
      <div className="bg-card rounded-lg p-4 border border-border mb-6 animate-slide-up">
        <p className="text-sm text-muted-foreground">
          {ride.gpsPoints.length} GPS points recorded
        </p>
      </div>

      {/* Delete Button */}
      <div className="mt-auto animate-slide-up delay-100">
        {!showDeleteConfirm ? (
          <Button
            onClick={() => setShowDeleteConfirm(true)}
            variant="outline"
            className="w-full h-12 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Ride
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleDelete}
              className="w-full h-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              Confirm Delete
            </Button>
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              variant="ghost"
              className="w-full h-12 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
