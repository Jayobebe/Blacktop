import { useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { haptics } from '@/lib/haptics';
import type { TrackDef } from '../types';
import { saveTrack, trackLength, useTrackStore } from '../lib/trackStore';
import { loadCircuit, type LibraryCircuit, type LibraryLayout } from '../lib/circuitLibrary';
import { TrackEditor } from './TrackEditor';
import { TrackSearch } from './TrackSearch';
import { tr } from '@/lib/i18n';

const km = (m: number | null | undefined) => (m == null ? '' : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * The pit crew sets the track for their racer: the same search (venues and
 * layouts, pit lanes never in a lap), the crew's saved tracks and the map
 * builder, ending in the chase cam to place the start/finish and sectors.
 * The chosen track then goes to the racer when they scan the crew's QR.
 */
export function PitTrackPicker({ onChosen, onCancel }: { onChosen: (t: TrackDef) => void; onCancel: () => void }) {
  const { tracks } = useTrackStore();
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState<LibraryLayout | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const choose = (t: TrackDef) => {
    haptics.light();
    onChosen(t);
  };

  const pickCircuit = async (c: LibraryCircuit) => {
    const existing = tracks.find((t) => t.osmId === c.id);
    if (existing) return choose(existing);
    setLoadingId(c.id);
    try {
      setImporting(await loadCircuit(c.id));
    } catch {
      toast.error(tr("Couldn't load {0}", [c.name]), { description: tr("Check your connection, or build it from the map.") });
    } finally {
      setLoadingId(null);
    }
  };

  if (editing || importing) {
    return (
      <TrackEditor
        library={importing ?? undefined}
        onCancel={() => {
          setEditing(false);
          setImporting(null);
        }}
        onSave={(t) => {
          saveTrack(t);
          setEditing(false);
          setImporting(null);
          choose(t);
        }}
      />
    );
  }

  const recent = [...tracks].sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0)).slice(0, 8);

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader title={tr("Set up the track")} subtitle={tr("Pit crew")} onBack={onCancel} />
      <p className="text-xs text-muted-foreground">
        {tr("Pick or build the track and place the timing lines. Your racer scans your QR to get it, then rides to the grid.")}
      </p>
      <TrackSearch tracks={tracks} onPickTrack={choose} onPickCircuit={pickCircuit} loadingId={loadingId} />
      <Button variant="secondary" className="h-12 gap-2" onClick={() => setEditing(true)}>
        <MapIcon className="w-5 h-5" />{" "}{tr("Pick on the map")}
      </Button>
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tr("Your tracks")}</p>
          {recent.map((t) => (
            <button
              key={t.id}
              onClick={() => choose(t)}
              className="w-full min-h-[48px] text-left px-3 py-2 rounded-xl bg-card/50 border border-border/50 hover:border-accent/50"
            >
              <span className="block text-sm font-medium truncate">{t.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[km(trackLength(t)), tr("{0} sectors", [t.splits.length + 1])].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
