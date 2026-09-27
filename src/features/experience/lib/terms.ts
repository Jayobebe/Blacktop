import { VEHICLES, type VehicleType } from './vehicles';

export interface ExperienceTerms {
  /** "ride" / "drive" */
  ride: string;
  Ride: string;
  rides: string;
  Rides: string;
  /** "rider" / "driver" */
  rider: string;
  riders: string;
  /** "bike" / "car" / "e-bike" / "vehicle" */
  vehicle: string;
  Vehicle: string;
}

/** Wording follows the vehicles: cars "drive", everything else "rides". */
export function termsFor(vehicles: VehicleType[]): ExperienceTerms {
  const onlyCars = vehicles.length > 0 && vehicles.every((v) => v === 'car');
  const nouns = Array.from(new Set(vehicles.map((v) => VEHICLES[v].noun)));
  const vehicle = nouns.length === 1 ? nouns[0] : 'vehicle';
  const Vehicle = vehicle.charAt(0).toUpperCase() + vehicle.slice(1);

  if (onlyCars) {
    return { ride: 'drive', Ride: 'Drive', rides: 'drives', Rides: 'Drives', rider: 'driver', riders: 'drivers', vehicle, Vehicle };
  }
  return { ride: 'ride', Ride: 'Ride', rides: 'rides', Rides: 'Rides', rider: 'rider', riders: 'riders', vehicle, Vehicle };
}
