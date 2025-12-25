import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory, VideoOverlayProcessor } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Film, Sparkles, Sliders, Wand2 } from 'lucide-react';
import { formatDate, formatDuration, formatDistance, formatSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides } = useRideHistory();
  const { settings } = useSettings();
  
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

  const maxLean = Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={() => navigate(`/ride/${id}`)}
          className="p-2.5 rounded-lg bg-secondary hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-display font-bold">BlackTop Studio</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ride.name || formatDate(ride.startedAt)}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Ride Stats Summary */}
        <div className="bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl p-4 border border-accent/20">
          <h2 className="text-sm font-medium text-accent mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Ride Data to Overlay
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Distance</p>
              <p className="font-mono font-bold text-lg">
                {formatDistance(ride.distance, settings.distanceUnit)}
              </p>
            </div>
            <div className="bg-background/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Duration</p>
              <p className="font-mono font-bold text-lg">
                {formatDuration(ride.duration)}
              </p>
            </div>
            <div className="bg-background/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Top Speed</p>
              <p className="font-mono font-bold text-lg">
                {formatSpeed(ride.maxSpeed, settings.speedUnit)}
              </p>
            </div>
            <div className="bg-background/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Max Lean</p>
              <p className="font-mono font-bold text-lg">
                {maxLean > 0 ? `${maxLean}°` : '—'}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            {ride.gpsPoints.length} GPS data points will be synced with your video
          </p>
        </div>

        {/* Video Overlay Processor */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
            <Wand2 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-medium">Create Overlay Video</h2>
          </div>
          <div className="p-4">
            <VideoOverlayProcessor ride={ride} />
          </div>
        </div>

        {/* Future Features Teaser */}
        <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Coming Soon
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
              <span>Custom overlay positions and styles</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
              <span>Add music and sound effects</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
              <span>Export to social media formats</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
