import type { LucideIcon } from 'lucide-react';
import { BatteryCharging, Clock, Coffee, Droplet, Fuel, HeartPulse, ShoppingCart, SquareParking, UtensilsCrossed, Wrench } from 'lucide-react';
import { VEHICLES, primaryVehicle, type VehicleType } from './vehicles';
import { tr } from '@/lib/i18n';

export interface RefuelCategory {
  id: 'gas' | 'charge' | 'water';
  label: string;
  /** OSM amenity tag(s), `|`-separated — same format as the other quick categories. */
  query: string;
}

/**
 * The "top up" quick search for the rider's main vehicle: fuel for motor
 * vehicles, charging points for e-bikes / e-scooters, drinking water for
 * bicycles.
 */
export function refuelCategory(vehicles: VehicleType[]): RefuelCategory {
  const primary = primaryVehicle(vehicles);
  if (VEHICLES[primary.id].motorised) return { id: 'gas', label: tr("Gas"), query: 'fuel' };
  if (primary.id === 'bicycle') return { id: 'water', label: tr("Water"), query: 'drinking_water' };
  return { id: 'charge', label: tr("Charge"), query: 'charging_station' };
}

/** Nominatim fallback terms for the refuel queries. */
export const REFUEL_NOMINATIM: Record<string, string> = {
  drinking_water: 'drinking water',
  charging_station: 'charging station',
};

export type PlaceCategoryId = RefuelCategory['id'] | 'food' | 'coffee' | 'open24' | 'store' | 'parking' | 'repair' | 'health';

/**
 * A quick search, as the map and the lobby offer it: what it asks the nearby
 * search for (OSM amenity / shop values `|`-separated, or `24h` for anything
 * open around the clock), its colour and its icon, the same on the chip and
 * on every pin it puts on the map.
 */
export interface PlaceCategory {
  id: PlaceCategoryId;
  label: string;
  query: string;
  color: string;
  Icon: LucideIcon;
  /** A shorter name for its chip, where the full one is long ("24h"); lists and pins keep the full one. */
  short?: string;
  /** Name for places mapped without one (most car parks, toilets and taps), or they'd be dropped. */
  unnamed?: string;
}

/** Category colours: blue for fuel and what keeps you going (as the map's own fuel pins), the rest each their own. */
export const PLACE_COLORS = {
  blue: '#3b82f6',
  orange: '#f97316',
  amber: '#d97706',
  cyan: '#06b6d4',
  pink: '#ec4899',
  indigo: '#6366f1',
  slate: '#64748b',
  red: '#ef4444',
} as const;

/**
 * The quick searches for this rider, in the owner's order: the top-up stop
 * for their main vehicle, parking that suits what they ride, coffee and open
 * all night (the four the chip rows show before "+N"), then food, shops,
 * repairs that suit what they ride and a pharmacy. Every value is
 * one the place-search function matches exactly (amenity, or the shop values
 * it knows), so none of them needs a change on the server.
 */
export function placeCategories(vehicles: VehicleType[]): PlaceCategory[] {
  const refuel = refuelCategory(vehicles);
  const main = primaryVehicle(vehicles).id;
  const refuelIcon = refuel.id === 'gas' ? Fuel : refuel.id === 'water' ? Droplet : BatteryCharging;
  const parking = main === 'motorcycle' ? 'motorcycle_parking|parking' : main === 'car' ? 'parking' : 'bicycle_parking';
  const repair = main === 'motorcycle' ? 'motorcycle|tyres' : main === 'car' ? 'car_repair|tyres' : 'bicycle_repair_station';
  return [
    { ...refuel, color: PLACE_COLORS.blue, Icon: refuelIcon, unnamed: refuel.id === 'gas' ? undefined : refuel.label },
    { id: 'parking', label: tr("Parking"), query: parking, color: PLACE_COLORS.indigo, Icon: SquareParking, unnamed: tr("Parking") },
    { id: 'coffee', label: tr("Coffee"), query: 'cafe', color: PLACE_COLORS.amber, Icon: Coffee },
    { id: 'open24', label: tr("Open 24h"), short: tr("24h"), query: '24h', color: PLACE_COLORS.cyan, Icon: Clock },
    { id: 'food', label: tr("Food"), query: 'restaurant|fast_food', color: PLACE_COLORS.orange, Icon: UtensilsCrossed },
    { id: 'store', label: tr("Store"), query: 'supermarket|convenience', color: PLACE_COLORS.pink, Icon: ShoppingCart },
    { id: 'repair', label: tr("Repairs"), query: repair, color: PLACE_COLORS.slate, Icon: Wrench, unnamed: main === 'motorcycle' || main === 'car' ? undefined : tr("Repair stand") },
    { id: 'health', label: tr("Pharmacy"), query: 'pharmacy|hospital', color: PLACE_COLORS.red, Icon: HeartPulse },
  ];
}
