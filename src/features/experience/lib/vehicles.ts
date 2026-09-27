import type { ComponentType, SVGProps } from 'react';
import { Car, Bike } from 'lucide-react';
import type { AppSettings } from '@/features/settings';
import { MotorcycleIcon, EBikeIcon, ScooterIcon } from '../components/VehicleIcons';

export type VehicleType = 'motorcycle' | 'car' | 'bicycle' | 'ebike' | 'escooter';

export interface VehicleInfo {
  id: VehicleType;
  label: string;
  /** Singular noun used in copy: "your bike", "your car". */
  noun: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  motorised: boolean;
  /** Phone-mounted lean angle is meaningful for things that lean into corners. */
  canLean: boolean;
  /** Speed-alert defaults in mph (Settings stores mph). */
  amberMph: number;
  redMph: number;
  leanThreshold: number;
}

export const VEHICLES: Record<VehicleType, VehicleInfo> = {
  motorcycle: { id: 'motorcycle', label: 'Motorcycle', noun: 'bike', icon: MotorcycleIcon, motorised: true, canLean: true, amberMph: 80, redMph: 100, leanThreshold: 45 },
  car: { id: 'car', label: 'Car', noun: 'car', icon: Car, motorised: true, canLean: false, amberMph: 80, redMph: 100, leanThreshold: 45 },
  bicycle: { id: 'bicycle', label: 'Bicycle', noun: 'bike', icon: Bike, motorised: false, canLean: true, amberMph: 30, redMph: 40, leanThreshold: 30 },
  ebike: { id: 'ebike', label: 'E-bike', noun: 'e-bike', icon: EBikeIcon, motorised: false, canLean: true, amberMph: 25, redMph: 30, leanThreshold: 30 },
  escooter: { id: 'escooter', label: 'E-scooter', noun: 'scooter', icon: ScooterIcon, motorised: false, canLean: false, amberMph: 25, redMph: 30, leanThreshold: 30 },
};

export const VEHICLE_ORDER: VehicleType[] = ['motorcycle', 'car', 'bicycle', 'ebike', 'escooter'];

/** The vehicle that sets icons, thresholds and the garage defaults. */
export function primaryVehicle(vehicles: VehicleType[]): VehicleInfo {
  return VEHICLES[vehicles[0] ?? 'motorcycle'];
}

/**
 * Settings the vehicle set forces or seeds: speed-alert thresholds and lean
 * threshold from the primary vehicle, lean off when nothing leans, car
 * display on only when a car is in the mix.
 */
export function vehiclesPatch(vehicles: VehicleType[]): Partial<AppSettings> {
  const primary = primaryVehicle(vehicles);
  const patch: Partial<AppSettings> = {
    amberSpeedThreshold: primary.amberMph,
    redSpeedThreshold: primary.redMph,
    leanAngleThreshold: primary.leanThreshold,
    carDisplayEnabled: vehicles.includes('car'),
  };
  if (!vehicles.some((v) => VEHICLES[v].canLean)) patch.leanAngleEnabled = false;
  // Speed cameras only matter to motor vehicles.
  if (!vehicles.some((v) => VEHICLES[v].motorised)) patch.trafficCamerasEnabled = false;
  return patch;
}
