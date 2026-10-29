import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Water drawn as the app backdrop's "BLACKTOP" wordmark: rows of the word,
 * alternate rows offset by half, in a faint tint of the accent over the water
 * colour. It's a static fill-pattern (one small image the GPU tiles), so it
 * costs nothing per frame. Call once the style is ready, and again when the
 * accent changes. Under satellite the basemap's water gives way to the picture,
 * so `satellite-water-wordmark` (BlacktopMap) draws the words alone over the
 * real water: the same pattern with no water colour behind it.
 */

const WATER_LAYER = 'water';
const IMAGE_ID = 'blacktop-water-wordmark';
const SATELLITE_LAYER = 'satellite-water-wordmark';
const SATELLITE_IMAGE_ID = 'blacktop-water-wordmark-sat';
const PIXEL_RATIO = 2;
const WORD = 'BLACKTOP';
const FONT_PX = 7;
const ROW_PX = 9;
const GAP_PX = 4; // space between words along a row
/** The word squeezed sideways, so it reads small and condensed like the backdrop's. */
const SQUEEZE = 0.8;

export function applyWaterWordmark(map: MapLibreMap, accent: string) {
  const layer = map.getLayer(WATER_LAYER);
  if (!layer || layer.type !== 'fill') return;
  const base = String(map.getPaintProperty(WATER_LAYER, 'fill-color') ?? 'hsl(212, 30%, 13%)');

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return;
  const font = `700 ${FONT_PX * PIXEL_RATIO}px Inter, system-ui, sans-serif`;
  probe.font = font;
  // Whole pixels so the tile repeats without a seam.
  const cellW = Math.ceil(probe.measureText(WORD).width * SQUEEZE + GAP_PX * PIXEL_RATIO);
  const width = cellW;
  const height = ROW_PX * 2 * PIXEL_RATIO;

  const draw = (behind: string | null, alpha: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (behind) {
      ctx.fillStyle = behind;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.globalAlpha = alpha;
    const rowH = ROW_PX * PIXEL_RATIO;
    // Row 1 starts at the left edge; row 2 is offset by half a cell and wraps.
    const word = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(SQUEEZE, 1);
      ctx.fillText(WORD, 0, 0);
      ctx.restore();
    };
    word(0, rowH / 2);
    for (const x of [cellW / 2, cellW / 2 - cellW]) word(x, rowH + rowH / 2);

    const img = ctx.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8Array(img.data.buffer) };
  };
  const put = (id: string, data: ReturnType<typeof draw>) => {
    if (!data) return;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, data, { pixelRatio: PIXEL_RATIO });
  };
  put(IMAGE_ID, draw(base, 0.24));
  map.setPaintProperty(WATER_LAYER, 'fill-pattern', IMAGE_ID);
  // Over the satellite picture: the words alone, a little stronger to read on real water.
  if (map.getLayer(SATELLITE_LAYER)) {
    put(SATELLITE_IMAGE_ID, draw(null, 0.38));
    map.setPaintProperty(SATELLITE_LAYER, 'fill-pattern', SATELLITE_IMAGE_ID);
  }
}
