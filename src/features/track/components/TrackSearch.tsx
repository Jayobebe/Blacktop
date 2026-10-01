import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Library, Loader2, MapPin, Search, Star, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LatLng, TrackDef } from '../types';
import { LIBRARY_ATTRIBUTION, layoutLabel, loadCircuitIndex, nearbyVenues, searchVenues, type LibraryCircuit, type LibraryVenue } from '../lib/circuitLibrary';
import { trackLength } from '../lib/trackStore';
import { metres } from '../lib/geometry';
import { tr } from '@/lib/i18n';

const km = (m: number | null | undefined) => (m == null ? '' : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * Track Pack's search bar: the rider's own tracks first, then the circuit
 * library by venue. A venue with several layouts (Brands Hatch: Grand Prix,
 * Indy) opens to pick one; laps never include the pit lane. Empty and
 * focused, it lists circuits near the rider.
 */
export function TrackSearch({
  tracks,
  onPickTrack,
  onPickCircuit,
  loadingId,
}: {
  tracks: TrackDef[];
  onPickTrack: (t: TrackDef) => void;
  onPickCircuit: (c: LibraryCircuit) => void;
  /** A library layout being loaded (shows a spinner on its row). */
  loadingId?: number | null;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<LibraryCircuit[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [here, setHere] = useState<LatLng | null>(null);
  /** The venue whose layouts are showing. */
  const [openVenue, setOpenVenue] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCircuitIndex()
      .then(setIndex)
      .catch(() => setIndexFailed(true));
  }, []);

  // Position for "near you" and distance sorting: asked once, on first focus.
  const askedPos = useRef(false);
  const onFocus = () => {
    setOpen(true);
    if (askedPos.current) return;
    askedPos.current = true;
    navigator.geolocation?.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 8000 },
    );
  };

  // Close when tapping outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const query = q.trim().toLowerCase();
  const mine = useMemo(() => (query ? tracks.filter((t) => t.name.toLowerCase().includes(query)).slice(0, 5) : []), [tracks, query]);
  const imported = useMemo(() => new Set(tracks.map((t) => t.osmId).filter(Boolean)), [tracks]);
  const library = useMemo<LibraryVenue[]>(() => {
    if (!index) return [];
    return query ? searchVenues(index, query, here) : here ? nearbyVenues(index, here) : [];
  }, [index, query, here]);

  const pickCircuit = (c: LibraryCircuit) => {
    onPickCircuit(c);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={onFocus}
        placeholder={tr("Search tracks (e.g. Brands Hatch Indy)")}
        className="pl-9 pr-9 h-12 rounded-2xl"
        aria-label={tr("Search tracks")}
      />
      {q && (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ('')} aria-label={tr("Clear search")}>
          <X className="w-4 h-4" />
        </button>
      )}

      {open && (query || library.length > 0 || indexFailed) && (
        <div className="absolute z-30 mt-1.5 inset-x-0 rounded-2xl frost-accent shadow-xl overflow-hidden max-h-[60dvh] overflow-y-auto">
          {mine.length > 0 && (
            <Section title={tr("Your tracks")} icon={<Star className="w-3 h-3" />}>
              {mine.map((t) => (
                <Row
                  key={t.id}
                  name={t.name}
                  detail={[km(trackLength(t)), tr("{0} sectors", [t.splits.length + 1])].filter(Boolean).join(' · ')}
                  onClick={() => {
                    onPickTrack(t);
                    setOpen(false);
                  }}
                />
              ))}
            </Section>
          )}
          {library.length > 0 && (
            <Section title={query ? tr("Circuit library") : tr("Circuits near you")} icon={query ? <Library className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}>
              {library.map((v) => {
                const away = here ? tr("{0} km away", [Math.round(metres(here, v) / 1000)]) : null;
                const saved = (c: LibraryCircuit) => (imported.has(c.id) ? tr("Saved") : null);
                if (v.layouts.length === 1) {
                  const c = v.layouts[0];
                  return (
                    <Row
                      key={c.id}
                      name={c.name}
                      detail={[km(c.length), away, saved(c)].filter(Boolean).join(' · ')}
                      busy={loadingId === c.id}
                      onClick={() => pickCircuit(c)}
                    />
                  );
                }
                const shown = openVenue === v.name;
                return (
                  <div key={`${v.name}:${v.layouts[0].id}`}>
                    <Row
                      name={v.name}
                      detail={[tr("{0} layouts", [v.layouts.length]), away].filter(Boolean).join(' · ')}
                      expanded={shown}
                      onClick={() => setOpenVenue(shown ? null : v.name)}
                    />
                    {shown &&
                      v.layouts.map((c) => (
                        <Row
                          key={c.id}
                          name={layoutLabel(v, c)}
                          detail={[km(c.length), saved(c)].filter(Boolean).join(' · ')}
                          busy={loadingId === c.id}
                          nested
                          onClick={() => pickCircuit(c)}
                        />
                      ))}
                  </div>
                );
              })}
            </Section>
          )}
          {query && !mine.length && !library.length && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {index || indexFailed ? tr("No tracks by that name. Build it below with a GPS lap.") : tr("Searching…")}
            </p>
          )}
          {indexFailed && <p className="px-3 pb-2 text-[11px] text-destructive">{tr("The circuit library didn't load. Your own tracks still work.")}</p>}
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground/80 border-t border-border/40">{LIBRARY_ATTRIBUTION}</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  name,
  detail,
  busy,
  nested,
  expanded,
  onClick,
}: {
  name: string;
  detail: string;
  busy?: boolean;
  /** A layout under its venue. */
  nested?: boolean;
  /** A venue: whether its layouts are showing (adds the chevron). */
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-expanded={expanded}
      className={cn('w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 min-h-[48px]', nested && 'pl-7 border-l-2 border-accent/40 ml-3', busy && 'opacity-70')}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{name}</span>
        {detail && <span className="block text-[11px] text-muted-foreground">{detail}</span>}
      </span>
      {busy && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {expanded !== undefined && <ChevronDown className={cn('w-4 h-4 shrink-0 text-accent transition-transform', expanded && 'rotate-180')} />}
    </button>
  );
}
