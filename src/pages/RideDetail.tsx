import { isNativeApp } from '@/lib/platform';
import { shareFileNative } from '@/lib/nativeShare';
import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory, RidePhotos, RideSummary } from '@/features/ride';
import { useGarage } from '@/features/garage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Trash2, Video, Download, Check, Film, Box, Share2, IdCard, Zap, ChevronRight } from 'lucide-react';
import { formatDate, formatTime, formatDuration } from '@/lib/format';
import { deleteRideOverlayBlob, getRideOverlayBlob } from '@/lib/overlayStore';
import { convertWebmToMp4 } from '@/lib/convertToMp4';
import { useState } from 'react';
import { RideFlyover } from '@/features/ride/components/RideFlyover';
import { toast } from 'sonner';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { useProfile } from '@/features/profile';
import { CornerReportCard } from '@/features/ride/components/CornerReportCard';
import { shareRecapCard } from '@/features/ride/lib/recapCard';
import { useExperience } from '@/features/experience';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { formatLap } from '@/features/track';
import { tr } from '@/lib/i18n';
import { usePeaksHidden } from '@/features/ride';

export default function RideDetail() {
  const peaksHidden = usePeaksHidden();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides, deleteRide, addRidePhoto, removeRidePhoto, markRecordingSaved, removeRideRecording, clearRideOverlay } = useRideHistory();
  const { bikes } = useGarage();
  const { settings } = useSettings();
  const { terms, canLean } = useExperience();
  const { profile } = useProfile();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [overlayProgress, setOverlayProgress] = useState<number | null>(null);
  const [showFlyover, setShowFlyover] = useState(false);
  const [recapBusy, setRecapBusy] = useState(false);

  const ride = rides.find(r => r.id === id);
  const rideBike = ride ? bikes.find(b => b.id === ride.bikeId) ?? null : null;

  if (!ride) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">{tr("Ride not found")}</p>
        <Button onClick={() => navigate('/history')} className="mt-4">
          {tr("Back to History")}
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
      
      // The native app hands it to the share sheet (save to Files / Photos).
      if (isNativeApp()) {
        clearInterval(progressInterval);
        const shared = await shareFileNative(getRideFilename(), blob);
        setSaveProgress(null);
        if (shared) markRecordingSaved(ride.id);
        return;
      }

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
        toast.success(tr("Recording saved to device"));
        URL.revokeObjectURL(url);
      }, 500);
      
    } catch (error) {
      console.error('Error saving recording:', error);
      setSaveProgress(null);
      toast.error(tr("Failed to save recording"));
    }
  };

  // Format file size
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <PageHeader
        title={ride.name || formatDate(ride.startedAt)}
        subtitle={`${formatDate(ride.startedAt)} · ${formatTime(ride.startedAt)}`}
        backTo="/history"
        right={
          <>
            {ride.track && (
              <span className="flex items-center gap-1 text-xs font-medium text-[hsl(330_81%_60%)] bg-[hsl(330_81%_60%)]/10 px-2.5 py-1 rounded-full">
                <Zap className="w-3.5 h-3.5" />
                {tr("Track")}
              </span>
            )}
            {ride.isConvoyRide && (
              <span className="flex items-center gap-1 text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                <Users className="w-3.5 h-3.5" />
                {tr("Convoy")}
              </span>
            )}
          </>
        }
      />

      {/* Main content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {/* Ride Receipt - regenerated on demand from this ride's stored data
            (no separate rendered copy is cached - see burnAllData/burnGarage,
            which already cover everything this receipt reads). Downloadable
            here any time via its own Save button. */}
        <div className="mb-4 animate-fade-in">
          <RideSummary
            variant="embedded"
            members={[]}
            rideStats={{
              duration: ride.duration,
              distance: ride.distance,
              maxSpeed: ride.maxSpeed,
              averageSpeed: ride.averageSpeed,
              maxLean: Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0),
              maxGForce: ride.maxGForce,
              gEnvelope: ride.gEnvelope,
              gMax: ride.gMax,
            }}
            bikeName={rideBike?.name ?? null}
            bikePhoto={rideBike?.photos?.hero ?? null}
            gForceSamples={ride.gForceSamples}
            earnedBadges={ride.earnedBadges}
            printedAt={ride.endedAt ?? ride.startedAt}
            orderId={`#${ride.id.slice(0, 6).toUpperCase()}`}
            trackDay={!!ride.track}
            track={ride.track ?? null}
          />
        </div>

        {ride.track && (
          <button
            onClick={() => navigate(`/track?session=${ride.track!.sessionId}`)}
            className="w-full text-left bg-[hsl(330_81%_60%)]/5 rounded-lg p-3 border border-[hsl(330_81%_60%)]/50 mb-3 animate-slide-up"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[hsl(330_81%_60%)]" />
              <p className="text-sm font-bold flex-1">{tr("Track Day ·")}{" "}{ride.track.trackName}</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-lg bg-secondary/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Best lap")}</p>
                <p className="text-sm font-bold tabular-nums">{formatLap(ride.track.bestLapMs)}</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Theoretical")}</p>
                <p className="text-sm font-bold tabular-nums">{formatLap(ride.track.theoreticalMs)}</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Laps")}</p>
                <p className="text-sm font-bold tabular-nums">{ride.track.laps}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">{tr("Open for lap traces, racing lines, corners and exports")}</p>
          </button>
        )}


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
                <span className="text-xs uppercase tracking-wide">{tr("Ride Recording")}</span>
              </div>
              {ride.recording.savedAt && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <Check className="w-3.5 h-3.5" />
                  {tr("Saved")}
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
                    alt={tr("Recording preview")}
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
                        {tr("Save Recording")}
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
                        {saveProgress < 100 ? tr("Saving...") : tr("Complete!")}
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
                  alt={tr("Recording preview")}
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

        {/* Corner Report — scored from this ride's own GPS/lean trace */}
        {(settings.leanAngleEnabled || settings.gForceEnabled) && !peaksHidden && <CornerReportCard ride={ride} />}

        {/* Shareable recap card */}
        <button
          disabled={recapBusy}
          onClick={async () => {
            setRecapBusy(true);
            try {
              const result = await shareRecapCard(ride, {
                riderName: profile.name,
                bikeName: settings.garageEnabled ? rideBike?.name ?? null : null,
                unit: settings.distanceUnit === 'km' ? 'km' : 'miles',
                showSpeed: settings.speedFocusEnabled,
                showLean: canLean && settings.leanAngleEnabled,
                showG: settings.gForceEnabled,
                rideWord: terms.ride,
              });
              toast.success(result === 'shared' ? tr("Recap card shared") : tr("Recap card saved"));
            } catch (err) {
              console.error('Recap card failed:', err);
              toast.error(tr("Could not create recap card"));
            } finally {
              setRecapBusy(false);
            }
          }}
          className="w-full bg-card rounded-xl overflow-hidden border border-border mb-3 animate-slide-up hover:bg-secondary/40 transition-colors disabled:opacity-70"
        >
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-accent" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm">{recapBusy ? tr("Building recap…") : tr("Share Recap Card")}</h3>
                <p className="text-xs text-muted-foreground">{tr("Route, stats & corner grade as one image")}</p>
              </div>
            </div>
            <Download className="w-5 h-5 text-muted-foreground" />
          </div>
        </button>

        {/* 3D Ride Overview */}
        {settings.flyoverEnabled && (ride.gpsPoints?.length ?? 0) > 1 && (
          <button
            onClick={() => setShowFlyover(true)}
            className="w-full bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl overflow-hidden border border-accent/30 mb-3 animate-slide-up hover:from-accent/30 hover:to-accent/20 transition-colors"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Box className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-sm">{tr("3D {0} Overview", [terms.Ride])}</h3>
                  <p className="text-xs text-muted-foreground">{tr("Flyover of your route, downloadable as MP4")}</p>
                </div>
              </div>
              <Download className="w-5 h-5 text-accent" />
            </div>
          </button>
        )}

        {/* Download Overlay Section - show if overlay was recorded */}
        {(settings.rideOverlayEnabled || ride.track) && (ride.overlayAvailable || ride.overlayBlobUrl) && (
          <button
            disabled={overlayProgress !== null}
            onClick={async () => {
              // Generate filename from ride name (same sanitization as recording)
              const baseName = ride.name || formatDate(ride.startedAt);
              const sanitized = baseName.replace(/[/\\?%*:|"<>]/g, '-').trim();
              const filename = `${sanitized}-overlay.mp4`;

              try {
                // Prefer persisted overlay blob (survives refresh)
                let webmBlob = await getRideOverlayBlob(ride.id);

                // Backward compat: try legacy blob URL if present
                if (!webmBlob && ride.overlayBlobUrl) {
                  const resp = await fetch(ride.overlayBlobUrl);
                  webmBlob = await resp.blob();
                }

                if (!webmBlob) {
                  toast.error(tr("Overlay not available on this device anymore"));
                  return;
                }

                // Convert WebM to MP4
                setOverlayProgress(0);
                toast.info(tr("Converting overlay to MP4..."));
                
                const mp4Blob = await convertWebmToMp4(webmBlob, (progress) => {
                  setOverlayProgress(progress);
                });

                // Native app: the share sheet; the overlay is only cleared once it's been saved or sent.
                if (isNativeApp()) {
                  const shared = await shareFileNative(filename, mp4Blob);
                  setOverlayProgress(null);
                  if (shared) {
                    await deleteRideOverlayBlob(ride.id);
                    clearRideOverlay(ride.id);
                  }
                  return;
                }

                const url = URL.createObjectURL(mp4Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                await deleteRideOverlayBlob(ride.id);
                clearRideOverlay(ride.id);
                setOverlayProgress(null);
                toast.success(tr("Overlay video downloaded!"));
              } catch (error) {
                console.error('Failed to download overlay video:', error);
                setOverlayProgress(null);
                toast.error(tr("Failed to download overlay video"));
              }
            }}
            className="w-full bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl overflow-hidden border border-accent/30 mb-3 animate-slide-up hover:from-accent/30 hover:to-accent/20 transition-colors group disabled:opacity-70"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Film className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-sm">
                    {overlayProgress !== null ? tr("Converting... {0}%", [overlayProgress]) : tr("Download Overlay Video")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {overlayProgress !== null ? tr("Please wait") : tr("MP4 format for video editors")}
                  </p>
                </div>
              </div>
              {overlayProgress !== null ? (
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-5 h-5 text-accent" />
              )}
            </div>
          </button>
        )}

        {/* GPS Points Info */}
        <div className="bg-card rounded-lg p-2.5 border border-border mb-3 animate-slide-up">
          <p className="text-xs text-muted-foreground">
            {ride.gpsPoints.length}{" "}{tr("GPS points recorded")}
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
            {tr("Delete {0}", [terms.Ride])}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleDelete}
              size="sm"
              className="flex-1 h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              {tr("Confirm Delete")}
            </Button>
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              variant="ghost"
              size="sm"
              className="flex-1 h-10 touch-target"
            >
              {tr("Cancel")}
            </Button>
          </div>
        )}
      </div>
      {showFlyover && <RideFlyover ride={ride} onClose={() => setShowFlyover(false)} />}
    </div>
  );
}
