import type { StyleSpecification } from 'maplibre-gl';
import { boostContrast } from './basemapContrast';

/**
 * Blacktop's dark basemap: OpenFreeMap's dark style with the contrast lifted
 * (see basemapContrast). Every map that shows the real world in the dark look
 * (the Blacktop map, ride flyovers) loads it here so they all match.
 */
export const OPENFREEMAP_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

let promise: Promise<StyleSpecification> | null = null;

export function loadDarkMapStyle(): Promise<StyleSpecification> {
  if (!promise) {
    promise = fetch(OPENFREEMAP_DARK_STYLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Dark style fetch failed: ${res.status}`);
        return res.json() as Promise<StyleSpecification>;
      })
      .then(boostContrast)
      .catch((e) => {
        promise = null; // let the next map try again
        throw e;
      });
  }
  return promise;
}
