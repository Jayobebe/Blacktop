import { useState } from 'react';
import { Loader2, Repeat, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { generateLoopRoute, LoopVibe } from '../lib/routing';

const VIBES: { id: LoopVibe; label: string; hint: string }[] = [
  { id: 'curvy', label: 'Twisty', hint: 'Maximum corners' },
  { id: 'scenic', label: 'Scenic', hint: 'Backroads, steadier' },
  { id: 'relaxed', label: 'Relaxed', hint: 'Flowing, fewer turns' },
];

interface Props {
  userLocation: { lat: number; lng: number } | null;
  onApply: (loop: {
    start: { lat: number; lng: number };
    stops: { lat: number; lng: number }[];
    distanceMeters: number;
    durationSeconds: number;
  }) => void;
  onClose: () => void;
}

/**
 * "Give me a loop" planner: pick a vibe and a length, and the backend builds a
 * round trip from the rider's current position back to it.
 */
export function LoopPlannerPanel({ userLocation, onApply, onClose }: Props) {
  const { settings } = useSettings();
  const useMiles = settings.distanceUnit === 'miles';
  const [vibe, setVibe] = useState<LoopVibe>('curvy');
  // Stored in the rider's own unit; converted to km for the request.
  const [length, setLength] = useState(useMiles ? 40 : 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!userLocation || busy) return;
    setBusy(true);
    setError(null);
    const km = useMiles ? length * 1.60934 : length;
    const loop = await generateLoopRoute(userLocation, km, vibe);
    setBusy(false);
    if (!loop || loop.stops.length === 0) {
      setError('No loop found from here — try a different length.');
      return;
    }
    onApply({
      start: userLocation,
      stops: loop.stops,
      distanceMeters: loop.distanceMeters,
      durationSeconds: loop.durationSeconds,
    });
  };

  const unit = useMiles ? 'mi' : 'km';
  const min = useMiles ? 10 : 15;
  const max = useMiles ? 200 : 320;

  return (
    <div className="absolute inset-x-3 top-20 z-40 rounded-xl border border-border bg-card/95 backdrop-blur p-4 shadow-2xl max-w-md mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Plan a loop</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close loop planner" className="p-1 rounded hover:bg-secondary">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {VIBES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVibe(v.id)}
            aria-pressed={vibe === v.id}
            className={cn(
              'rounded-lg border px-2 py-2 text-left transition-colors',
              vibe === v.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-secondary',
            )}
          >
            <div className="text-xs font-medium">{v.label}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{v.hint}</div>
          </button>
        ))}
      </div>

      <label className="block text-xs text-muted-foreground mb-1" htmlFor="loop-length">
        Length · <span className="text-foreground font-medium">{length} {unit}</span>
      </label>
      <input
        id="loop-length"
        type="range"
        min={min}
        max={max}
        step={5}
        value={length}
        onChange={(e) => setLength(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent))] mb-4"
      />

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {!userLocation && <p className="text-xs text-muted-foreground mb-2">Waiting for GPS…</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!userLocation || busy}
        className="w-full h-10 rounded-lg border border-accent text-accent font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Building loop…</> : 'Generate loop'}
      </button>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Loops start and finish where you are now · roughly {Math.round((length / (useMiles ? 38 : 60)) * 60)} min riding.
      </p>
    </div>
  );
}
