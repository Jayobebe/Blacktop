// Short audible camera alerts: 1 ping for ANPR/surveillance, 3 for speed cams.
// Uses a lazily created AudioContext so nothing is allocated until the first
// alert fires, and stays silent if the browser blocks audio.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function beep(at: number, freq: number) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = c.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

/** 3 quick high pings for a speed camera. */
export function pingSpeedCamera() {
  beep(0, 1180);
  beep(0.16, 1180);
  beep(0.32, 1180);
}

/** Single lower ping for ANPR / surveillance cameras. */
export function pingAnprCamera() {
  beep(0, 860);
}
