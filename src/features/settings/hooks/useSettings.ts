import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEffect } from 'react';

export type SpeedUnit = 'mph' | 'kph';
export type DistanceUnit = 'miles' | 'km';

export type AccentColor = 'orange' | 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'cyan' | 'lime';

export const ACCENT_COLORS: { id: AccentColor; label: string; hsl: string; ring: string }[] = [
  { id: 'orange', label: 'Sunset', hsl: '38 95% 55%', ring: '38 95% 55%' },
  { id: 'blue', label: 'Ocean', hsl: '217 91% 60%', ring: '217 91% 60%' },
  { id: 'green', label: 'Forest', hsl: '142 71% 45%', ring: '142 71% 45%' },
  { id: 'purple', label: 'Violet', hsl: '262 83% 58%', ring: '262 83% 58%' },
  { id: 'pink', label: 'Coral', hsl: '330 81% 60%', ring: '330 81% 60%' },
  { id: 'red', label: 'Crimson', hsl: '0 84% 60%', ring: '0 84% 60%' },
  { id: 'cyan', label: 'Arctic', hsl: '186 94% 50%', ring: '186 94% 50%' },
  { id: 'lime', label: 'Neon', hsl: '84 85% 50%', ring: '84 85% 50%' },
];

export interface AppSettings {
  showSpeedRankings: boolean;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  accentColor: AccentColor;
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
  // 3D flyover overview button on ride history details.
  flyoverEnabled: boolean;
  // Downloadable recorded ride overlay on ride history details.
  rideOverlayEnabled: boolean;
  // Mix convoy voice-channel audio into the recorded ride overlay MP4.
  voiceRecordingEnabled: boolean;
  // Car Display — oversized, low-chrome Active Ride layout for wired
  // phone-mirroring head units (Android USB/HDMI mirroring).
  carDisplayEnabled: boolean;
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
  flyoverEnabled: false,
  rideOverlayEnabled: false,
  voiceRecordingEnabled: false,
  carDisplayEnabled: false,
};

export const AUTO_RESCUE_ACK_TIMEOUT_SEC = 300; // 5 minutes

export function useSettings() {
  const [storedSettings, setSettings] = useLocalStorage<Partial<AppSettings>>('blacktop-settings', DEFAULT_SETTINGS);

  // Merge stored settings with defaults to handle missing fields from older versions
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

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
    const color = ACCENT_COLORS.find(c => c.id === settings.accentColor) || ACCENT_COLORS[0];
    document.documentElement.style.setProperty('--accent', color.hsl);
    document.documentElement.style.setProperty('--ring', color.ring);

    // Keep warning (amber) independent of the chosen accent color
    // (this ensures Speed Alerts are always amber/red for all users)
    document.documentElement.style.removeProperty('--warning');

    document.documentElement.style.setProperty('--speed-active', color.hsl);
    document.documentElement.style.setProperty('--ptt-active', color.hsl);
  }, [settings.accentColor]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
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
    toggleSpeedRankings,
    toggleSpeedUnit,
    toggleDistanceUnit,
    setAccentColor,
    toggleLeanAngle,
    setLeanAngleThreshold,
  };
}
