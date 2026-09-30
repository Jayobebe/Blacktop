/**
 * Motion / orientation sensors on iOS: access is asked with requestPermission(),
 * only from a tap, and a web app forgets it when it closes. Without it the
 * sensors go quiet, so crash detection, lean, G and the alarm would be deaf
 * after every relaunch until the rider switched them on again.
 *
 * Once a rider has allowed it on this phone, installMotionRegrant() (App.tsx)
 * asks again on the first tap of each launch, which iOS answers without a
 * prompt (or with its own one-tap prompt); the listeners already attached then
 * start getting events. Other platforms need none of this.
 */
const KEY = 'blacktop_motion_granted';

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
  if (ok && results.length) noteMotionGranted();
  return ok;
}

let installed = false;

export function installMotionRegrant() {
  if (installed || !askers().length || !wasGranted()) return;
  installed = true;
  const events = ['click', 'touchend'] as const;
  const once = () => {
    events.forEach((ev) => window.removeEventListener(ev, once, true));
    void requestMotionAccess();
  };
  events.forEach((ev) => window.addEventListener(ev, once, true));
}
