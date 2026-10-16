import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettings } from '@/features/settings';
import { tr } from '@/lib/i18n';

const FLAG_KEY = 'blacktop_battery_saver';
const LOW = 0.2;
const RECOVERED = 0.3;

interface BatteryLike extends EventTarget {
  level: number;
  charging: boolean;
}

const flagged = () => {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
};
const setFlag = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FLAG_KEY, '1');
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* kept for this launch */
  }
};

/**
 * Low battery on a ride: at 20 % or under, not charging, the app switches to
 * Thermal mode (no animations, frost or WebGL backdrop; maps cheaper from the
 * next start) and says so, with Turn off to undo it. It switches back by
 * itself when the phone is plugged in, gets back to 30 %, or the ride ends,
 * but only if it was the one that switched it on (\`blacktop_battery_saver\`).
 * Uses the Battery Status API (Android browsers and the Android app; iPhones
 * have none, so nothing happens there).
 */
export function useBatterySaver(active: boolean) {
  const { settings, updateSetting } = useSettings();
  const thermalRef = useRef(settings.thermalMode);
  thermalRef.current = settings.thermalMode;
  const updateRef = useRef(updateSetting);
  updateRef.current = updateSetting;
  const declined = useRef(false);

  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
    if (!active || !getBattery) return;
    let battery: BatteryLike | null = null;
    let gone = false;

    const restore = (say: boolean) => {
      if (!flagged()) return;
      setFlag(false);
      if (thermalRef.current) updateRef.current('thermalMode', false);
      if (say) toast.success(tr("Battery saver off"));
    };

    const check = () => {
      if (!battery || gone) return;
      if (flagged()) {
        if (battery.charging || battery.level >= RECOVERED) restore(true);
        return;
      }
      if (declined.current || thermalRef.current || battery.charging || battery.level > LOW) return;
      setFlag(true);
      updateRef.current('thermalMode', true);
      toast.info(tr("Battery low: saver on"), {
        description: tr("Animations and effects are off so the battery lasts the ride. They come back when you plug in or the ride ends."),
        action: {
          label: tr("Turn off"),
          onClick: () => {
            declined.current = true;
            restore(false);
          },
        },
        duration: 8000,
      });
    };

    void getBattery.call(navigator).then((b) => {
      if (gone) return;
      battery = b;
      b.addEventListener('levelchange', check);
      b.addEventListener('chargingchange', check);
      check();
    }).catch(() => {});

    return () => {
      gone = true;
      battery?.removeEventListener('levelchange', check);
      battery?.removeEventListener('chargingchange', check);
      // The ride is over (or this screen left): put things back as they were.
      restore(false);
    };
  }, [active]);
}
