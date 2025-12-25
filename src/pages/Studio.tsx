import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory, VideoOverlayProcessor } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles, Wand2 } from 'lucide-react';
import { formatDate, formatDuration, formatDistance, formatSpeed } from '@/lib/format';

// Live Overlay Preview Component
function OverlayPreview({ 
  distance, 
  duration, 
  avgSpeed, 
  maxSpeed, 
  maxLean,
  distanceUnit,
  speedUnit,
}: {
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  maxLean: number;
  distanceUnit: 'miles' | 'km';
  speedUnit: 'mph' | 'kph';
}) {
  const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const speedLabel = speedUnit.toUpperCase();
  
  return (
    <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl overflow-hidden border border-border">
      {/* Simulated video background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiLz48cGF0aCBkPSJNMjAgMjBsMjAgMjBNMjAgMjBMMCAwTTIwIDIwTDAgNDBNMjAgMjBMNDAgMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] bg-repeat" />
      </div>
      
      {/* Road lines animation */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-full">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-500/20 to-yellow-500/40 animate-pulse" />
      </div>
      
      {/* Preview label */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent/80 text-accent-foreground text-[10px] font-medium rounded-full uppercase tracking-wide">
        Overlay Preview
      </div>
      
      {/* === OVERLAY LAYER === */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-end justify-between gap-2">
          {/* Bottom Left - Distance */}
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10 min-w-[100px]">
            <p className="text-[9px] text-white/60 uppercase tracking-wide">Distance</p>
            <p className="font-mono text-xl font-bold text-white leading-tight">
              {formatDistance(distance, distanceUnit)}
            </p>
            <p className="text-[10px] text-white/70">{distLabel}</p>
          </div>
          
          {/* Bottom Center - Speed + Max + Lean */}
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/15 flex-shrink-0">
            <div className="flex items-center gap-4">
              {/* Speed */}
              <div className="text-center">
                <p className="font-mono text-3xl font-bold text-white leading-none">
                  {Math.round(avgSpeed)}
                </p>
                <p className="text-[10px] text-white/70 mt-0.5">{speedLabel}</p>
                <p className="text-[9px] text-cyan-400 mt-1">
                  MAX {Math.round(maxSpeed)} {speedLabel}
                </p>
              </div>
              
              {/* Lean Angle */}
              {maxLean > 0 && (
                <div className="text-center border-l border-white/20 pl-4">
                  <p className="text-[9px] text-white/60 uppercase">Lean</p>
                  <p className="font-mono text-2xl font-bold text-orange-400 leading-tight">
                    {maxLean}°
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Bottom Right - Duration */}
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10 min-w-[100px] text-right">
            <p className="text-[9px] text-white/60 uppercase tracking-wide">Duration</p>
            <p className="font-mono text-xl font-bold text-white leading-tight">
              {formatDuration(duration)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        {/* Live Overlay Preview */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Your Overlay</h2>
          <OverlayPreview
            distance={ride.distance}
            duration={ride.duration}
            avgSpeed={ride.averageSpeed}
            maxSpeed={ride.maxSpeed}
            maxLean={maxLean}
            distanceUnit={settings.distanceUnit}
            speedUnit={settings.speedUnit}
          />
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            This overlay will be added to your video
          </p>
        </div>

        {/* Video Overlay Processor */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
            <Wand2 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-medium">Upload Action Cam Footage</h2>
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
