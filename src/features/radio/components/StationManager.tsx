import { useState } from 'react';
import { X, Plus, Trash2, Pencil, FolderOpen, FileMusic, Check, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ACCENT_COLORS, type AccentColor } from '@/features/settings';
import { useRadioStations, createStation, updateStation, deleteStation, addTracks, removeTrack } from '../hooks/useRadioStations';
import { useRadioPlayer, playStation, resetRadio } from '../hooks/useRadioPlayer';
import { RADIO_ICONS, getRadioIcon, stationHsl } from '../lib/stationVisuals';
import { pickAudioFiles, pickAudioFolder, supportsDirectoryPicker, hasSessionFile } from '../lib/audioFiles';
import type { RadioIcon, RadioStation, RadioTrack } from '../types';
import { tr } from '@/lib/i18n';

interface Props {
  onClose: () => void;
}

/** Create / rename / recolor / retrack / delete stations. All local, no upload. */
export function StationManager({ onClose }: Props) {
  const { stations } = useRadioStations();
  const player = useRadioPlayer();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(stations.length === 0);

  // Draft state for the create form
  const [name, setName] = useState('');
  const [color, setColor] = useState<AccentColor>('orange');
  const [icon, setIcon] = useState<RadioIcon>('radio');
  const [tracks, setTracks] = useState<RadioTrack[]>([]);
  const [busy, setBusy] = useState(false);

  const resetDraft = () => {
    setName(''); setColor('orange'); setIcon('radio'); setTracks([]);
  };

  const pick = async (folder: boolean) => {
    setBusy(true);
    try {
      const result = folder ? await pickAudioFolder() : await pickAudioFiles();
      if (!result.tracks.length) return;
      setTracks((prev) => [...prev, ...result.tracks]);
      if (!result.persistent) {
        toast.info(tr("This browser can't remember files"), { description: tr("You'll be asked to reselect them next session.") });
      }
    } finally {
      setBusy(false);
    }
  };

  const pickInto = async (station: RadioStation, folder: boolean) => {
    const result = folder ? await pickAudioFolder() : await pickAudioFiles();
    if (!result.tracks.length) return;
    await addTracks(station.id, result.tracks);
    toast.success(tr("Added {0} track{1}", [result.tracks.length, result.tracks.length === 1 ? '' : 's']));
  };

  const save = async () => {
    if (!tracks.length) { toast.error(tr("Pick at least one audio file")); return; }
    const station = await createStation({ name: name || tr("New Station"), color, icon, tracks });
    resetDraft();
    setCreating(false);
    toast.success(tr("{0} is on air", [station.name]));
    void playStation(station);
  };

  return (
    <div className="fixed inset-0 z-[95] safe-frame-x bg-background/95 backdrop-blur-xl flex flex-col animate-fade-in">
      {/* Clear of the notch / Dynamic Island; the sides are the overlay's safe-frame-x. */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50" style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">{tr("Stations")}</p>
          <p className="text-xs text-muted-foreground">{tr("Your own files. Nothing leaves the phone.")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={tr("Close station manager")} className="glove-hit w-9 h-9 rounded-full bg-secondary hover:bg-muted flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 safe-bottom">
        {/* Existing stations */}
        {stations.map((station) => {
          const Icon = getRadioIcon(station.icon);
          const hsl = stationHsl(station.color);
          const isEditing = editingId === station.id;
          const missing = station.tracks.filter((t) => !t.handle && !hasSessionFile(t.id)).length;
          return (
            <div key={station.id} className="rounded-2xl border border-border bg-card/70 p-3">
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center border shrink-0"
                  style={{ backgroundColor: `hsl(${hsl} / 0.15)`, borderColor: `hsl(${hsl} / 0.5)`, color: `hsl(${hsl})` }}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      value={station.name}
                      onChange={(e) => void updateStation(station.id, { name: e.target.value })}
                      aria-label={tr("Station name")}
                      className="w-full bg-secondary rounded-lg px-2 py-1 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-semibold truncate">{station.name}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {station.tracks.length === 1 ? tr("1 track") : tr("{0} tracks", [station.tracks.length])}
                    {missing > 0 && tr(" · {0} need reselecting", [missing])}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : station.id)}
                  aria-label={isEditing ? tr("Done editing station") : tr("Edit station")}
                  className="w-9 h-9 rounded-full bg-secondary hover:bg-muted flex items-center justify-center"
                >
                  {isEditing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (player.stationId === station.id) resetRadio();
                    await deleteStation(station.id);
                    toast.success(tr("Station deleted"));
                  }}
                  aria-label={tr("Delete {0}", [station.name])}
                  className="w-9 h-9 rounded-full bg-secondary hover:bg-destructive/20 text-destructive flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {isEditing && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void updateStation(station.id, { color: c.id })}
                        aria-label={tr("{0} cover", [c.label])}
                        className={cn('w-7 h-7 rounded-full border-2', station.color === c.id ? 'border-foreground' : 'border-transparent')}
                        style={{ backgroundColor: `hsl(${c.hsl})` }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RADIO_ICONS.map(({ id, Icon: I, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void updateStation(station.id, { icon: id })}
                        aria-label={tr("{0} icon", [label])}
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center border',
                          station.icon === id ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted-foreground',
                        )}
                      >
                        <I className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {station.tracks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs bg-secondary/60 rounded-lg px-2 py-1.5">
                        <FileMusic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{t.name}</span>
                        <button
                          type="button"
                          onClick={() => void removeTrack(station.id, t.id)}
                          aria-label={tr("Remove {0}", [t.name])}
                          className="text-destructive"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => void pickInto(station, false)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-border rounded-lg py-2">
                      <Plus className="w-3.5 h-3.5" />{" "}{tr("Add files")}
                    </button>
                    {supportsDirectoryPicker() && (
                      <button type="button" onClick={() => void pickInto(station, true)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-border rounded-lg py-2">
                        <FolderOpen className="w-3.5 h-3.5" />{" "}{tr("Add folder")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Create form */}
        {creating ? (
          <div className="rounded-2xl border border-accent/60 bg-card/70 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">{tr("New station")}</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("Station name")}
              aria-label={tr("New station name")}
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-label={tr("{0} cover", [c.label])}
                  className={cn('w-7 h-7 rounded-full border-2', color === c.id ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: `hsl(${c.hsl})` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {RADIO_ICONS.map(({ id, Icon: I, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIcon(id)}
                  aria-label={tr("{0} icon", [label])}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center border',
                    icon === id ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted-foreground',
                  )}
                >
                  <I className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void pick(false)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-border rounded-lg py-2 disabled:opacity-50">
                <Music className="w-3.5 h-3.5" />{" "}{tr("Pick files")}
              </button>
              {supportsDirectoryPicker() && (
                <button type="button" disabled={busy} onClick={() => void pick(true)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-border rounded-lg py-2 disabled:opacity-50">
                  <FolderOpen className="w-3.5 h-3.5" />{" "}{tr("Pick folder")}
                </button>
              )}
            </div>

            {tracks.length > 0 && (
              <p className="text-[11px] text-muted-foreground">{tracks.length === 1 ? tr("1 track queued") : tr("{0} tracks queued", [tracks.length])}</p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => { resetDraft(); setCreating(false); }} className="flex-1 text-xs border border-border rounded-lg py-2">
                {tr("Cancel")}
              </button>
              <button type="button" onClick={() => void save()} className="flex-1 text-xs rounded-lg py-2 bg-accent text-accent-foreground font-semibold">
                {tr("Save station")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-accent/60 text-accent text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />{" "}{tr("Add Station")}
          </button>
        )}
      </div>
    </div>
  );
}
