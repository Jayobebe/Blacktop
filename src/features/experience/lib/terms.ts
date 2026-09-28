import { VEHICLES, type VehicleType } from './vehicles';
import { tr } from '@/lib/i18n';

export interface ExperienceTerms {
  /** "ride" / "drive", as a noun ("start a ride") */
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
  /**
   * Cars only: "drive" wording. Sentences that use ride/drive as a verb pick
   * between two whole translated sentences on this instead of slotting a word
   * in, since the verb and the noun differ in most languages.
   */
  car: boolean;
}

/** Singular vehicle nouns, translated (the keys are VEHICLES[..].noun). */
function vehicleNoun(noun: string): { vehicle: string; Vehicle: string } {
  switch (noun) {
    case 'bike':
      return { vehicle: tr("bike"), Vehicle: tr("Bike") };
    case 'car':
      return { vehicle: tr("car"), Vehicle: tr("Car") };
    case 'e-bike':
      return { vehicle: tr("e-bike"), Vehicle: tr("E-bike") };
    case 'scooter':
      return { vehicle: tr("scooter"), Vehicle: tr("Scooter") };
    default:
      return { vehicle: tr("vehicle"), Vehicle: tr("Vehicle") };
  }
}

/** Wording follows the vehicles: cars "drive", everything else "rides". */
export function termsFor(vehicles: VehicleType[]): ExperienceTerms {
  const onlyCars = vehicles.length > 0 && vehicles.every((v) => v === 'car');
  const nouns = Array.from(new Set(vehicles.map((v) => VEHICLES[v].noun)));
  const { vehicle, Vehicle } = vehicleNoun(nouns.length === 1 ? nouns[0] : 'vehicle');

  if (onlyCars) {
    return { ride: tr("drive"), Ride: tr("Drive"), rides: tr("drives"), Rides: tr("Drives"), rider: tr("driver"), riders: tr("drivers"), vehicle, Vehicle, car: true };
  }
  return { ride: tr("ride"), Ride: tr("Ride"), rides: tr("rides"), Rides: tr("Rides"), rider: tr("rider"), riders: tr("riders"), vehicle, Vehicle, car: false };
}
