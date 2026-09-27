/** Passport number shown in a vehicle's logbook, derived from its first bike id. */
export function passportFor(bikeId: string): string {
  const hex = bikeId.replace(/[^a-f0-9]/gi, '').toUpperCase().padEnd(8, '0');
  return `BT-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
