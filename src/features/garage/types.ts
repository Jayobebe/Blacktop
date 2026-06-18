export interface BikePhotos {
  /** Pixelated front-right quarter view, used as the diorama hero. */
  hero: string; // data URL
}

/**
 * Where & how big the bike PNG sits on the shop floor.
 * - xPct: horizontal center, 0 = left edge, 100 = right edge
 * - yPct: vertical position from bottom, 0 = floor, 100 = ceiling
 * - scalePct: bike height as % of diorama height (20 – 100)
 */
export interface BikePlacement {
  xPct: number;
  yPct: number;
  scalePct: number;
}

export const DEFAULT_BIKE_PLACEMENT: BikePlacement = {
  xPct: 38,
  yPct: 10,
  scalePct: 70,
};

export type MaintPartKey =
  | 'chain-lube'
  | 'chain-replace'
  | 'engine-oil'
  | 'brake-pads'
  | 'tyres'
  | 'air-filter'
  | 'custom';

export interface MaintItem {
  id: string;
  name: string;
  intervalKm: number; // service interval in km
  lastServiceKm: number; // odometer reading at last service (km)
  notes?: string;
}

export interface Bike {
  id: string;
  name: string;
  makeModel?: string;
  createdAt: number;
  photos: BikePhotos;
  placement?: BikePlacement;
  baseOdometerKm: number; // odometer when bike was added
  maintenance: MaintItem[];
}

export interface GarageState {
  bikes: Bike[];
  activeBikeId: string | null;
}

export const GARAGE_STORAGE_KEY = 'bt.garage.v1';

export const DEFAULT_MAINT_TEMPLATES: { key: MaintPartKey; name: string; intervalKm: number }[] = [
  { key: 'chain-lube', name: 'Chain lube', intervalKm: 500 },
  { key: 'engine-oil', name: 'Engine oil', intervalKm: 5000 },
  { key: 'brake-pads', name: 'Brake pads', intervalKm: 10000 },
  { key: 'air-filter', name: 'Air filter', intervalKm: 12000 },
  { key: 'chain-replace', name: 'Chain & sprockets', intervalKm: 15000 },
  { key: 'tyres', name: 'Tyres', intervalKm: 8000 },
];
