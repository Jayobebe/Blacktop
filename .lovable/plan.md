
# Garage Page

A new `/garage` route reached from the Home page. Local-only data. Shop-floor aesthetic in the existing Sonoma dark style. Mecha-Nick mascot stands beside the bike. The bike "model" is a stylised render built from the 4 user photos (front/back/left/right) — no AI/3D generation, but it reads as a low-poly diorama on the shop floor.

## Mecha-Nick mascot

- Upload the attached image as a Lovable Asset and run it through `imagegen--edit_image` with `transparent_background: true` to get a clean cutout PNG of Nick alone (no circle, no paper background).
- Render him in the garage at the right side of the shop floor, posed as if standing next to the bike. Subtle idle bob animation (CSS `translateY` keyframe, 4s). Tap him → one-line tip ("Chain's looking dry…" / "Nice numbers today.") rotating from a small quote pool tied to maintenance state.

## Shop floor visual

Built in CSS, no Three.js:

```text
┌──────────────────────────────────────────────┐
│  [BT logo]              GARAGE        [+ Add]│
│  ─────────────────────────────────────────── │
│  ◀  Bike name • make/model              ▶   │   ← bike switcher (carousel of owned bikes)
│                                              │
│    ░░░░░░░░  shop floor (perspective)        │
│   ░  ┌──────────┐               ╭──╮         │
│   ░  │ bike     │   shadow      │Nick│       │
│   ░  │ render   │ ◢◣◢◣          ╰──╯         │
│   ░  └──────────┘                            │
│  ─────────────────────────────────────────── │
│  STATS          MAINTENANCE         PHOTOS   │  ← tabbed panel under the diorama
└──────────────────────────────────────────────┘
```

- Floor = perspective-transformed gradient with faint grid lines (already part of Sonoma palette), warm accent rim light at the edges.
- Wall hooks behind Nick with two outlined wrench/helmet icons (lucide) for flavour. No clutter.

## Bike "render" from 4 photos

Capture flow when adding a bike:
1. Name + make/model + odometer start (optional).
2. Camera/file picker requests four shots in order: Left, Right, Front, Back. Each shown as a guide silhouette in the capture frame.
3. Photos are compressed (max 1024px, jpeg ~0.8) and stored in localStorage along with the bike record. Same compression util pattern as Ride Photos.

Render in the diorama:
- The **left** photo is the hero — displayed as a chunky cutout sitting on the floor (CSS `clip-path` or background with `mix-blend-mode: multiply` over the floor; subtle `filter: contrast(1.05) saturate(0.95)` for the low-poly toy feel).
- Soft contact shadow (radial gradient ellipse) under the bike.
- Tiny thumbnail strip (front/back/right) at the bottom-right of the diorama; tap to swap which photo is the hero in the floor view. Long-press a thumb opens fullscreen.
- No WebGL, no model generation — just CSS staging. Reads as a "low-poly diorama" because of the flat lighting + perspective floor + cutout silhouette treatment.

## Bike data model (local)

`useGarage` hook backed by `useLocalStorage` under key `bt.garage.v1`:

```ts
type BikePhotos = { left: string; right: string; front: string; back: string }; // data URLs

type MaintItem = {
  id: string;
  name: string;            // "Chain", "Engine oil"
  intervalKm: number;      // service interval
  lastServiceKm: number;   // odometer at last service
  notes?: string;
};

type Bike = {
  id: string;
  name: string;
  makeModel?: string;
  createdAt: number;
  photos: BikePhotos;
  baseOdometerKm: number;  // odometer reading when bike was added
  maintenance: MaintItem[];
};

type GarageState = {
  bikes: Bike[];
  activeBikeId: string | null;
};
```

Per-bike stats are **derived** from existing `useRideHistory` rides by filtering on `ride.bikeId`:
- Total distance on bike = sum of ride distances + `baseOdometerKm`.
- Top speed, max lean, longest single ride, total rides, total time — all reduce-over-rides.

Service status per maintenance item:
- `currentKm = baseOdometerKm + sumRidesForBike`
- `dueIn = (lastServiceKm + intervalKm) - currentKm`
- Color: green > 200 km, warm-yellow ≤ 200 km, destructive ≤ 0.

## Rides → bike mileage

- Extend `RideSession` with optional `bikeId?: string`.
- When a ride is saved, write the current `activeBikeId` into it.
- Ride Summary (receipt) gains a small "Bike: <name> [change]" line above the barcode footer. Tapping "change" opens a sheet to reassign that single ride to another bike (manual override). Receipts already exist — only minimal additions there.
- Solo and convoy rides both honour this; nothing changes about how rides are recorded or how convoy summaries display.

If `bikes.length === 0` or `activeBikeId == null`, rides remain bike-less and the garage shows the empty state.

## Navigation & home integration

- Home gets a new tile under existing actions: "Garage" with the wrench icon. Doesn't change zero-scroll layout (replaces one of the existing low-priority links or sits alongside History per current home grid — confirm during build, no design change required).
- New routes in `App.tsx`:
  - `/garage` — list view (carousel of bikes + add button) or empty state.
  - `/garage/add` — 4-photo capture wizard.
  - `/garage/:bikeId/edit` — name, make/model, re-shoot photos, delete bike.

## Garage panel tabs (under the diorama)

- **Stats** — Top speed, max lean (L/R), longest ride, total distance, total rides, total time. All from rides filtered to this bike. Same Sonoma stat cards used on Home.
- **Maintenance** — list of items with progress bar to next service, "Mark serviced" button (sets `lastServiceKm = currentKm`), edit interval. Add button opens a sheet with name + interval (km). Defaults dropdown: Chain lube (500), Chain replacement (15000), Engine oil (5000), Brake pads (10000), Tyres (8000), Air filter (12000).
- **Photos** — the four bike photos in a 2×2 grid; tap to re-shoot one.

## Mecha-Nick contextual tips

Tips chosen from bike state, prioritised:
1. Any maintenance overdue → "Hey — your <part> is overdue. Knock it out before the next ride."
2. Anything due within 200 km → "Heads up, <part> due in <N> km."
3. New top-speed/max-lean PR on last ride → "Saw that <X> km/h yesterday. Animal."
4. Default rotating flavour lines.

## Burn behaviour

`burnAllData` extended to clear `bt.garage.v1`. Photos are local data URLs, no remote cleanup needed.

## Out of scope (for follow-ups)

- Real 3D mesh generation (Three.js, photo-to-3D APIs). The current diorama is the agreed look.
- Cloud sync of bikes across devices.
- Cost tracking / receipts attached to maintenance items.

## Technical notes

- New folder `src/features/garage/` with `hooks/useGarage.ts`, `hooks/useBikeStats.ts`, components `GarageDiorama.tsx`, `MechaNick.tsx`, `BikeCarousel.tsx`, `BikePhotoCapture.tsx`, `MaintenanceList.tsx`, `StatsPanel.tsx`, plus `index.ts` barrel.
- New page `src/pages/Garage.tsx` (+ `GarageAdd.tsx`, `GarageEditBike.tsx`).
- Extend `RideSession` type in `src/types/blacktop.ts` with optional `bikeId`.
- Extend `useActiveRide` so ride completion stamps `bikeId` from garage state.
- Extend Burn handler to clear garage storage.
- Add a "Garage" tile/link on Home.
- New memory file `mem://features/garage` documenting the data model + bike-id rule for future rides.
- Image asset: upload Mecha-Nick reference → `imagegen--edit_image` to remove background and isolate the figure → save as `src/assets/mecha-nick.png.asset.json`.
