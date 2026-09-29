import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * MapLibre 6 finds its worker next to its own module file, which doesn't exist
 * once the library is bundled (or pre-bundled by the dev server). Vite builds
 * the worker, with the shared code it imports, into one file and gives us its
 * URL. Import this module before creating any map.
 */
setWorkerUrl(workerUrl);
