import { useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Download, FileUp, Loader2, Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import { parseGpx, type GpxRoute } from '../lib/gpx';
import { toast } from 'sonner';
import {
  deletePack,
  downloadPack,
  boundsAround,
  estimateTiles,
  tilesForBounds,
  tilesForCorridor,
  formatBytes,
  listPacks,
  MAX_PACK_TILES,
  OfflinePack,
  PACK_MAX_ZOOM,
  PACK_MIN_ZOOM,
  PackBounds,
} from '../lib/offlinePacks';
import { tr } from '@/lib/i18n';

interface Props {
  map: MapLibreMap | null;
  onClose: () => void;
  /** Rider's GPS fix: without a route, the pack is ~15 km around it. */
  userLocation?: { lat: number; lng: number } | null;
  /** Active route line ([lng,lat]); when set, the whole route corridor is saved. */
  routeCoords?: [number, number][] | null;
  routeName?: string | null;
  onImportGpx?: (route: GpxRoute) => void;
}

const CACHE_PREFIX = 'blacktop-tile://';

/**
 * Collects the concrete {z}/{x}/{y} tile templates the current style is using,
 * resolving TileJSON-backed sources so vector basemaps can be packed too.
 */
async function getTileTemplates(map: MapLibreMap): Promise<string[]> {
  const style = map.getStyle();
  const templates: string[] = [];
  const sources = style?.sources ?? {};

  for (const source of Object.values(sources) as Record<string, unknown>[]) {
    const type = source?.type;
    if (type !== 'vector' && type !== 'raster') continue;

    const tiles = source.tiles as string[] | undefined;
    if (Array.isArray(tiles) && tiles.length > 0) {
      templates.push(tiles[0].replace(CACHE_PREFIX, ''));
      continue;
    }

    const url = source.url as string | undefined;
    if (typeof url === 'string' && url.startsWith('http')) {
      try {
        const res = await fetch(url);
        const tj = await res.json();
        if (Array.isArray(tj?.tiles) && tj.tiles.length > 0) {
          templates.push(String(tj.tiles[0]).replace(CACHE_PREFIX, ''));
        }
      } catch {
        // Skip sources we can't resolve — the pack just covers fewer layers.
      }
    }
  }
  return templates;
}

/** Download-for-offline manager for the current map viewport. */
export function OfflinePacksPanel({ map, onClose, userLocation, routeCoords, routeName, onImportGpx }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [packs, setPacks] = useState<OfflinePack[]>(() => listPacks());
  const [templates, setTemplates] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    void getTileTemplates(map).then((t) => {
      if (!cancelled) setTemplates(t);
    });
    return () => { cancelled = true; };
  }, [map]);

  const mode: 'route' | 'local' | 'view' =
    routeCoords && routeCoords.length > 1 ? 'route' : userLocation ? 'local' : 'view';

  const plan = useMemo(() => {
    if (!map) return null;
    let bounds: PackBounds;
    let tiles;
    if (mode === 'route') {
      const lngs = routeCoords!.map((c) => c[0]);
      const lats = routeCoords!.map((c) => c[1]);
      bounds = { west: Math.min(...lngs), east: Math.max(...lngs), south: Math.min(...lats), north: Math.max(...lats) };
      tiles = tilesForCorridor(routeCoords!);
    } else if (mode === 'local') {
      bounds = boundsAround(userLocation!.lat, userLocation!.lng, 15);
      tiles = tilesForBounds(bounds);
    } else {
      const b = map.getBounds();
      bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      tiles = tilesForBounds(bounds);
    }
    return { bounds, tiles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode, routeCoords, userLocation?.lat, userLocation?.lng]);

  const bounds = plan?.bounds ?? null;
  const estimate = plan && templates.length > 0 ? estimateTiles(plan.tiles, templates) : null;
  const totalStored = packs.reduce((sum, p) => sum + p.bytes, 0);

  const handleDownload = async () => {
    if (!map || !bounds || templates.length === 0 || progress) return;
    if (estimate?.tooLarge) {
      toast.error(tr("Zoom in a little — that area is too big to store offline."));
      return;
    }
    const centre = map.getCenter();
    const name =
      mode === 'route'
        ? tr("Route · {0}", [routeName || tr("planned ride")])
        : mode === 'local'
          ? tr("Around {0}, {1} (15 km)", [userLocation!.lat.toFixed(2), userLocation!.lng.toFixed(2)])
          : tr("Area {0}, {1}", [centre.lat.toFixed(2), centre.lng.toFixed(2)]);
    setProgress({ done: 0, total: estimate?.tileCount ?? 0 });
    const pack = await downloadPack({
      name,
      bounds,
      templates,
      tiles: plan?.tiles,
      onProgress: (p) => setProgress({ done: p.done, total: p.total }),
    });
    setProgress(null);
    if (!pack) {
      toast.error(tr("Offline download failed"));
      return;
    }
    setPacks(listPacks());
    toast.success(tr("Saved offline · {0}", [formatBytes(pack.bytes)]));
  };

  const handleDelete = async (id: string) => {
    await deletePack(id);
    setPacks(listPacks());
  };

  return (
    <div className="absolute inset-x-3 top-20 z-40 rounded-xl border border-border bg-card/95 backdrop-blur p-4 shadow-2xl max-w-md mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">{tr("Offline maps")}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={tr("Close offline maps")} className="p-1 rounded hover:bg-secondary">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {mode === 'route'
          ? tr("Saves the whole route, plus a strip either side, so it still draws with no signal.")
          : mode === 'local'
            ? tr("Saves about 15 km around you so the map still draws with no signal. Set a route to save the whole ride instead.")
            : <>{tr("Saves the area you're looking at (zoom")}{" "}{PACK_MIN_ZOOM}–{PACK_MAX_ZOOM}{tr(") so it still draws with no signal.")}</>}
      </p>

      {estimate && (
        <div className="text-xs mb-3">
          <span className="text-muted-foreground">{mode === 'route' ? tr("This route:") : mode === 'local' ? tr("Around you:") : tr("This view:")}{" "}</span>
          <span className="font-medium">{estimate.tileCount.toLocaleString()}{" "}{tr("tiles · ~")}{formatBytes(estimate.bytes)}</span>
          {estimate.tooLarge && (
            <span className="block text-destructive mt-1">
              {tr("Too large (max")}{" "}{MAX_PACK_TILES.toLocaleString()}{" "}{mode === 'route' ? tr("tiles) — try a shorter route.") : tr("tiles) — zoom in and try again.")}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={!estimate || estimate.tooLarge || !!progress}
        className="w-full h-10 rounded-lg border border-accent text-accent font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {progress ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {progress.done}/{progress.total}</>
        ) : (
          mode === 'route' ? tr("Download route") : mode === 'local' ? tr("Download area around me") : tr("Download this area")
        )}
      </button>

      {onImportGpx && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const route = parseGpx(await f.text(), f.name.replace(/\.gpx$/i, ''));
              if (!route) {
                toast.error(tr("Couldn't read that GPX file"));
                return;
              }
              onImportGpx(route);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-2 w-full h-10 rounded-lg frost-accent font-medium text-sm flex items-center justify-center gap-2"
          >
            <FileUp className="w-4 h-4" /> {tr("Import GPX route")}
          </button>
        </>
      )}

      {packs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{tr("Saved areas")}</span>
            <span>{formatBytes(totalStored)}</span>
          </div>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {packs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{formatBytes(p.bytes)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  aria-label={tr("Delete {0}", [p.name])}
                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
