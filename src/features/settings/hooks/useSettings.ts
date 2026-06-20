import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEffect } from 'react';

export type SpeedUnit = 'mph' | 'kph';
export type DistanceUnit = 'miles' | 'km';

export type AccentColor = 'orange' | 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'cyan' | 'lime';

export type ActionCamBrand = 'dji' | 'gopro' | 'insta360' | 'sony' | 'akaso';

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

export const ACTION_CAM_OPTIONS: { id: ActionCamBrand; label: string; instructions: string[] }[] = [
  { 
    id: 'dji', 
    label: 'DJI Action', 
    instructions: [
      '1. Record your ride with your DJI Action camera',
      '2. After the ride, transfer the video to your phone',
      '3. Go to Ride History → select your ride',
      '4. Tap "Add Stats Overlay to Video"',
      '5. Upload the video and adjust sync if needed',
      '6. Process and download the video with stats overlay'
    ]
  },
  { 
    id: 'gopro', 
    label: 'GoPro Hero', 
    instructions: [
      '1. Record your ride with your GoPro camera',
      '2. After the ride, transfer the video to your phone',
      '3. Go to Ride History → select your ride',
      '4. Tap "Add Stats Overlay to Video"',
      '5. Upload the video and adjust sync if needed',
      '6. Process and download the video with stats overlay'
    ]
  },
  { 
    id: 'insta360', 
    label: 'Insta360', 
    instructions: [
      '1. Record your ride with your Insta360 camera',
      '2. After the ride, transfer the video to your phone',
      '3. Go to Ride History → select your ride',
      '4. Tap "Add Stats Overlay to Video"',
      '5. Upload the video and adjust sync if needed',
      '6. Process and download the video with stats overlay'
    ]
  },
  { 
    id: 'sony', 
    label: 'Sony Action Cam', 
    instructions: [
      '1. Record your ride with your Sony camera',
      '2. After the ride, transfer the video to your phone',
      '3. Go to Ride History → select your ride',
      '4. Tap "Add Stats Overlay to Video"',
      '5. Upload the video and adjust sync if needed',
      '6. Process and download the video with stats overlay'
    ]
  },
  { 
    id: 'akaso', 
    label: 'AKASO', 
    instructions: [
      '1. Record your ride with your AKASO camera',
      '2. After the ride, transfer the video to your phone',
      '3. Go to Ride History → select your ride',
      '4. Tap "Add Stats Overlay to Video"',
      '5. Upload the video and adjust sync if needed',
      '6. Process and download the video with stats overlay'
    ]
  },
];

export interface AppSettings {
  showSpeedRankings: boolean;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  accentColor: AccentColor;
  amberSpeedThreshold: number;
  redSpeedThreshold: number;
  liveStreamingEnabled: boolean;
  streamKey: string;
  selectedActionCam: ActionCamBrand;
  showStatsOverlay: boolean;
  leanAngleEnabled: boolean;
  leanAngleThreshold: number; // Degrees - warning threshold
  // Auto-rescue (crash detection)
  autoRescueEnabled: boolean;
  autoRescueGThreshold: number; // G-force impact threshold (3–8)
  autoRescueStopWindowSec: number; // Seconds of near-zero speed after impact (5–30)
}

const DEFAULT_SETTINGS: AppSettings = {
  showSpeedRankings: true,
  speedUnit: 'mph',
  distanceUnit: 'miles',
  accentColor: 'orange',
  amberSpeedThreshold: 80,
  redSpeedThreshold: 100,
  liveStreamingEnabled: false,
  streamKey: '',
  selectedActionCam: 'dji',
  showStatsOverlay: true,
  leanAngleEnabled: false,
  leanAngleThreshold: 45, // Default warning at 45 degrees
  autoRescueEnabled: false,
  autoRescueGThreshold: 5,
  autoRescueStopWindowSec: 10,
};

export const AUTO_RESCUE_ACK_TIMEOUT_SEC = 300; // 5 minutes

export function useSettings() {
  const [storedSettings, setSettings] = useLocalStorage<Partial<AppSettings>>('blacktop-settings', DEFAULT_SETTINGS);
  
  // Merge stored settings with defaults to handle missing fields from older versions
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

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

  const toggleLiveStreaming = () => {
    updateSetting('liveStreamingEnabled', !settings.liveStreamingEnabled);
  };

  const setStreamKey = (key: string) => {
    updateSetting('streamKey', key);
  };

  const generateStreamKey = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'bt_';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setStreamKey(key);
    return key;
  };

  const setActionCam = (cam: ActionCamBrand) => {
    updateSetting('selectedActionCam', cam);
  };

  const toggleStatsOverlay = () => {
    updateSetting('showStatsOverlay', !settings.showStatsOverlay);
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
    toggleLiveStreaming,
    setStreamKey,
    generateStreamKey,
    setActionCam,
    toggleStatsOverlay,
    toggleLeanAngle,
    setLeanAngleThreshold,
  };
}
