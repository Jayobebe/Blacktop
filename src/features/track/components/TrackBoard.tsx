import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useSettings } from '@/features/settings';
import { useExperience, VEHICLES } from '@/features/experience';
import type { TrackDef } from '../types';
import { fetchBoard, lapClock, lapDirection } from '../lib/trackRecords';

/**
 * A library layout's leaderboard, under the selected track: this direction,
 * the rider's own vehicle class. Closed until tapped, so it only asks the
 * server when someone wants to look.
 */
export function TrackBoard({ track }: { track: TrackDef & { osmId: number } }) {
  const [open, setOpen] = useState(false);
  const { settings } = useSettings();
  const { vehicles } = useExperience();
  const navigate = useNavigate();
  const vehicleClass = vehicles[0] ?? 'motorcycle';
  const direction = lapDirection(track.outline);
  const board = useQuery({
    queryKey: ['track-board', track.osmId, direction, vehicleClass],
    queryFn: () => fetchBoard(track.osmId, direction, vehicleClass),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <div className="rounded-2xl border border-border bg-card/50">
      <button type="button" className="w-full flex items-center gap-2 p-3 touch-target" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Trophy className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">{tr("Leaderboard")}</span>
        <span className="text-xs text-muted-foreground">{VEHICLES[vehicleClass].label}</span>
        <ChevronDown className={cn('w-4 h-4 ml-auto text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {!settings.trackLeaderboardsEnabled && (
            <button type="button" className="w-full text-left text-[11px] text-muted-foreground leading-snug" onClick={() => navigate('/settings')}>
              {tr("Your laps aren't on the board. Turn on Track leaderboards under Track Day in Settings → Your Blacktop to race for dog tags.")}
            </button>
          )}
          {board.isLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : board.isError ? (
            <p className="text-xs text-muted-foreground py-2">{tr("Couldn't load the leaderboard.")}</p>
          ) : !board.data?.length ? (
            <p className="text-xs text-muted-foreground py-2">{tr("No times yet. Set the first one.")}</p>
          ) : (
            <ol className="divide-y divide-border/30">
              {board.data.map((r) => (
                <li key={`${r.rank}-${r.display_name}`} className={cn('flex items-center gap-2 py-1.5 px-1 rounded-md', r.is_me && 'bg-accent/15')}>
                  <span className={cn('w-8 font-mono text-xs font-bold', r.is_me ? 'text-accent' : 'text-muted-foreground')}>P{r.rank}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{r.is_me ? tr("You") : r.display_name}</span>
                    {r.vehicle_name && <span className="block text-[10px] text-muted-foreground truncate">{r.vehicle_name}</span>}
                  </span>
                  <span className="font-mono text-sm font-bold">{lapClock(r.lap_ms)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
