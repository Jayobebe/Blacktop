import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * MapLibre 6 finds its worker next to its own module file, which doesn't exist
 * once the library is bundled (or pre-bundled by the dev server). Vite builds
 * the worker, with the shared code it imports, into one file and gives us its
 * URL. Import this module before creating any map.
 */
setWorkerUrl(workerUrl);

/**
 * Pass as every map's `pixelRatio`: at most 2x. Phones are 3x, which renders
 * 2.25x the pixels of 2x for detail nobody sees on a moving map; this is the
 * map's single biggest GPU cost.
 */
export const MAP_PIXEL_RATIO = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
