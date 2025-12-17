import { useLocalStorage } from './useLocalStorage';

export type SpeedUnit = 'mph' | 'kph';
export type DistanceUnit = 'miles' | 'km';

export interface AppSettings {
  showSpeedRankings: boolean;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
}

const DEFAULT_SETTINGS: AppSettings = {
  showSpeedRankings: true,
  speedUnit: 'mph',
  distanceUnit: 'miles',
};

export function useSettings() {
  const [storedSettings, setSettings] = useLocalStorage<Partial<AppSettings>>('blacktop-settings', DEFAULT_SETTINGS);
  
  // Merge stored settings with defaults to handle missing fields from older versions
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

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

  return {
    settings,
    updateSetting,
    toggleSpeedRankings,
    toggleSpeedUnit,
    toggleDistanceUnit,
  };
}
