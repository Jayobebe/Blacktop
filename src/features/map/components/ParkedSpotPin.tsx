import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Footprints, SquareParking, X } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { clearParkedSpot, parkedLevelText, setParkedLevel, useParkedSpot, walkBackUrl } from '@/lib/parkedSpot';
import { metresText } from '@/lib/units';

function ago(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return tr("Parked just now");
  if (min < 60) return tr("Parked {0} min ago", [min]);
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? tr("Parked 1 hour ago") : tr("Parked {0} hours ago", [h]);
  const d = Math.round(h / 24);
  return d === 1 ? tr("Parked yesterday") : tr("Parked {0} days ago", [d]);
}

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371e3;
}

/**
 * The parked spot (lib/parkedSpot) on the Blacktop map: a P pin where the
 * last ride ended, hidden during a ride. Tapping it opens a small card above
 * it: how long ago, how far away, the floor and bay (a multi-storey, where GPS
 * can't tell floors apart: typed after the ride or here), Walk back (walking
 * directions in the phone's own maps app) and a cross to forget it.
 */
export function ParkedSpotPin({ map, hidden, rider }: { map: MapLibreMap | null; hidden: boolean; rider: { lat: number; lng: number } | null }) {
  const spot = useParkedSpot();
  const [open, setOpen] = useState(false);
  const el = useMemo(() => {
    const d = document.createElement('div');
    d.className = 'parked-pin';
    return d;
  }, []);

  useEffect(() => {
    if (!map || !spot || hidden) return;
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([spot.lng, spot.lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, spot?.lat, spot?.lng, hidden, el]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!spot || hidden) setOpen(false);
  }, [spot, hidden]);

  if (!spot || hidden) return null;
  const away = rider ? metresBetween(rider, spot) : null;
  const level = parkedLevelText(spot);

  return createPortal(
    <div className="relative flex flex-col items-center" data-no-pull>
      {open && (
        <div
          className="absolute bottom-full mb-2 w-60 rounded-2xl bg-card frost-accent border p-3 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{ago(spot.at)}</p>
              {away != null && away > 30 && <p className="text-[11px] text-muted-foreground">{tr("{0} away", [metresText(away)])}</p>}
            </div>
            <button
              type="button"
              aria-label={tr("Forget parked spot")}
              onClick={() => clearParkedSpot()}
              className="glove-hit relative -mr-1 -mt-1 p-1 rounded-lg text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] text-muted-foreground mb-0.5">{tr("Floor")}</span>
              <input
                defaultValue={spot.floor ?? ''}
                onChange={(e) => setParkedLevel({ floor: e.target.value })}
                placeholder={tr("Floor")}
                aria-label={tr("Floor")}
                maxLength={12}
                className="w-full h-10 rounded-lg bg-background/60 border border-border/50 px-2 text-sm"
                autoComplete="off"
                />
            </label>
            <label className="block">
              <span className="block text-[10px] text-muted-foreground mb-0.5">{tr("Bay")}</span>
              <input
                defaultValue={spot.bay ?? ''}
                onChange={(e) => setParkedLevel({ bay: e.target.value })}
                placeholder={tr("Bay")}
                aria-label={tr("Bay")}
                maxLength={12}
                className="w-full h-10 rounded-lg bg-background/60 border border-border/50 px-2 text-sm"
                autoComplete="off"
                />
            </label>
          </div>
          <a
            href={walkBackUrl(spot)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center justify-center gap-2 h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
          >
            <Footprints className="w-4 h-4" />
            {tr("Walk back")}
          </a>
        </div>
      )}
      <button
        type="button"
        aria-label={tr("Parked spot")}
        onClick={() => setOpen((o) => !o)}
        className="glove-hit relative flex flex-col items-center"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent text-accent-foreground border-2 border-white shadow-lg">
          <SquareParking className="w-5 h-5" />
        </span>
        <span className="w-0.5 h-2.5 bg-white" />
        {level && !open && (
          <span className="absolute top-full mt-0.5 whitespace-nowrap rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">{level}</span>
        )}
      </button>
    </div>,
    el,
  );
}
