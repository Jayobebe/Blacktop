import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEffect } from 'react';
import { tr } from '@/lib/i18n';

export type SpeedUnit = 'mph' | 'kph';
export type DistanceUnit = 'miles' | 'km';

export type AccentColor = 'orange' | 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'cyan' | 'lime';

export const ACCENT_COLORS: { id: AccentColor; label: string; hsl: string; ring: string }[] = [
  { id: 'orange', label: tr("Sunset"), hsl: '38 95% 55%', ring: '38 95% 55%' },
  { id: 'blue', label: tr("Ocean"), hsl: '217 91% 60%', ring: '217 91% 60%' },
  { id: 'green', label: tr("Forest"), hsl: '142 71% 45%', ring: '142 71% 45%' },
  { id: 'purple', label: tr("Violet"), hsl: '262 83% 58%', ring: '262 83% 58%' },
  { id: 'pink', label: tr("Coral"), hsl: '330 81% 60%', ring: '330 81% 60%' },
  { id: 'red', label: tr("Crimson"), hsl: '0 84% 60%', ring: '0 84% 60%' },
  { id: 'cyan', label: tr("Arctic"), hsl: '186 94% 50%', ring: '186 94% 50%' },
  { id: 'lime', label: tr("Neon"), hsl: '84 85% 50%', ring: '84 85% 50%' },
];

export type CardDropVisibility = 'crew' | 'world';

export interface AppSettings {
  showSpeedRankings: boolean;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  accentColor: AccentColor;
  /** Optional second accent, used for the background lava glow. */
  secondaryAccentColor: AccentColor | null;
  amberSpeedThreshold: number;
  redSpeedThreshold: number;
  leanAngleEnabled: boolean;
  leanAngleThreshold: number; // Degrees - warning threshold
  gForceEnabled: boolean; // Live G-force gauge + max-G tracking
  // Auto-rescue (crash detection)
  autoRescueEnabled: boolean;
  autoRescueGThreshold: number; // G-force impact threshold (3.5–8)
  autoRescueStopWindowSec: number; // Seconds of near-zero speed after impact (5–30)
  // Blacktop World — opt-in global live event/rider map. When false, the
  // home-screen globe's long-press shortcut is disabled.
  blacktopWorldEnabled: boolean;
  // Traffic cameras — overlays speed cameras / ANPR poles from OpenStreetMap
  // on the Blacktop map when zoomed in past z13.
  trafficCamerasEnabled: boolean;
  // Weather radar overlay (RainViewer) on the Blacktop map.
  weatherOverlayEnabled: boolean;
  /** Warn about heavy rain on the planned route and offer a drier line. */
  weatherRoutingEnabled: boolean;
  /** Route preferences (like Waze's): steer routes off these where there's another way. */
  navAvoidMotorways: boolean;
  navAvoidTolls: boolean;
  navAvoidFerries: boolean;
  navAvoidUnpaved: boolean;
  /** Read turn-by-turn directions aloud (the turn banner shows either way). */
  navVoiceEnabled: boolean;
  /** How spoken directions sound: plain, radio (cockpit), or radio plus rally corner calls. */
  navVoiceStyle: 'standard' | 'cockpit' | 'rally';
  /** Speak hazard warnings when riding up to a report (the banner shows either way). One switch for every hazard type. */
  hazardVoiceEnabled: boolean;
  /** Anti-theft alarm: how much movement of the parked vehicle it takes. */
  alarmSensitivity: 'low' | 'normal' | 'high';
  /** Interface sounds: taps, toggles, sliders, dialogs and confirmations. Alerts (hazards, cameras, crash check, alarm, directions) sound regardless. */
  uiSoundsEnabled: boolean;
  /** When the rider accepted the crash detection disclaimer (ms), or null: auto-rescue can't be on without it. */
  autoRescueAcknowledgedAt: number | null;
  /**
   * Keep peak speed, G-force and lean on finished rides (receipts, history, logbook, boards).
   * Off ("Public Road Privacy"): rides keep only duration, distance, the route and average
   * speed. Track Day sessions always record everything.
   */
  logPeakTelemetry: boolean;
  /** Thermal / High-Speed Mode: no animation, no WebGL backdrop, black-and-white outlines (lib/thermal). */
  thermalMode: boolean;
  /**
   * Who a rescue call reaches (the rescue button, and auto-rescue after a crash):
   * the convoy you're riding with, your crew, your Discord, and opted-in riders
   * within `rescueNearbyKm`.
   */
  rescueToConvoy: boolean;
  rescueToCrew: boolean;
  rescueToDiscord: boolean;
  rescueToNearby: boolean;
  rescueNearbyKm: number;
  /**
   * Someone to text after a crash: an SMS with the position opens in the phone's
   * own messages app (crash screen, rescue banner). Works without our server;
   * the number never leaves the phone otherwise.
   */
  emergencyContactName: string;
  emergencyContactPhone: string;
  // 3D flyover overview button on ride history details.
  flyoverEnabled: boolean;
  // Downloadable recorded ride overlay on ride history details.
  rideOverlayEnabled: boolean;
  // Mix convoy voice-channel audio into the recorded ride overlay MP4.
  voiceRecordingEnabled: boolean;
  // Car Display — oversized, low-chrome Active Ride layout for wired
  // phone-mirroring head units (Android USB/HDMI mirroring).
  carDisplayEnabled: boolean;
  /** Blacktop Radio — local-file stations with an in-ride dial. */
  radioEnabled: boolean;
  /** Who can see the trading cards you drop on the Blacktop map. */
  cardDropVisibility: CardDropVisibility;
  /** Speed-first UI: live speed as the hero number, top/avg speed in stats and receipts. */
  speedFocusEnabled: boolean;
  /** Garage: vehicles, service reminders, vehicle line + photo on receipts. */
  garageEnabled: boolean;
  /** Collectibles: trading cards, badges, card drops on the map. */
  collectiblesEnabled: boolean;
  /** Ride History: delete unstarred rides older than a week/month (totals are kept). */
  burnTripsInterval: 'off' | 'week' | 'month';
  /** Nearby riders: find opted-in riders close by and pair up / merge convoys (Blacktop map). */
  proximityEnabled: boolean;
  /** Track Pack: lap timing, pit crew link and track sessions (Home button). */
  trackPackEnabled: boolean;
  /** Opt-in: best laps on circuit library layouts go on public Track Day leaderboards (features/track/lib/trackRecords). */
  trackLeaderboardsEnabled: boolean;
}

// Hardware-floor bounds for auto-rescue, enforced both in the Settings UI
// sliders and here on every read - below these, ordinary vibration/road
// noise (not an actual crash) can trip the detector and fire emergency
// webhooks. Clamped on read so a stale/tampered localStorage value below the
// floor (e.g. persisted before this floor existed) can't bypass it either.
export const AUTO_RESCUE_MIN_G_THRESHOLD = 3.5;
export const AUTO_RESCUE_MAX_G_THRESHOLD = 8;
export const AUTO_RESCUE_MIN_STOP_WINDOW_SEC = 5;
export const AUTO_RESCUE_MAX_STOP_WINDOW_SEC = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const DEFAULT_SETTINGS: AppSettings = {
  showSpeedRankings: false,
  speedUnit: 'mph',
  distanceUnit: 'miles',
  accentColor: 'orange',
  secondaryAccentColor: null,
  amberSpeedThreshold: 80,
  redSpeedThreshold: 100,
  leanAngleEnabled: false,
  leanAngleThreshold: 45, // Default warning at 45 degrees
  gForceEnabled: false,
  autoRescueEnabled: false,
  autoRescueGThreshold: 5,
  autoRescueStopWindowSec: 10,
  blacktopWorldEnabled: false,
  trafficCamerasEnabled: false,
  weatherOverlayEnabled: false,
  weatherRoutingEnabled: false,
  navAvoidMotorways: false,
  navAvoidTolls: false,
  navAvoidFerries: false,
  navAvoidUnpaved: false,
  navVoiceEnabled: true,
  navVoiceStyle: 'standard',
  hazardVoiceEnabled: true,
  alarmSensitivity: 'normal',
  uiSoundsEnabled: true,
  autoRescueAcknowledgedAt: null,
  logPeakTelemetry: true,
  thermalMode: false,
  rescueToConvoy: true,
  rescueToCrew: true,
  rescueToDiscord: true,
  rescueToNearby: false,
  rescueNearbyKm: 10,
  emergencyContactName: '',
  emergencyContactPhone: '',
  flyoverEnabled: false,
  rideOverlayEnabled: false,
  voiceRecordingEnabled: false,
  carDisplayEnabled: false,
  radioEnabled: false,
  cardDropVisibility: 'world',
  // Existing users keep everything they had; onboarding can switch these off.
  speedFocusEnabled: true,
  garageEnabled: true,
  collectiblesEnabled: true,
  burnTripsInterval: 'off',
  proximityEnabled: false,
  trackPackEnabled: false,
  trackLeaderboardsEnabled: false,
};

export const AUTO_RESCUE_ACK_TIMEOUT_SEC = 300; // 5 minutes

export function useSettings() {
  const [storedSettings, setSettings] = useLocalStorage<Partial<AppSettings>>('blacktop-settings', DEFAULT_SETTINGS);

  // Merge stored settings with defaults to handle missing fields from older versions
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

  if (!['low', 'normal', 'high'].includes(settings.alarmSensitivity)) settings.alarmSensitivity = 'normal';

  // Re-clamp on every read regardless of how the value got persisted.
  settings.autoRescueGThreshold = clamp(
    settings.autoRescueGThreshold,
    AUTO_RESCUE_MIN_G_THRESHOLD,
    AUTO_RESCUE_MAX_G_THRESHOLD,
  );
  settings.autoRescueStopWindowSec = clamp(
    settings.autoRescueStopWindowSec,
    AUTO_RESCUE_MIN_STOP_WINDOW_SEC,
    AUTO_RESCUE_MAX_STOP_WINDOW_SEC,
  );

  // Apply accent color to CSS variables
  useEffect(() => {
    // Thermal / High-Speed Mode: the `thermal` class (index.css) and white for every accent.
    const thermal = settings.thermalMode === true;
    document.documentElement.classList.toggle('thermal', thermal);
    const base = ACCENT_COLORS.find(c => c.id === settings.accentColor) || ACCENT_COLORS[0];
    const color = thermal ? { ...base, hsl: '0 0% 100%', ring: '0 0% 100%' } : base;
    document.documentElement.style.setProperty('--accent', color.hsl);
    document.documentElement.style.setProperty('--ring', color.ring);
    const second = ACCENT_COLORS.find(c => c.id === settings.secondaryAccentColor);
    if (second && second.id !== color.id) document.documentElement.style.setProperty('--lava', second.hsl);
    else document.documentElement.style.removeProperty('--lava');

    // Keep warning (amber) independent of the chosen accent color
    // (this ensures Speed Alerts are always amber/red for all users)
    document.documentElement.style.removeProperty('--warning');

    document.documentElement.style.setProperty('--speed-active', color.hsl);
    document.documentElement.style.setProperty('--ptt-active', color.hsl);
  }, [settings.accentColor, settings.secondaryAccentColor, settings.thermalMode]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const toggleSpeedRankings = () => {
    updateSetting('showSpeedRankings', !settings.showSpeedRankings);
  };

  const toggleSpeedUnit = () => {
    updateSetting('speedUnit', settings.speedUnit === 'mph' ? 'kph' : 'mph');
  };

  const toggleDistanceUnit = () => {
    updateSetting('distanceUnit', settings.distanceUnit === 'miles' ? 'km' : 'miles');
  };

  const setAccentColor = (color: AccentColor) => {
    updateSetting('accentColor', color);
  };

  const toggleLeanAngle = () => {
    updateSetting('leanAngleEnabled', !settings.leanAngleEnabled);
  };

  const setLeanAngleThreshold = (threshold: number) => {
    updateSetting('leanAngleThreshold', threshold);
  };

  return {
    settings,
    updateSetting,
    updateSettings,
    toggleSpeedRankings,
    toggleSpeedUnit,
    toggleDistanceUnit,
    setAccentColor,
    toggleLeanAngle,
    setLeanAngleThreshold,
  };
}
