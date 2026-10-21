/**
 * The Garage ledger: what each vehicle costs to run. Fill-ups (fuel or
 * charge, from a paused ride's "Filling up?" or added by hand), what's spent on
 * it (service, parts, insurance, tax, kit), and the parts fitted with how worn
 * they are. Kept on the phone (`blacktop_ledger`, carried by backups); demo
 * mode shows a sample for the demo bike and saves nothing.
 *
 * Amounts are kept metric (litres, kWh, km) and shown in the rider's units;
 * money in the currency it was paid in (the ledger's currency, from the
 * phone's region until the rider picks one).
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';
import { DEMO_BIKE_ID, isDemoModeActive, onDemoModeChange } from '@/lib/demoMode';
import { getExperience } from '@/features/experience/lib/profile';
import type { VehicleType } from '@/features/experience/lib/vehicles';

export type Power = 'fuel' | 'electric' | 'none';
export type FuelType = 'unleaded' | 'super' | 'diesel' | 'premium_diesel' | 'lpg' | 'home' | 'ac' | 'dc';
export const FUELS: FuelType[] = ['unleaded', 'super', 'diesel', 'premium_diesel', 'lpg'];
export const CHARGES: FuelType[] = ['home', 'ac', 'dc'];
export type CostCategory = 'service' | 'parts' | 'insurance' | 'tax' | 'kit' | 'other';
export const COST_CATEGORIES: CostCategory[] = ['service', 'parts', 'insurance', 'tax', 'kit', 'other'];
export type PartKind = 'tyre_front' | 'tyre_rear' | 'chain' | 'pads' | 'battery' | 'other';
export const PART_KINDS: PartKind[] = ['tyre_front', 'tyre_rear', 'chain', 'pads', 'battery', 'other'];

export interface Station {
  /** OpenStreetMap id, "op:<id>", when it came from the map (price sharing needs it). */
  id?: string;
  name: string;
  lat: number;
  lng: number;
}
export interface Fill {
  id: string;
  at: number;
  /** Odometer at the fill-up, km. */
  odometerKm: number;
  fuel: FuelType;
  /** Litres, or kWh for charging. */
  amount: number;
  paid: number;
  currency: string;
  /** Filled to full (economy is worked out only between two of these). */
  full: boolean;
  station?: Station;
  /** Charging: how long the ride stood paused. */
  minutes?: number;
  /** Shared to the map's fuel prices. */
  shared?: boolean;
}
export interface Cost {
  id: string;
  at: number;
  category: CostCategory;
  amount: number;
  currency: string;
  note?: string;
  /** A photo of the receipt, shrunk (data URL). */
  photo?: string;
}
export interface Part {
  id: string;
  kind: PartKind;
  /** Brand and model, as the rider wrote it. */
  name: string;
  fittedAt: number;
  fittedKm: number;
  /** How far it's expected to last, km. */
  lifeKm?: number;
  replacedAt?: number;
  replacedKm?: number;
  /** Told once it passed 90 % (so it's said once). */
  warned?: boolean;
}
export interface VehicleLedger {
  power?: Power;
  /** Litres, or kWh for a battery. */
  tank?: number;
  /** The fuel or charge picked last, offered first next time. */
  lastFuel?: FuelType;
  fills: Fill[];
  costs: Cost[];
  parts: Part[];
}
export interface Ledger {
  currency?: string;
  /** Opted in to sharing station prices ("Help map fuel prices"). */
  share?: boolean;
  vehicles: Record<string, VehicleLedger>;
}

const KEY = 'blacktop_ledger';
const empty = (): VehicleLedger => ({ fills: [], costs: [], parts: [] });

function read(): Ledger {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object' && v.vehicles && typeof v.vehicles === 'object') return v as Ledger;
  } catch {
    /* start afresh */
  }
  return { vehicles: {} };
}

let real: Ledger = typeof window !== 'undefined' ? read() : { vehicles: {} };
let demo: Ledger | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') onDemoModeChange(() => emit());

function commit(next: Ledger) {
  real = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this launch only */
  }
  emit();
}

const current = () => (isDemoModeActive() ? (demo ??= demoLedger()) : real);

export function useLedger(): Ledger {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    current,
  );
}
export const getLedger = current;
export const vehicleLedger = (l: Ledger, bikeId: string): VehicleLedger => l.vehicles[bikeId] ?? empty();

/** Changes one vehicle's ledger. In demo mode nothing is kept (the caller says so). */
export function updateVehicleLedger(bikeId: string, fn: (v: VehicleLedger) => VehicleLedger): boolean {
  if (isDemoModeActive()) return false;
  commit({ ...real, vehicles: { ...real.vehicles, [bikeId]: fn(vehicleLedger(real, bikeId)) } });
  return true;
}
export function setLedgerPrefs(patch: Partial<Pick<Ledger, 'currency' | 'share'>>): boolean {
  if (isDemoModeActive()) return false;
  commit({ ...real, ...patch });
  return true;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export function addFill(bikeId: string, fill: Omit<Fill, 'id'>): Fill | null {
  const f = { ...fill, id: newId() };
  return updateVehicleLedger(bikeId, (v) => ({ ...v, lastFuel: f.fuel, fills: [...v.fills, f].sort((a, b) => a.at - b.at) })) ? f : null;
}
export function addCost(bikeId: string, cost: Omit<Cost, 'id'>): boolean {
  return updateVehicleLedger(bikeId, (v) => ({ ...v, costs: [...v.costs, { ...cost, id: newId() }].sort((a, b) => a.at - b.at) }));
}
export function addPart(bikeId: string, part: Omit<Part, 'id'>): boolean {
  return updateVehicleLedger(bikeId, (v) => ({ ...v, parts: [...v.parts, { ...part, id: newId() }] }));
}

/**
 * A ledger handed over with a logbook (another phone's): only what fits the
 * shape is kept, as numbers and short text, and never a photo.
 */
export function importVehicleLedger(bikeId: string, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Partial<VehicleLedger>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const txt = (x: unknown, n = 80) => (typeof x === 'string' ? x.slice(0, n) : undefined);
  const list = <T,>(x: unknown, max: number) => (Array.isArray(x) ? (x.slice(0, max) as T[]) : []);
  const fills: Fill[] = list<Fill>(r.fills, 500)
    .filter((f) => f && [...FUELS, ...CHARGES].includes(f.fuel))
    .map((f) => ({ id: newId(), at: num(f.at), odometerKm: num(f.odometerKm), fuel: f.fuel, amount: num(f.amount), paid: num(f.paid), currency: txt(f.currency, 3) ?? 'GBP', full: !!f.full, station: f.station && typeof f.station === 'object' ? { name: txt(f.station.name) ?? '', lat: num(f.station.lat), lng: num(f.station.lng) } : undefined }));
  const costs: Cost[] = list<Cost>(r.costs, 300)
    .filter((c) => c && COST_CATEGORIES.includes(c.category))
    .map((c) => ({ id: newId(), at: num(c.at), category: c.category, amount: num(c.amount), currency: txt(c.currency, 3) ?? 'GBP', note: txt(c.note, 60) }));
  const parts: Part[] = list<Part>(r.parts, 100)
    .filter((p) => p && PART_KINDS.includes(p.kind))
    .map((p) => ({ id: newId(), kind: p.kind, name: txt(p.name, 50) ?? '', fittedAt: num(p.fittedAt), fittedKm: num(p.fittedKm), lifeKm: p.lifeKm ? num(p.lifeKm) : undefined, replacedAt: p.replacedAt ? num(p.replacedAt) : undefined, replacedKm: p.replacedKm ? num(p.replacedKm) : undefined }));
  const power = r.power === 'fuel' || r.power === 'electric' || r.power === 'none' ? r.power : undefined;
  updateVehicleLedger(bikeId, () => ({ power, tank: r.tank ? num(r.tank) : undefined, fills: fills.sort((a, b) => a.at - b.at), costs, parts }));
}

// ── What kind of power, and in what units ─────────────────────────────────

/** From the rider's main vehicle until the ledger says otherwise. */
export function powerOf(v: VehicleLedger | undefined): Power {
  if (v?.power) return v.power;
  const main = (getExperience().vehicles?.[0] ?? 'motorcycle') as VehicleType;
  return main === 'bicycle' ? 'none' : main === 'ebike' || main === 'escooter' ? 'electric' : 'fuel';
}

/** The phone's region ("GB", "US"). */
export function phoneRegion(): string {
  try {
    const loc = new Intl.Locale(navigator.language);
    return (loc.maximize().region || 'GB').toUpperCase();
  } catch {
    return 'GB';
  }
}
const REGION_CURRENCY: Record<string, string> = {
  GB: 'GBP', US: 'USD', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', HR: 'EUR', MT: 'EUR', CY: 'EUR', DK: 'DKK', NO: 'NOK', SE: 'SEK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  CH: 'CHF', TR: 'TRY', UA: 'UAH', IN: 'INR', ID: 'IDR', JP: 'JPY', KR: 'KRW', CN: 'CNY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', BR: 'BRL', MX: 'MXN', ZA: 'ZAR',
};
export const CURRENCIES = ['GBP', 'EUR', 'USD', 'DKK', 'NOK', 'SEK', 'PLN', 'CZK', 'HUF', 'CHF', 'TRY', 'UAH', 'INR', 'IDR', 'JPY', 'KRW', 'CNY', 'AUD', 'NZD', 'CAD', 'BRL', 'MXN', 'ZAR'];
export const ledgerCurrency = (l: Ledger) => l.currency || REGION_CURRENCY[phoneRegion()] || 'GBP';

export function moneyText(amount: number, currency: string, digits?: number): string {
  try {
    return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Fuel by the gallon where the pumps sell it so (the US); litres everywhere else. */
export const usesGallons = () => phoneRegion() === 'US';
const US_GAL = 3.785411784;
const UK_GAL = 4.54609;
export const litresFrom = (n: number) => (usesGallons() ? n * US_GAL : n);
export const volumeText = (litres: number) => (usesGallons() ? tr("{0} gal", [(litres / US_GAL).toFixed(1)]) : tr("{0} L", [litres.toFixed(1)]));
export const volumeUnit = () => (usesGallons() ? tr("Gallons") : tr("Litres"));

/** Economy in the rider's units: mpg (UK gallons in the UK, US elsewhere on miles), L/100 km, or per kWh. */
export function economyText(kmPerUnit: number, power: Power, miles: boolean): string {
  if (power === 'electric') return miles ? tr("{0} mi/kWh", [(kmPerUnit / 1.609344).toFixed(1)]) : tr("{0} km/kWh", [kmPerUnit.toFixed(1)]);
  if (miles) return tr("{0} mpg", [Math.round((kmPerUnit / 1.609344) * (phoneRegion() === 'GB' ? UK_GAL : US_GAL))]);
  return tr("{0} L/100 km", [(100 / kmPerUnit).toFixed(1)]);
}

export function fuelName(f: FuelType): string {
  switch (f) {
    case 'unleaded':
      return tr("Unleaded");
    case 'super':
      return tr("Super unleaded");
    case 'diesel':
      return tr("Diesel");
    case 'premium_diesel':
      return tr("Premium diesel");
    case 'lpg':
      return tr("LPG");
    case 'home':
      return tr("Home charger");
    case 'ac':
      return tr("Public charger");
    default:
      return tr("Rapid charger");
  }
}
export function costName(c: CostCategory): string {
  switch (c) {
    case 'service':
      return tr("Service");
    case 'parts':
      return tr("Parts");
    case 'insurance':
      return tr("Insurance");
    case 'tax':
      return tr("Tax");
    case 'kit':
      return tr("Kit");
    default:
      return tr("Other");
  }
}
export function partName(k: PartKind): string {
  switch (k) {
    case 'tyre_front':
      return tr("Front tyre");
    case 'tyre_rear':
      return tr("Rear tyre");
    case 'chain':
      return tr("Chain and sprockets");
    case 'pads':
      return tr("Brake pads");
    case 'battery':
      return tr("Battery");
    default:
      return tr("Other part");
  }
}

// ── What it adds up to ───────────────────────────────────────────────────

export interface LedgerSums {
  /** Km per litre (or per kWh), from the last two full fill-ups and what went in between. */
  economy: number | null;
  /** Economy at each full fill-up after the first, oldest first (the chart). */
  economyHistory: Array<{ at: number; value: number }>;
  /** Km covered since the last full fill-up was made (at the odometer given). */
  sinceFullKm: number | null;
  /** Range left, km, when the tank size and economy are known. */
  rangeKm: number | null;
  fuelSpent: number;
  costSpent: number;
  monthSpent: number;
  /** Everything spent per km covered since the first fill-up. */
  perKm: number | null;
  /** Spending by category, fuel first. */
  byCategory: Array<{ key: 'fuel' | CostCategory; amount: number }>;
  /** Price per litre or kWh: the cheapest station used. */
  cheapest: { station: string; perUnit: number } | null;
}

export function ledgerSums(v: VehicleLedger, odometerKm: number, currency: string): LedgerSums {
  const fills = v.fills.filter((f) => f.currency === currency);
  const costs = v.costs.filter((c) => c.currency === currency);
  const fullIdx = fills.map((f, i) => (f.full ? i : -1)).filter((i) => i >= 0);
  const history: Array<{ at: number; value: number }> = [];
  for (let k = 1; k < fullIdx.length; k++) {
    const a = fills[fullIdx[k - 1]];
    const b = fills[fullIdx[k]];
    const units = fills.slice(fullIdx[k - 1] + 1, fullIdx[k] + 1).reduce((n, f) => n + f.amount, 0);
    const km = b.odometerKm - a.odometerKm;
    if (units > 0 && km > 0) history.push({ at: b.at, value: km / units });
  }
  const economy = history.length ? history.slice(-3).reduce((n, h) => n + h.value, 0) / Math.min(3, history.length) : null;
  const lastFull = fullIdx.length ? fills[fullIdx[fullIdx.length - 1]] : null;
  const sinceFullKm = lastFull ? Math.max(0, odometerKm - lastFull.odometerKm) : null;
  const rangeKm = economy && v.tank && sinceFullKm !== null ? Math.max(0, v.tank * economy - sinceFullKm) : null;
  const fuelSpent = fills.reduce((n, f) => n + f.paid, 0);
  const costSpent = costs.reduce((n, c) => n + c.amount, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthSpent = [...fills.map((f) => ({ at: f.at, n: f.paid })), ...costs.map((c) => ({ at: c.at, n: c.amount }))]
    .filter((x) => x.at >= monthStart.getTime())
    .reduce((n, x) => n + x.n, 0);
  const firstKm = fills[0]?.odometerKm;
  const covered = firstKm !== undefined ? odometerKm - firstKm : 0;
  const perKm = covered > 50 ? (fuelSpent + costSpent) / covered : null;
  const byCategory = [{ key: 'fuel' as const, amount: fuelSpent }, ...COST_CATEGORIES.map((c) => ({ key: c, amount: costs.filter((x) => x.category === c).reduce((n, x) => n + x.amount, 0) }))].filter((x) => x.amount > 0);
  let cheapest: LedgerSums['cheapest'] = null;
  for (const f of fills) {
    if (!f.station || f.amount <= 0) continue;
    const perUnit = f.paid / f.amount;
    if (!cheapest || perUnit < cheapest.perUnit) cheapest = { station: f.station.name, perUnit };
  }
  return { economy, economyHistory: history, sinceFullKm, rangeKm, fuelSpent, costSpent, monthSpent, perKm, byCategory, cheapest };
}

/** How far through its expected life a part is (0 to 1+), by distance; null without a life set. */
export const partWear = (p: Part, odometerKm: number) => (p.lifeKm ? Math.max(0, (odometerKm - p.fittedKm) / p.lifeKm) : null);

/** Fill-ups made on this vehicle during a ride (its receipt and map). */
export function fillsDuring(bikeId: string | undefined, from: number, to: number): Fill[] {
  if (!bikeId) return [];
  return vehicleLedger(current(), bikeId).fills.filter((f) => f.at >= from && f.at <= to);
}

// ── The demo bike's sample ───────────────────────────────────────────────

function demoLedger(): Ledger {
  const day = 86_400_000;
  const now = Date.now();
  const fills: Fill[] = [
    { at: 52, km: 9330, l: 15.1, p: 21.6, s: 'Shell, Lewes Road' },
    { at: 41, km: 9590, l: 14.3, p: 20.3, s: 'Esso, Brighton' },
    { at: 30, km: 9820, l: 13.6, p: 19.5, s: 'BP, Ditchling' },
    { at: 18, km: 9960, l: 9.2, p: 13.4, s: 'Tesco, Hollingbury' },
    { at: 6, km: 10060, l: 5.3, p: 7.7, s: 'Shell, Lewes Road' },
  ].map((f, i) => ({ id: `demo-fill-${i}`, at: now - f.at * day, odometerKm: f.km, fuel: 'super' as FuelType, amount: f.l, paid: f.p, currency: 'GBP', full: true, station: { name: f.s, lat: 50.84, lng: -0.12 } }));
  return {
    currency: 'GBP',
    vehicles: {
      [DEMO_BIKE_ID]: {
        power: 'fuel',
        tank: 15,
        lastFuel: 'super',
        fills,
        costs: [
          { id: 'demo-cost-1', at: now - 80 * day, category: 'insurance', amount: 412, currency: 'GBP', note: 'Fully comp, 12 months' },
          { id: 'demo-cost-2', at: now - 45 * day, category: 'service', amount: 189, currency: 'GBP', note: "Mecha-Nick's Garage: oil and filter" },
          { id: 'demo-cost-3', at: now - 20 * day, category: 'kit', amount: 64.99, currency: 'GBP', note: 'Winter gloves' },
        ],
        parts: [
          { id: 'demo-part-1', kind: 'tyre_rear', name: 'Pirelli Diablo Rosso IV', fittedAt: now - 120 * day, fittedKm: 7900, lifeKm: 2600 },
          { id: 'demo-part-2', kind: 'tyre_front', name: 'Pirelli Diablo Rosso IV', fittedAt: now - 120 * day, fittedKm: 7900, lifeKm: 6000 },
          { id: 'demo-part-3', kind: 'pads', name: 'Brembo Z04', fittedAt: now - 300 * day, fittedKm: 4800, lifeKm: 12000 },
          { id: 'demo-part-4', kind: 'tyre_rear', name: 'Pirelli Supercorsa SP', fittedAt: now - 260 * day, fittedKm: 4200, replacedAt: now - 120 * day, replacedKm: 7900 },
        ],
      },
    },
  };
}
