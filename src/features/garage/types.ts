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
  | 'cabin-filter'
  | 'coolant'
  | 'wipers'
  | 'gear-cables'
  | 'tubeless-sealant'
  | 'battery-check'
  | 'bolt-check'
  | 'custom';

export interface MaintItem {
  id: string;
  name: string;
  intervalKm: number; // service interval in km
  lastServiceKm: number; // odometer reading at last service (km)
  /** Optional time-based reminder: service every N months regardless of miles. */
  intervalMonths?: number;
  /** Epoch ms of the last service; set whenever "Serviced" is tapped. */
  lastServiceAt?: number;
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

/** Car-appropriate presets — no chain, longer intervals. */
export const CAR_MAINT_TEMPLATES: { key: MaintPartKey; name: string; intervalKm: number }[] = [
  { key: 'engine-oil', name: 'Engine oil', intervalKm: 15000 },
  { key: 'tyres', name: 'Tyres', intervalKm: 40000 },
  { key: 'brake-pads', name: 'Brake pads', intervalKm: 40000 },
  { key: 'air-filter', name: 'Air filter', intervalKm: 30000 },
  { key: 'cabin-filter', name: 'Cabin filter', intervalKm: 20000 },
  { key: 'coolant', name: 'Coolant', intervalKm: 60000 },
  { key: 'wipers', name: 'Wiper blades', intervalKm: 20000 },
];

/** Bicycle / e-bike presets — short intervals, no engine. */
export const CYCLE_MAINT_TEMPLATES: { key: MaintPartKey; name: string; intervalKm: number }[] = [
  { key: 'chain-lube', name: 'Chain clean & lube', intervalKm: 300 },
  { key: 'tyres', name: 'Tyres', intervalKm: 4000 },
  { key: 'brake-pads', name: 'Brake pads', intervalKm: 2000 },
  { key: 'gear-cables', name: 'Gear cables', intervalKm: 5000 },
  { key: 'tubeless-sealant', name: 'Tubeless sealant', intervalKm: 1500 },
  { key: 'chain-replace', name: 'Chain', intervalKm: 3000 },
];

/** E-scooter presets. */
export const SCOOTER_MAINT_TEMPLATES: { key: MaintPartKey; name: string; intervalKm: number }[] = [
  { key: 'tyres', name: 'Tyres', intervalKm: 2000 },
  { key: 'brake-pads', name: 'Brakes', intervalKm: 1500 },
  { key: 'bolt-check', name: 'Folding joint & bolts', intervalKm: 500 },
  { key: 'battery-check', name: 'Battery health check', intervalKm: 3000 },
];
