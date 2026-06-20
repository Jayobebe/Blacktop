## Auto-Ping Rescue (Crash Detection)

Optional safety feature. When the phone detects a high-G impact followed by a stop, the active-ride screen asks "Are you okay?". If unanswered in 5 minutes, a rescue ping fires automatically — to the convoy leader (convoy rides) and/or the Discord webhook (convoy + solo rides).

### Settings (Settings page → new "Safety" section)
- `autoRescueEnabled` (toggle, default OFF) — master switch.
- `autoRescueGThreshold` (slider, 3–8 G, default 5 G) — impact threshold.
- `autoRescueStopWindowSec` (slider, 5–30 s, default 10 s) — how long speed must stay at ~0 after impact.
- `autoRescueAckTimeoutSec` (fixed 300 s / 5 min, shown as text).

Stored in `useSettings` (extend `AppSettings` + defaults).

### Detection hook — `src/features/ride/hooks/useCrashDetection.ts`
- Listens to `devicemotion` (`accelerationIncludingGravity`), computes magnitude in G (÷ 9.81), keeps a short rolling window.
- Triggers a "possible crash" event when peak G ≥ threshold AND for the next `stopWindowSec` the live `speed` (passed in from active ride GPS) stays ≤ ~3 km/h.
- Only active while a ride is in progress and `autoRescueEnabled` is true.
- Emits via callback so the page can mount the prompt.

### Prompt UI — `src/features/rescue/components/CrashCheckPrompt.tsx`
- Full-screen modal over active ride: big "Are you okay?" + two buttons: **I'm fine** (dismiss) and **Send rescue now** (immediate ping).
- 5-minute countdown ring. Strong haptics + repeating audio chime while open.
- Auto-fires rescue when countdown hits 0 and closes.

### Wiring into rides
- **ActiveRide.tsx (convoy)**: pass current `speed` to `useCrashDetection`; on trigger open `CrashCheckPrompt`. On auto-fire / manual send, call existing `useRescue.sendRescueRequest(lat,lng)` — leader already receives it and Discord webhook already fires via `announceRescueToDiscord`.
- **Solo rides (SoloLobby/ActiveRide solo path)**: same detection + prompt. On auto-fire, call a new helper `triggerSoloRescue({ riderName, lat, lng })` that:
  - Posts to existing Discord edge function (reuse `discord-announce-solo-rescue` if present, otherwise route through `discord-announce-rescue` with a `solo: true` flag).
  - Shows local toast: "Rescue ping sent to Discord."
- No leader broadcast in solo mode (no convoy channel).

### Edge cases
- Suppress re-trigger for 2 minutes after a dismissal or send.
- Only arm detection once speed has exceeded 15 km/h at least once in the ride (avoids false positives from setting the phone down).
- Pause detection while ride is paused.
- If permission for motion sensors is denied (iOS requires `DeviceMotionEvent.requestPermission`), show a one-time prompt when the user enables the setting; if denied, mark setting back off with a toast.

### Files to add
- `src/features/ride/hooks/useCrashDetection.ts`
- `src/features/rescue/components/CrashCheckPrompt.tsx`
- `src/features/rescue/lib/soloRescue.ts` (Discord-only helper)

### Files to edit
- `src/features/settings/hooks/useSettings.ts` — new settings + defaults.
- `src/pages/Settings.tsx` — new Safety card with toggle + sliders.
- `src/pages/ActiveRide.tsx` — mount detection + prompt (convoy path).
- Solo active-ride entry point (likely `ActiveRide.tsx` solo branch or `SoloLobby` → active) — same mount, solo helper on fire.
- `src/features/rescue/index.ts` — export new prompt + helper.
- Memory: add a `mem://features/auto-rescue-crash-detection` entry and link it in `mem://index.md`.

### One open question
Discord pings on solo rides require the user to have configured the Discord integration in their own settings (existing `useDiscordIntegration`). If not configured, the auto-fire will silently no-op (with a local toast saying "No Discord webhook configured"). Confirm that's acceptable, or you'd prefer we surface a hard warning when enabling the feature without Discord set up.
