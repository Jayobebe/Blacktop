import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory, RidePhotos } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Trash2, Clock, MapPin, Gauge, TrendingUp, Video, Download, Check, Film } from 'lucide-react';
import { formatDuration, formatDistance, formatDate, formatTime, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { useState } from 'react';
import { toast } from 'sonner';

export default function RideDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides, deleteRide, addRidePhoto, removeRidePhoto, markRecordingSaved, removeRideRecording, clearRideOverlayBlob } = useRideHistory();
  const { settings } = useSettings();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);

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

  // Generate filename from ride name
  const getRideFilename = () => {
    const baseName = ride.name || formatDate(ride.startedAt);
    // Sanitize filename: remove invalid characters
    const sanitized = baseName.replace(/[/\\?%*:|"<>]/g, '-').trim();
    return `${sanitized}.webm`;
  };

  const handleSaveRecording = async () => {
    if (!ride.recording?.blobUrl) return;
    
    setSaveProgress(0);
    
    try {
      // Fetch the blob to get size info and simulate progress
      const response = await fetch(ride.recording.blobUrl);
      const blob = await response.blob();
      
      // Simulate progress for better UX (actual download is instant)
      const progressInterval = setInterval(() => {
        setSaveProgress(prev => {
          if (prev === null || prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);
      
      // Create download link with ride name as filename
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getRideFilename();
      a.click();
      
      // Complete progress
      clearInterval(progressInterval);
      setSaveProgress(100);
      
      // Mark as saved after brief delay
      setTimeout(() => {
        markRecordingSaved(ride.id);
        setSaveProgress(null);
        toast.success('Recording saved to device');
        URL.revokeObjectURL(url);
      }, 500);
      
    } catch (error) {
      console.error('Error saving recording:', error);
      setSaveProgress(null);
      toast.error('Failed to save recording');
    }
  };

  // Format file size
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            <h1 className="text-lg landscape:text-base font-display font-bold">{ride.name || formatDate(ride.startedAt)}</h1>
            <p className="text-xs text-muted-foreground">{formatDate(ride.startedAt)} • {formatTime(ride.startedAt)}</p>
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
            recording={ride.recording}
            onRemoveRecording={() => removeRideRecording(ride.id)}
          />
        </div>

        {/* Recording Section - only show if recording exists */}
        {ride.recording && (
          <div className="bg-card rounded-xl overflow-hidden border border-border mb-3 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-card/80">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Video className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Ride Recording</span>
              </div>
              {ride.recording.savedAt && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
            </div>
            
            {/* Thumbnail with Save Button Overlay */}
            {!ride.recording.savedAt && ride.recording.blobUrl && (
              <div className="relative aspect-video bg-muted">
                {/* Blurred Thumbnail */}
                {ride.recording.thumbnailUrl ? (
                  <img
                    src={ride.recording.thumbnailUrl}
                    alt="Recording preview"
                    className="w-full h-full object-cover blur-md scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/20" />
                )}
                
                {/* Dark Overlay */}
                <div className="absolute inset-0 bg-black/50" />
                
                {/* Save Button / Progress */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  {saveProgress === null ? (
                    <>
                      <Button
                        variant="secondary"
                        size="lg"
                        className="gap-2 bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 text-white"
                        onClick={handleSaveRecording}
                      >
                        <Download className="w-5 h-5" />
                        Save Recording
                      </Button>
                      <div className="text-center">
                        <p className="text-white/80 text-sm font-medium">
                          {formatDuration(ride.recording.duration || 0)}
                        </p>
                        {ride.recording.size && (
                          <p className="text-white/60 text-xs">
                            {formatSize(ride.recording.size)}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="w-3/4 space-y-2">
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-accent transition-all duration-200 rounded-full"
                          style={{ width: `${saveProgress}%` }}
                        />
                      </div>
                      <p className="text-white/80 text-xs text-center">
                        {saveProgress < 100 ? 'Saving...' : 'Complete!'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Saved state - show thumbnail without blur */}
            {ride.recording.savedAt && ride.recording.thumbnailUrl && (
              <div className="relative aspect-video bg-muted">
                <img
                  src={ride.recording.thumbnailUrl}
                  alt="Recording preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-white text-xs">
                  {formatDuration(ride.recording.duration || 0)}
                </div>
              </div>
            )}
            
            {/* File info */}
            <div className="px-3 py-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground truncate">{getRideFilename()}</p>
            </div>
          </div>
        )}

        {/* Download Overlay Section - only show if overlay was recorded */}
        {ride.overlayBlobUrl && (
          <button
            onClick={() => {
              const a = document.createElement('a');
              a.href = ride.overlayBlobUrl!;
              a.download = `${ride.name || formatDate(ride.startedAt)}-overlay.webm`;
              a.click();
              toast.success('Overlay video downloaded!');
              clearRideOverlayBlob(ride.id);
            }}
            className="w-full bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl overflow-hidden border border-accent/30 mb-3 animate-slide-up hover:from-accent/30 hover:to-accent/20 transition-colors group"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Film className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-sm">Download Overlay Video</h3>
                  <p className="text-xs text-muted-foreground">Ready to use in your video editor</p>
                </div>
              </div>
              <Download className="w-5 h-5 text-accent" />
            </div>
          </button>
        )}

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
