import { useEffect, useState } from 'react';
import { CloudRain, Loader2, Route, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/features/settings';
import { planRouteOptions, RoutePlan } from '../lib/routing';

export type RouteMode = 'direct' | 'twisty';

interface Props {
  start: { lat: number; lng: number } | null;
  /** Ordered stops between start and destination. */
  stops: { lat: number; lng: number }[];
  destination: { lat: number; lng: number };
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  /** Via point of the chosen twisty line, so the caller can ride it. */
  onTwistyVia: (via: { lat: number; lng: number } | null) => void;
}

function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

/**
 * Pre-ride route choice: direct vs twisty with real ETAs for both, plus the
 * weather-routing switch. Shown above Navigate once a destination is set.
 */
export function RouteOptions({ start, stops, destination, mode, onModeChange, onTwistyVia }: Props) {
  const { settings, updateSetting } = useSettings();
  const useMiles = settings.distanceUnit === 'miles';
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [busy, setBusy] = useState(false);

  const key = JSON.stringify([start, stops, destination]);

  useEffect(() => {
    if (!start) return;
    let cancelled = false;
    setBusy(true);
    setPlan(null);
    planRouteOptions([start, ...stops, destination]).then((result) => {
      if (cancelled) return;
      setPlan(result);
      setBusy(false);
      if (!result?.twisty) {
        onModeChange('direct');
        onTwistyVia(null);
      } else if (mode === 'twisty') {
        onTwistyVia(result.twisty.via ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const distanceOf = (meters: number) =>
    useMiles ? `${(meters / 1609.34).toFixed(1)} mi` : `${(meters / 1000).toFixed(1)} km`;

  const options: { id: RouteMode; label: string; icon: typeof Route; hint: string }[] = [
    { id: 'direct', label: 'Direct', icon: Route, hint: 'Fastest line' },
    { id: 'twisty', label: 'Twisty', icon: Waves, hint: 'More corners' },
  ];

  const select = (id: RouteMode) => {
    if (id === 'twisty' && !plan?.twisty) return;
    onModeChange(id);
    onTwistyVia(id === 'twisty' ? plan?.twisty?.via ?? null : null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const data = opt.id === 'direct' ? plan?.direct : plan?.twisty;
          const disabled = opt.id === 'twisty' && !busy && !plan?.twisty;
          const active = mode === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => select(opt.id)}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98]',
                active ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted',
                disabled && 'opacity-40',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn('w-3.5 h-3.5', active ? 'text-accent' : 'text-muted-foreground')} />
                <span className="text-xs font-semibold">{opt.label}</span>
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : data ? (
                  formatDuration(data.durationSeconds)
                ) : (
                  '—'
                )}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {data ? distanceOf(data.distanceMeters) : opt.hint}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <CloudRain className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium">Weather routing</p>
            <p className="text-[10px] text-muted-foreground truncate">Reroute around heavy rain</p>
          </div>
        </div>
        <Switch
          checked={settings.weatherRoutingEnabled}
          onCheckedChange={(v) => updateSetting('weatherRoutingEnabled', v)}
          aria-label="Weather routing"
        />
      </div>
    </div>
  );
}
