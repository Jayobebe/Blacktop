/**
 * Station fuel and charging prices from riders who opted in (the ledger's
 * "Help map fuel prices"; migration 20261029000000_fuel_prices.sql, cap
 * `fuelPrices`). `reportFuelPrice` sends one fill-up's price per litre / kWh
 * with the station's map id, the fuel, the currency and the country, nothing
 * else. `useStationPrices` reads the stations on screen (a station card, a fuel
 * search's list), kept for ten minutes so scrolling and reopening ask nothing.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasServerCap, useServerCap } from '@/lib/serverCaps';
import { isDemoModeActive } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { moneyText, usesGallons } from '@/features/garage/lib/ledger';

export type PricedFuel = 'unleaded' | 'super' | 'diesel' | 'premium_diesel' | 'lpg' | 'ac' | 'dc';
export interface StationPrice {
  fuel: PricedFuel;
  currency: string;
  low: number;
  high: number;
  n: number;
  latest: number;
}

const FRESH_MS = 10 * 60_000;
const cache = new Map<string, { at: number; prices: StationPrice[] }>();
const listeners = new Set<() => void>();

/**
 * Only map stations can be priced. Search results carry OpenStreetMap ids as
 * "op:node123" / "op:way123" (Overpass) or "op:phW123" (the search service's
 * fallback); the server keeps one form, "op:n123" / "op:w123" / "op:r123", since
 * a node and a way can share a number.
 */
export function stationKey(id: string | undefined): string | null {
  const m = id ? /^op:(?:ph)?(node|way|relation|[nwr])(\d{1,15})$/i.exec(id) : null;
  return m ? `op:${m[1][0].toLowerCase()}${m[2]}` : null;
}
export const priceableStation = (id: string | undefined): id is string => !!stationKey(id);

export async function reportFuelPrice(stationId: string, fuel: PricedFuel, perUnit: number, currency: string, country: string | null): Promise<boolean> {
  const key = stationKey(stationId);
  if (isDemoModeActive() || !key || !(perUnit > 0) || !hasServerCap('fuelPrices')) return false;
  try {
    const { data, error } = await supabase.rpc('report_fuel_price' as never, { _station_id: key, _fuel: fuel, _price: Math.round(perUnit * 10000) / 10000, _currency: currency, _country: country } as never);
    if (error) return false;
    cache.delete(key);
    return (data as unknown as string) === 'ok';
  } catch {
    return false;
  }
}

/** Sample prices for the demo (any station asked about gets a believable range). */
function demoPrices(id: string): StationPrice[] {
  const seed = [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 7;
  const base = 1.39 + seed * 0.012;
  const now = Date.now();
  return [
    { fuel: 'unleaded', currency: 'GBP', low: base, high: base + 0.03, n: 4 + seed, latest: now - (seed + 1) * 3_600_000 * 7 },
    { fuel: 'super', currency: 'GBP', low: base + 0.12, high: base + 0.15, n: 2, latest: now - 2 * 86_400_000 },
    { fuel: 'diesel', currency: 'GBP', low: base + 0.08, high: base + 0.08, n: 1, latest: now - 4 * 86_400_000 },
  ];
}

async function load(ids: string[]) {
  const want = ids.filter((id) => !(cache.get(id) && Date.now() - cache.get(id)!.at < FRESH_MS)).slice(0, 60);
  if (!want.length) return;
  if (isDemoModeActive()) {
    want.forEach((id) => cache.set(id, { at: Date.now(), prices: demoPrices(id) }));
    listeners.forEach((l) => l());
    return;
  }
  try {
    const { data, error } = await supabase.rpc('fuel_prices_for' as never, { _ids: want } as never);
    if (error) return;
    const rows = (data as unknown as Array<{ station_id: string; fuel: PricedFuel; currency: string; low: number; high: number; n: number; latest: string }>) ?? [];
    const now = Date.now();
    want.forEach((id) => cache.set(id, { at: now, prices: [] }));
    for (const r of rows) {
      cache.get(r.station_id)?.prices.push({ fuel: r.fuel, currency: r.currency, low: Number(r.low), high: Number(r.high), n: r.n, latest: Date.parse(r.latest) });
    }
    listeners.forEach((l) => l());
  } catch {
    /* no prices this time */
  }
}

/** Prices for these stations (only with the server side in place, or demo mode). */
export function useStationPrices(ids: string[]): Map<string, StationPrice[]> {
  const live = useServerCap('fuelPrices') || isDemoModeActive();
  const [, bump] = useState(0);
  // The cache is keyed by the server's form; the answer by the ids the caller gave.
  const pairs = ids.map((id) => [id, stationKey(id)] as const).filter((p): p is readonly [string, string] => !!p[1]);
  const key = [...new Set(pairs.map((p) => p[1]))].sort().join(',');
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (live && key) void load(key.split(','));
  }, [live, key]);
  const out = new Map<string, StationPrice[]>();
  if (!live) return out;
  for (const [id, k] of pairs) {
    const hit = cache.get(k);
    if (hit?.prices.length) out.set(id, hit.prices);
  }
  return out;
}

/** Per litre (per gallon in the US) or per kWh, in the price's own currency: "£1.429" or "£1.429–1.459". */
export function perUnitText(p: StationPrice): string {
  const charge = p.fuel === 'ac' || p.fuel === 'dc';
  const k = !charge && usesGallons() ? 3.785411784 : 1;
  const one = (x: number) => moneyText(x * k, p.currency, 3);
  const unit = charge ? tr("/kWh") : usesGallons() ? tr("/gal") : tr("/L");
  return `${Math.abs(p.high - p.low) < 0.0005 ? one(p.low) : `${one(p.low)}–${one(p.high).replace(/^[^\d]*/, '')}`}${unit}`;
}

/** "6 reports this week", "1 report, 2 days ago". */
export function reportsText(p: StationPrice): string {
  const days = Math.floor((Date.now() - p.latest) / 86_400_000);
  const age = days <= 0 ? tr("today") : days === 1 ? tr("yesterday") : tr("{0} days ago", [days]);
  return p.n === 1 ? tr("1 report, {0}", [age]) : tr("{0} reports, latest {1}", [p.n, age]);
}

/** The price to rank a station by: the rider's own fuel if it's priced there, else its cheapest. */
export function rankPrice(prices: StationPrice[] | undefined, prefer?: string): number | null {
  if (!prices?.length) return null;
  const own = prefer ? prices.find((p) => p.fuel === prefer) : undefined;
  return own ? own.low : Math.min(...prices.map((p) => p.low));
}
