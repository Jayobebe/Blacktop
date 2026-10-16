import { useSyncExternalStore } from 'react';
import type { ConvoyMemberInfo } from '@/types/convoy';
import type { GForceSample } from '@/types/blacktop';

/**
 * The receipt of a ride that's just ended, on its way to Home: it prints over
 * Home for a moment, then flies into the History button, where the ride is.
 * Nothing to acknowledge (`ReceiptFlight`, mounted once in App).
 */
export interface ReceiptFlightData {
  rideId: string;
  members: ConvoyMemberInfo[];
  currentUserId?: string;
  rideStats?: { duration: number; distance: number; maxSpeed: number; averageSpeed: number; maxLean?: number; maxGForce?: number; gEnvelope?: number[]; gMax?: { left: number; right: number; brake: number; accel: number } };
  bikeName: string | null;
  bikePhoto: string | null;
  gForceSamples?: GForceSample[];
}

let flight: ReceiptFlightData | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function flyReceipt(data: ReceiptFlightData) {
  flight = data;
  emit();
}

export function landReceipt() {
  flight = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useReceiptFlight = () => useSyncExternalStore(subscribe, () => flight, () => null);
