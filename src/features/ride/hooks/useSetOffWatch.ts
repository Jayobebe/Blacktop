import { useCallback, useEffect, useState } from 'react';
import { locationWasGranted, noteLocationGranted } from '@/lib/locationGrant';
import { ANCHOR_MAX_MS, SetOffDetector, coarseMoved, setOffRuleFor, type CoarseFix } from '../lib/setOffDetector';

/** "Not now" keeps the card away for this long; an answer that goes somewhere, for a shorter while. */
const SNOOZE_KEY = 'blacktop_setoff_snooze';
export const SNOOZE_NOT_NOW_MS = 3 * 60 * 60 * 1000;
export const SNOOZE_ANSWERED_MS = 20 * 60 * 1000;

/** How long the GPS gets to confirm what the rough fixes suggested, and how long before it may be woken again (ms). */
const CONFIRM_MS = 45000;
const REST_MS = 120000;

const MPH = 2.2369;

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function snoozeSetOff(ms: number) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    /* this session only: the card just closes */
  }
}

/** Location is already allowed here: this never makes the phone ask (iOS can't say, so the note we keep). */
async function allowed(): Promise<boolean> {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm?.state === 'granted') return true;
    if (perm?.state === 'denied') return false;
  } catch {
    /* no answer: go by the note */
  }
  return locationWasGranted();
}

/**
 * Watches for the rider setting off while `active` (Home, on screen, nothing
 * else going on). Rough network fixes are the watch; only when two of them say
 * the phone is travelling is the GPS woken, for at most 45 s, to confirm it
 * with a speed that holds. Returns whether to ask, and the way to put the
 * card away.
 */
export function useSetOffWatch(active: boolean, motorised: boolean): [boolean, (snoozeMs: number) => void] {
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!active || moving) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (snoozedUntil() > Date.now()) return;

    const rule = setOffRuleFor(motorised);
    let stopped = false;
    let coarseId: number | null = null;
    let sharpId: number | null = null;
    let sharpTimer: number | null = null;
    let anchor: CoarseFix | null = null;
    let restUntil = 0;

    const endSharp = () => {
      if (sharpId != null) navigator.geolocation.clearWatch(sharpId);
      if (sharpTimer != null) window.clearTimeout(sharpTimer);
      sharpId = null;
      sharpTimer = null;
    };

    const confirm = () => {
      if (sharpId != null || stopped) return;
      const detector = new SetOffDetector(rule, motorised);
      sharpTimer = window.setTimeout(() => {
        endSharp();
        anchor = null;
        restUntil = Date.now() + REST_MS;
      }, CONFIRM_MS);
      sharpId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords;
          const hit = detector.next({
            lat: c.latitude,
            lng: c.longitude,
            t: pos.timestamp,
            deviceMph: c.speed != null && c.speed >= 0 ? c.speed * MPH : null,
            accuracy: c.accuracy ?? null,
          });
          if (hit && !stopped) {
            endSharp();
            setMoving(true);
          }
        },
        () => endSharp(),
        { enableHighAccuracy: true, maximumAge: 0 },
      );
    };

    const start = () => {
      if (stopped || coarseId != null || document.hidden) return;
      coarseId = navigator.geolocation.watchPosition(
        (pos) => {
          noteLocationGranted();
          const c = pos.coords;
          const fix: CoarseFix = { lat: c.latitude, lng: c.longitude, t: pos.timestamp, accuracy: c.accuracy ?? 1000, speed: c.speed != null && c.speed >= 0 ? c.speed : null };
          if (sharpId == null && Date.now() >= restUntil && coarseMoved(anchor, fix, rule)) confirm();
          if (!anchor || fix.t - anchor.t > ANCHOR_MAX_MS) anchor = fix;
        },
        () => {
          /* no fix: nothing to ask about */
        },
        { enableHighAccuracy: false, maximumAge: 10000 },
      );
    };
    const stop = () => {
      if (coarseId != null) navigator.geolocation.clearWatch(coarseId);
      coarseId = null;
      endSharp();
      anchor = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    void allowed().then((ok) => {
      if (!ok || stopped) return;
      start();
      document.addEventListener('visibilitychange', onVisibility);
    });

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [active, moving, motorised]);

  // Whatever was going to be asked is stale once Home is no longer the place to ask it.
  useEffect(() => {
    if (!active) setMoving(false);
  }, [active]);

  const dismiss = useCallback((snoozeMs: number) => {
    snoozeSetOff(snoozeMs);
    setMoving(false);
  }, []);

  return [moving && active, dismiss];
}
