import { useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/hooks/useRideHistory';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Clock, MapPin } from 'lucide-react';
import { formatDuration, formatDistance, formatDate } from '@/lib/format';

export default function History() {
  const navigate = useNavigate();
  const { rides } = useRideHistory();

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
          rides.map((ride, index) => (
            <button
              key={ride.id}
              onClick={() => navigate(`/ride/${ride.id}`)}
              className="w-full bg-card border border-border rounded-lg p-4 text-left hover:bg-muted/50 transition-colors animate-slide-up touch-target"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium">{formatDate(ride.startedAt)}</p>
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
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold">{formatDistance(ride.distance)}</p>
                  <p className="text-xs text-muted-foreground">miles</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Avg: {Math.round(ride.averageSpeed)} mph</span>
                <span>Max: {Math.round(ride.maxSpeed)} mph</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
