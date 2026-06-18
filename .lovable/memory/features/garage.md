---
name: Garage feature
description: Local-only per-bike storage, mileage from rides, maintenance with service intervals, Mecha-Nick mascot
type: feature
---

## Storage
- Local only via `useLocalStorage` key `bt.garage.v1`. Wiped by Burn (`useGarage.burnGarage()` called alongside `burnAllData()`).
- Shape: `{ bikes: Bike[], activeBikeId: string | null }`. See `src/features/garage/types.ts`.

## Bike model render
- No 3D / WebGL. The diorama is CSS: dark wall + perspective gridded shop floor + bike side-photo cutout + contact shadow.
- 4 photos per bike (left/right/front/back), compressed to ≤1024px JPEG data URLs. Left = default hero.
- Mecha-Nick stands beside the bike. CDN asset `src/assets/mecha-nick.png.asset.json`. Tap him → contextual tip (overdue maintenance > due-soon > flavour line).

## Rides → bike mileage
- `RideSession.bikeId` (optional) is stamped at `endRide` time via `getActiveBikeIdSnapshot()` reading localStorage directly (avoids circular React hooks).
- `useBikeStats(bike)` derives per-bike totals by filtering `useRideHistory().rides` by `bikeId`.
- Odometer = `baseOdometerKm + sum(rideDistanceMi * 1.60934)`.
- Receipt (`RideSummary`) accepts `bikeName` prop and shows it in the Bike row; ActiveRide passes `activeBike?.name`.

## Maintenance
- Per-item: name, `intervalKm`, `lastServiceKm`. Status = (lastServiceKm + intervalKm) - odometer. Tones: green > 200 km, warning ≤ 200 km, destructive ≤ 0.
- "Mark serviced" sets `lastServiceKm = round(odometerKm)`.

## Routes
- `/garage` (single page handles list + carousel + add/edit dialogs).

## Out of scope
- Real 3D mesh, AI photo-to-3D, cloud sync, cost tracking, per-ride bike reassignment UI (future: RideDetail bike selector).
