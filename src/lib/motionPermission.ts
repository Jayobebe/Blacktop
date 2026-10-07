/**
 * Motion / orientation sensors on iOS: access is asked with requestPermission(),
 * only from a tap, and a web app forgets it when it closes. Without it the
 * sensors go quiet, so crash detection, lean, G and the alarm would be deaf
 * after every relaunch until the rider switched them on again.
 *
 * So installMotionRegrant() (App.tsx) asks again on the first tap of each
 * launch, which iOS answers without a prompt (or with its own one-tap prompt);
 * the listeners already attached then start getting events. It asks whenever
 * the rider has something switched on that needs the sensors (lean, the G
 * gauge, crash detection), not only when this phone is known to have allowed
 * it before: riders who switched those on in an older version never got that
 * mark, and their gauges stayed dead after every relaunch. A rider who says no
 * is left alone for a week (the switches in Settings still ask straight away).
 * Other platforms need none of this.
 */
const KEY = 'blacktop_motion_granted';
const REFUSED_KEY = 'blacktop_motion_refused_at';
const REFUSED_REST_MS = 7 * 24 * 60 * 60 * 1000;

type PermissionCapable = { requestPermission?: () => Promise<string> };

function askers(): PermissionCapable[] {
  return [
    typeof DeviceMotionEvent !== 'undefined' ? (DeviceMotionEvent as unknown as PermissionCapable) : null,
    typeof DeviceOrientationEvent !== 'undefined' ? (DeviceOrientationEvent as unknown as PermissionCapable) : null,
  ].filter((E): E is PermissionCapable => !!E && typeof E.requestPermission === 'function');
}

export function noteMotionGranted() {
  try {
    if (localStorage.getItem(KEY) !== '1') localStorage.setItem(KEY, '1');
  } catch {
    /* this session only */
  }
}

function wasGranted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Lean, the G gauge or crash detection is switched on (read from storage: this runs before the app's stores). */
function wantsMotion(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}') ?? {};
    return !!(s.leanAngleEnabled || s.gForceEnabled || s.autoRescueEnabled);
  } catch {
    return false;
  }
}

function refusedLately(): boolean {
  try {
    const at = Number(localStorage.getItem(REFUSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < REFUSED_REST_MS;
  } catch {
    return false;
  }
}

/** Motion and orientation access, from a tap. True where no permission is needed. */
export async function requestMotionAccess(): Promise<boolean> {
  const results = await Promise.all(
    askers().map((E) =>
      E.requestPermission!()
        .then((r) => r === 'granted')
        .catch(() => false),
    ),
  );
  const ok = results.every(Boolean);
  if (ok && results.length) {
    noteMotionGranted();
    try {
      localStorage.removeItem(REFUSED_KEY);
    } catch {
      /* nothing to clear */
    }
  }
  return ok;
}

let installed = false;

export function installMotionRegrant() {
  if (installed || !askers().length) return;
  installed = true;
  const events = ['click', 'touchend'] as const;
  const stop = () => events.forEach((ev) => window.removeEventListener(ev, tap, true));
  // Checked on each tap, not once at launch: the rider may switch a gauge on after the app opened.
  const tap = () => {
    const known = wasGranted();
    if (!known && (!wantsMotion() || refusedLately())) return;
    stop();
    void requestMotionAccess().then((ok) => {
      if (ok || known) return;
      try {
        localStorage.setItem(REFUSED_KEY, String(Date.now()));
      } catch {
        /* asked again next launch */
      }
    });
  };
  events.forEach((ev) => window.addEventListener(ev, tap, true));
}
