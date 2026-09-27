import { useCallback, useSyncExternalStore } from 'react';
import { useSettings } from '@/features/settings';
import {
  getExperience,
  setExperience,
  subscribeExperience,
  type ExperienceProfile,
  type RideMode,
  type RideStyle,
} from '../lib/profile';
import { VEHICLES, primaryVehicle, vehiclesPatch, type VehicleType } from '../lib/vehicles';
import { termsFor } from '../lib/terms';
import { careContext } from '../lib/questions';

export function deriveExperience(profile: ExperienceProfile) {
  const { vehicles, rideMode } = profile;
  const terms = termsFor(vehicles);
  const primary = primaryVehicle(vehicles);
  return {
    ...profile,
    primary,
    /** Icon for the primary vehicle — used on Home tiles and the preview. */
    VehicleIcon: primary.icon,
    isCarOnly: vehicles.every((v) => v === 'car'),
    hasCar: vehicles.includes('car'),
    /** Lean angle only exists for things that lean into corners. */
    canLean: vehicles.some((v) => VEHICLES[v].canLean),
    motorised: vehicles.some((v) => VEHICLES[v].motorised),
    showSolo: rideMode !== 'group',
    showGroup: rideMode !== 'solo',
    terms,
    care: careContext(vehicles, rideMode, terms),
  };
}

export type Experience = ReturnType<typeof deriveExperience>;

export function useExperience() {
  const profile = useSyncExternalStore(subscribeExperience, getExperience, getExperience);
  const { updateSettings } = useSettings();

  const setVehicles = useCallback(
    (vehicles: VehicleType[]) => {
      if (vehicles.length === 0) return;
      setExperience({ vehicles });
      updateSettings(vehiclesPatch(vehicles));
    },
    [updateSettings]
  );

  /** Adds/removes a vehicle, keeping pick order (first = primary). Never empties the list. */
  const toggleVehicle = useCallback(
    (vehicle: VehicleType) => {
      const current = getExperience().vehicles;
      const next = current.includes(vehicle) ? current.filter((v) => v !== vehicle) : [...current, vehicle];
      setVehicles(next.length > 0 ? next : current);
    },
    [setVehicles]
  );

  const setRideMode = useCallback((rideMode: RideMode) => setExperience({ rideMode }), []);
  const setStyle = useCallback((style: RideStyle) => setExperience({ style }), []);

  return {
    ...deriveExperience(profile),
    setVehicles,
    toggleVehicle,
    setRideMode,
    setStyle,
    markConfigured: () => setExperience({ configured: true }),
  };
}
