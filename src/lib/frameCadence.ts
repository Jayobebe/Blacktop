/**
 * Drawing at a lower rate than the screen refreshes, evenly (imports nothing).
 *
 * "Draw when 33 ms have passed since the last draw" judders: frame timestamps
 * wobble by a fraction of a millisecond, so a frame at 33.2 ms is skipped and
 * the next draw comes at 50, an uneven mix of 2- and 3-frame gaps on a 60 Hz
 * screen (and the same on 90 and 120 Hz). This counts whole frames instead:
 * every Nth, N worked out from the screen's own frame interval (smoothed), so
 * every gap is the same. Used by the backdrop, Home's globe and its banner,
 * and the scene clocks.
 */
export class FrameCadence {
  private interval = 1000 / 60;
  private since = 0;

  /**
   * Call once a frame with the time since the last one (ms). True when this
   * frame should be drawn, landing about every `spacingMs` on whole frames
   * (0: every frame).
   */
  tick(dtMs: number, spacingMs: number): boolean {
    if (dtMs > 2 && dtMs < 50) this.interval += (dtMs - this.interval) * 0.1;
    this.since++;
    const every = spacingMs > 0 ? Math.max(1, Math.round(spacingMs / this.interval)) : 1;
    if (this.since < every) return false;
    this.since = 0;
    return true;
  }
}
