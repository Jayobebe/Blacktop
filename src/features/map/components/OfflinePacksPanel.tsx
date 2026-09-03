import { useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Download, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  deletePack,
  downloadPack,
  estimatePack,
  formatBytes,
  listPacks,
  MAX_PACK_TILES,
  OfflinePack,
  PACK_MAX_ZOOM,
  PACK_MIN_ZOOM,
  PackBounds,
} from '../lib/offlinePacks';

interface Props {
  map: MapLibreMap | null;
  onClose: () => void;
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
export function OfflinePacksPanel({ map, onClose }: Props) {
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

  const bounds: PackBounds | null = useMemo(() => {
    if (!map) return null;
    const b = map.getBounds();
    return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }, [map, progress]);

  const estimate = bounds && templates.length > 0 ? estimatePack(bounds, templates) : null;
  const totalStored = packs.reduce((sum, p) => sum + p.bytes, 0);

  const handleDownload = async () => {
    if (!map || !bounds || templates.length === 0 || progress) return;
    if (estimate?.tooLarge) {
      toast.error('Zoom in a little — that area is too big to store offline.');
      return;
    }
    const centre = map.getCenter();
    const name = `Area ${centre.lat.toFixed(2)}, ${centre.lng.toFixed(2)}`;
    setProgress({ done: 0, total: estimate?.tileCount ?? 0 });
    const pack = await downloadPack({
      name,
      bounds,
      templates,
      onProgress: (p) => setProgress({ done: p.done, total: p.total }),
    });
    setProgress(null);
    if (!pack) {
      toast.error('Offline download failed');
      return;
    }
    setPacks(listPacks());
    toast.success(`Saved offline · ${formatBytes(pack.bytes)}`);
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
          <h2 className="text-sm font-semibold">Offline maps</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close offline maps" className="p-1 rounded hover:bg-secondary">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Saves the area you're looking at (zoom {PACK_MIN_ZOOM}–{PACK_MAX_ZOOM}) so it still draws with no signal.
      </p>

      {estimate && (
        <div className="text-xs mb-3">
          <span className="text-muted-foreground">This view: </span>
          <span className="font-medium">{estimate.tileCount.toLocaleString()} tiles · ~{formatBytes(estimate.bytes)}</span>
          {estimate.tooLarge && (
            <span className="block text-destructive mt-1">
              Too large (max {MAX_PACK_TILES.toLocaleString()} tiles) — zoom in and try again.
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
          'Download this area'
        )}
      </button>

      {packs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Saved areas</span>
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
                  aria-label={`Delete ${p.name}`}
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
