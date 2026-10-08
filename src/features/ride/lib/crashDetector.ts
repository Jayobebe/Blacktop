/**
 * The crash check's reasoning, with no React, clock or sensor of its own, so
 * `npm run crash:check` can play rides through it (this file imports nothing).
 *
 * A possible crash is a hard impact while the vehicle was moving, after which
 * it comes to rest within `settleMs` and stays at rest for the stop window.
 * An impact at a standstill is ignored (the phone being handled, the bike
 * going on its stand); one the vehicle rides on from is a pothole.
 *
 * "At rest" is the GPS speed while fixes keep coming. Speed only changes when
 * a fix arrives, so a phone that loses GPS in the crash (face down under the
 * bike, thrown into a ditch) would read its last speed for ever and the stop
 * would never be seen: with no fix for `staleMs`, rest is judged by the phone
 * itself lying still (no sample over `stillG` for `stillMs`).
 */
export const CRASH = {
  nearZeroMph: 3,
  /** Only armed once the rider has gone this fast. */
  armMph: 15,
  /** An impact only counts if the vehicle was doing at least this within `movingRecentMs`. */
  movingMph: 8,
  movingRecentMs: 5000,
  /** How long after an impact the vehicle has to come to rest. Still moving after that: it rode on. */
  settleMs: 12000,
  cooldownMs: 2 * 60 * 1000,
  /** No GPS fix for this long: the speed on hand is old news. */
  staleMs: 6000,
  /** Total G (1.0 at rest) a phone lying still stays under; a running engine or a moving vehicle goes over it. */
  stillG: 1.3,
  stillMs: 1500,
} as const;

export type CrashEventKind =
  /** An impact taken while moving: now waiting to see whether the vehicle stops. */
  | 'held'
  /** It kept going: dropped. */
  | 'rode-on'
  /** It stopped and stayed stopped: the rider is asked. */
  | 'fired'
  /** A hard knock, but the vehicle hadn't been moving. */
  | 'standstill'
  /** A hard knock before the ride had got going. */
  | 'unarmed';

export interface CrashEvent {
  kind: CrashEventKind;
  /** When (ms). */
  t: number;
  /** The impact, in G. */
  g: number;
  /** Speed on hand at that moment, mph. */
  mph: number;
  /** For `fired`: what showed the stop. */
  by?: 'gps' | 'motion';
}

export class CrashDetector {
  private armed = false;
  private mph = 0;
  /** When the speed on hand arrived; null = the caller doesn't say, so it's taken as current. */
  private speedAt: number | null = null;
  private movingAt = -Infinity;
  private impactAt: number | null = null;
  private impactG = 0;
  private restSince: number | null = null;
  private shakeAt = -Infinity;
  private lastFire = -Infinity;
  private lastIgnoredNote = -Infinity;

  constructor(
    public gThreshold: number,
    public stopWindowSec: number,
    private note?: (e: CrashEvent) => void,
  ) {}

  /** The latest speed. `fixAt` is when its GPS fix arrived (leave out if unknown). */
  speed(mph: number, now: number, fixAt?: number | null) {
    this.mph = mph;
    this.speedAt = fixAt ?? null;
    if (mph >= CRASH.armMph) this.armed = true;
    if (mph >= CRASH.movingMph && !this.stale(now)) this.movingAt = Math.max(this.movingAt, fixAt ?? now);
  }

  /** Each live G-force peak (total magnitude, about 1.0 at rest). */
  sample(g: number, now: number) {
    if (g > CRASH.stillG) this.shakeAt = now;
    if (now - this.lastFire < CRASH.cooldownMs) return;
    if (g < this.gThreshold || this.impactAt !== null) return;
    if (!this.armed) return this.ignored('unarmed', g, now);
    if (now - this.movingAt > CRASH.movingRecentMs) return this.ignored('standstill', g, now);
    this.impactAt = now;
    this.impactG = g;
    this.restSince = null;
    this.note?.({ kind: 'held', t: now, g, mph: this.mph });
  }

  /** Run a couple of times a second. True once: a possible crash. */
  tick(now: number): boolean {
    if (this.impactAt === null || now - this.lastFire < CRASH.cooldownMs) return false;
    const byMotion = this.stale(now);
    const resting = byMotion ? now - this.shakeAt >= CRASH.stillMs : this.mph <= CRASH.nearZeroMph;
    if (!resting) {
      this.restSince = null;
      if (now - this.impactAt > CRASH.settleMs) {
        this.note?.({ kind: 'rode-on', t: now, g: this.impactG, mph: this.mph });
        this.impactAt = null;
      }
      return false;
    }
    // By motion, it has been at rest since it last shook; by GPS, since the check first saw it stopped.
    if (this.restSince === null) this.restSince = byMotion ? Math.max(this.impactAt, this.shakeAt) : now;
    if (now - this.restSince < this.stopWindowSec * 1000) return false;
    this.note?.({ kind: 'fired', t: now, g: this.impactG, mph: this.mph, by: byMotion ? 'motion' : 'gps' });
    this.lastFire = now;
    this.clear();
    return true;
  }

  /** Forget an impact being watched (the check was switched off or paused). */
  clear() {
    this.impactAt = null;
    this.restSince = null;
  }

  private stale(now: number) {
    return this.speedAt !== null && now - this.speedAt > CRASH.staleMs;
  }

  // A phone being handled knocks often: one line every ten seconds is plenty.
  private ignored(kind: 'standstill' | 'unarmed', g: number, now: number) {
    if (now - this.lastIgnoredNote < 10000) return;
    this.lastIgnoredNote = now;
    this.note?.({ kind, t: now, g, mph: this.mph });
  }
}
