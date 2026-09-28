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
