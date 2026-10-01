import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TrackDef } from '../types';
import { saveTrack } from '../lib/trackStore';
import { cancelWalk, finishLapNow, finishWalk, redoLap, useRacer } from '../lib/session';
import { metres as distanceBetween } from '../lib/geometry';
import { TrackEditor } from './TrackEditor';
import { TrackMinimap } from './TrackMinimap';
import { tr } from '@/lib/i18n';

/**
 * Recording a lap with GPS to build a track (the racer riding it, or the pit
 * crew walking it), then placing its lines in the chase cam. Shown while the
 * session store's phase is 'walking'; `onSaved` gets the new track.
 */
export function WalkScreen({ header, overlay, onSaved }: { header?: React.ReactNode; overlay?: React.ReactNode; onSaved?: (t: TrackDef) => void }) {
  const racer = useRacer();

  if (racer.walkLoop) {
    return (
      <TrackEditor
        loop={racer.walkLoop}
        onCancel={cancelWalk}
        onSave={(t) => {
          saveTrack(t);
          finishWalk(t);
          onSaved?.(t);
          toast.success(tr("{0} saved", [t.name]), { description: tr("{0} sectors", [t.splits.length + 1]) });
        }}
      />
    );
  }
  const w = racer.walk;
  if (!w) return null;
  const gap = w.trail.length > 1 ? Math.round(distanceBetween(w.trail[0], w.trail[w.trail.length - 1])) : null;
  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
      {header}
      <TrackMinimap
        className="flex-1 min-h-[240px]"
        lines={[{ points: w.trail, color: 'hsl(var(--accent))', width: 1.4 }]}
        dot={w.trail[w.trail.length - 1] ?? null}
      />
      <div className="text-center space-y-1">
        <p className="font-mono text-2xl font-bold">{w.travelled >= 1000 ? tr("{0} km", [(w.travelled / 1000).toFixed(2)]) : tr("{0} m", [Math.round(w.travelled)])}</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          {w.trail.length < 2
            ? tr("Ride or walk one lap of the track. Recording starts as soon as GPS locks on.")
            : tr("Keep going. The lap closes by itself when you’re back on your line, then you place the start/finish and sectors.")}
        </p>
        {racer.canClose && gap !== null && <p className="text-[11px] text-muted-foreground">{gap}{" "}{tr("m from where you started")}</p>}
      </div>
      <Button
        variant="secondary"
        className="h-14 gap-2"
        disabled={!racer.canClose}
        onClick={() => {
          if (!finishLapNow()) toast(tr("Go a bit further round first"));
        }}
      >
        <Check className="w-5 h-5" />{" "}{tr("Finish the lap here")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={redoLap} disabled={w.trail.length < 2}>
          {tr("Start again")}
        </Button>
        <Button variant="ghost" onClick={cancelWalk}>
          {tr("Cancel")}
        </Button>
      </div>
      {overlay}
    </div>
  );
}
