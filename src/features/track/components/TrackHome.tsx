import { useEffect, useState } from 'react';
import { Footprints, History, Pencil, QrCode, ScanLine, Star, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { demoBlocked } from '@/lib/demoGuard';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import type { TrackDef, TrackSession } from '../types';
import { deleteTrack, saveTrack, toggleStar, trackLength, useTrackStore } from '../lib/trackStore';
import { loadCircuit, type LibraryCircuit, type LibraryLayout } from '../lib/circuitLibrary';
import { formatLap } from '../lib/timing';
import { TrackEditor } from './TrackEditor';
import { TrackSearch } from './TrackSearch';
import { TrackMinimap } from './TrackMinimap';
import { TrackQrScanner } from './TrackQrScanner';
import { tr } from '@/lib/i18n';

/**
 * Track Day home, the same for the racer and the pit crew: search (venues and
 * layouts from the circuit library, the rider's own tracks), a GPS lap to
 * build one, the QR scanner for the other side, the selected track and the
 * shelves. Only the QR wording and the selected track's main button differ:
 * the racer readies up, the pit crew shows the racer its QR.
 */
export function TrackHome({
  role,
  headerRight,
  selected,
  onSelect,
  onWalk,
  scan,
  primary,
  linkLine,
  onViewSession,
}: {
  role: 'racer' | 'pit';
  headerRight?: React.ReactNode;
  selected: TrackDef | null;
  onSelect: (t: TrackDef | null) => void;
  /** Record a lap with GPS to build a track. */
  onWalk: () => void;
  /** The other side's QR: scanner title, hint, and whether a code is the right kind (then it's used). */
  scan: { label: string; hint: string; read: (text: string) => boolean };
  /** The selected track's main button. */
  primary: { label: string; icon: React.ReactNode; onClick: (t: TrackDef) => void };
  /** A line on the selected track about the link (who's linked, the QR). */
  linkLine?: { text: string; onClick: () => void };
  onViewSession: (s: TrackSession) => void;
}) {
  const { tracks, sessions } = useTrackStore();
  const [editing, setEditing] = useState<TrackDef | null>(null);
  const [importing, setImporting] = useState<LibraryLayout | null>(null);
  const [loadingCircuit, setLoadingCircuit] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const locked = useDemoLocked();

  const pick = (t: TrackDef) => {
    haptics.light();
    onSelect(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Library layout → the chase cam, to place the start/finish and sectors. */
  const importCircuit = async (c: LibraryCircuit) => {
    const existing = tracks.find((t) => t.osmId === c.id);
    if (existing) return pick(existing);
    setLoadingCircuit(c.id);
    try {
      setImporting(await loadCircuit(c.id));
    } catch {
      toast.error(tr("Couldn't load {0}", [c.name]), { description: tr("Check your connection, or record a lap with GPS instead.") });
    } finally {
      setLoadingCircuit(null);
    }
  };

  if (editing || importing) {
    return (
      <TrackEditor
        initial={editing ?? undefined}
        library={importing ?? undefined}
        onCancel={() => {
          setEditing(null);
          setImporting(null);
        }}
        onSave={(t) => {
          saveTrack(t);
          onSelect(t);
          setEditing(null);
          setImporting(null);
          toast.success(tr("{0} saved", [t.name]), { description: tr("{0} sectors", [t.splits.length + 1]) });
        }}
      />
    );
  }

  const lastUsed = (t: TrackDef) =>
    Math.max(t.lastUsedAt ?? 0, ...sessions.filter((x) => x.trackId === t.id).map((x) => x.startedAt), t.createdAt ?? 0);
  const previous = [...tracks].sort((a, b) => lastUsed(b) - lastUsed(a));
  const custom = tracks.filter((t) => t.source !== 'library').sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const favourites = tracks.filter((t) => t.starred).sort((a, b) => a.name.localeCompare(b.name));
  const current = selected ? tracks.find((t) => t.id === selected.id) ?? selected : null;

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader title={tr("Track Day")} subtitle={role === 'racer' ? tr("Racer") : tr("Pit crew")} backTo="/" right={headerRight} />

      <TrackSearch tracks={tracks} onPickTrack={pick} onPickCircuit={importCircuit} loadingId={loadingCircuit} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-12 gap-2" onClick={onWalk}>
          <Footprints className="w-5 h-5" />{" "}{role === 'racer' ? tr("Ride a lap (GPS)") : tr("Walk a lap (GPS)")}
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2"
          disabled={locked}
          onClick={() => {
            if (demoBlocked()) return;
            setScanning(true);
          }}
        >
          <ScanLine className="w-5 h-5" />{" "}{scan.label}
        </Button>
      </div>
      {locked && <DemoLockNote />}
      {scanning && <TrackQrScanner title={scan.label} hint={scan.hint} read={scan.read} onClose={() => setScanning(false)} />}

      {current && (
        <SelectedTrack
          track={current}
          best={bestFor(sessions, current.id)}
          primary={primary}
          linkLine={linkLine}
          onEdit={() => setEditing(current)}
          onStar={() => toggleStar(current.id)}
          onDelete={() => {
            deleteTrack(current.id);
            onSelect(null);
            toast(tr("{0} deleted", [current.name]));
          }}
          onClose={() => onSelect(null)}
        />
      )}

      <TrackShelf
        title={tr("Previous tracks")}
        icon={<History className="w-4 h-4 text-accent" />}
        hint={tr("Last raced first")}
        empty={tr("Tracks you save or race show up here.")}
        tracks={previous}
        sessions={sessions}
        selectedId={current?.id}
        onPick={pick}
      />
      <TrackShelf
        title={tr("Custom tracks")}
        icon={<Pencil className="w-4 h-4 text-accent" />}
        hint={tr("Built by you")}
        empty={tr("Tracks you build with a GPS lap show up here.")}
        tracks={custom}
        sessions={sessions}
        selectedId={current?.id}
        onPick={pick}
      />
      <TrackShelf
        title={tr("Favourite tracks")}
        icon={<Star className="w-4 h-4 text-accent fill-current" />}
        hint={tr("Starred")}
        empty={tr("Tap the star on any track to keep it here.")}
        tracks={favourites}
        sessions={sessions}
        selectedId={current?.id}
        onPick={pick}
      />

      {sessions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
            <History className="w-3 h-3" />{" "}{tr("Sessions")}
          </p>
          <div className="space-y-1.5">
            {sessions.slice(0, 12).map((s) => {
              const best = s.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0];
              return (
                <button key={s.id} onClick={() => onViewSession(s)} className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 px-3 py-2 text-left">
                  <span>
                    <span className="block text-sm font-medium">{s.trackName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {s.laps.length}{" "}{tr("laps")}
                      {role === 'pit' && s.riderName ? ` · ${s.riderName}` : ''}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-sm">{formatLap(best?.ms)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const km = (m: number | null) => (m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/** One horizontally scrolling row of track cards, like the card vault's shelves. */
export function TrackShelf({
  title,
  icon,
  hint,
  empty,
  tracks,
  sessions,
  selectedId,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  empty: string;
  tracks: TrackDef[];
  sessions: TrackSession[];
  selectedId?: string;
  onPick: (t: TrackDef) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground">{tracks.length}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground/70">{empty}</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tracks.map((t) => (
            <TrackCard key={t.id} track={t} best={bestFor(sessions, t.id)} selected={t.id === selectedId} onPick={() => onPick(t)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrackCard({ track: t, best, selected, onPick }: { track: TrackDef; best: number | null; selected: boolean; onPick: () => void }) {
  return (
    <div className={cn('relative snap-start flex-shrink-0 w-[46%] max-w-[190px] rounded-2xl border bg-card/50 p-2', selected ? 'border-accent' : 'border-border')}>
      <button onClick={onPick} className="w-full text-left" aria-label={tr("Select {0}", [t.name])}>
        <TrackMinimap className="aspect-square w-full p-1.5" outline={t.outline} startFinish={t.startFinish} splits={t.splits} />
        <span className="block mt-1.5 text-sm font-semibold leading-tight truncate">{t.name}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {[km(trackLength(t)), tr("{0} sectors", [t.splits.length + 1])].filter(Boolean).join(' · ')}
        </span>
        <span className="block text-[11px] text-muted-foreground font-mono">{tr("Best")}{" "}{formatLap(best)}</span>
      </button>
      <button
        onClick={() => toggleStar(t.id)}
        className={cn('absolute top-3 right-3 p-1.5 rounded-full frost-accent', t.starred ? 'text-accent' : 'text-muted-foreground')}
        aria-label={t.starred ? tr("Unfavourite {0}", [t.name]) : tr("Favourite {0}", [t.name])}
        aria-pressed={!!t.starred}
      >
        <Star className={cn('w-3.5 h-3.5', t.starred && 'fill-current')} />
      </button>
    </div>
  );
}

/** The picked track, its link line and main button (the racer's Ready up, the crew's QR for the racer). */
export function SelectedTrack({
  track,
  best,
  primary,
  linkLine,
  onEdit,
  onStar,
  onDelete,
  onClose,
}: {
  track: TrackDef;
  best: number | null;
  primary: { label: string; icon: React.ReactNode; onClick: (t: TrackDef) => void };
  linkLine?: { text: string; onClick: () => void };
  onEdit: () => void;
  onStar: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  return (
    <div className="rounded-3xl border-2 border-accent bg-card/60 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-accent">{tr("Selected track")}</p>
          <p className="text-lg font-bold leading-tight truncate">{track.name}</p>
          <p className="text-xs text-muted-foreground">
            {[km(trackLength(track)), tr("{0} sectors", [track.splits.length + 1]), tr("Best {0}", [formatLap(best)])].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={onStar} className={cn('p-2 rounded-lg', track.starred ? 'text-accent' : 'text-muted-foreground')} aria-label={track.starred ? tr("Unstar") : tr("Star")} aria-pressed={!!track.starred}>
          <Star className={cn('w-5 h-5', track.starred && 'fill-current')} />
        </button>
        <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground" aria-label={tr("Close")}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <TrackMinimap className="aspect-[4/3] w-full" outline={track.outline} startFinish={track.startFinish} splits={track.splits} />
      {linkLine && (
        <button onClick={linkLine.onClick} className="w-full flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs">
          <Users className="w-4 h-4 text-accent shrink-0" />
          <span className="flex-1">{linkLine.text}</span>
          <QrCode className="w-4 h-4 shrink-0" />
        </button>
      )}
      <Button className="w-full h-14 text-lg font-bold gap-2" onClick={() => primary.onClick(track)}>
        {primary.icon}{" "}{primary.label}
      </Button>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 gap-1" onClick={onEdit}>
          <Pencil className="w-4 h-4" />{" "}{tr("Edit lines")}
        </Button>
        <Button
          variant="ghost"
          className={cn('flex-1 gap-1', confirmDelete ? 'text-destructive-foreground bg-destructive' : 'text-destructive')}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
        >
          <Trash2 className="w-4 h-4" /> {confirmDelete ? tr("Tap to delete") : tr("Delete")}
        </Button>
      </div>
    </div>
  );
}

export function bestFor(sessions: TrackSession[], trackId: string): number | null {
  let best: number | null = null;
  for (const s of sessions) {
    if (s.trackId !== trackId) continue;
    for (const l of s.laps) if (l.valid && (best === null || l.ms < best)) best = l.ms;
  }
  return best;
}
