import { useLocalStorage } from './useLocalStorage';

export interface AppSettings {
  showSpeedRankings: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  showSpeedRankings: true,
};

export function useSettings() {
  const [settings, setSettings] = useLocalStorage<AppSettings>('blacktop-settings', DEFAULT_SETTINGS);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleSpeedRankings = () => {
    updateSetting('showSpeedRankings', !settings.showSpeedRankings);
  };

  return {
    settings,
    updateSetting,
    toggleSpeedRankings,
  };
}
