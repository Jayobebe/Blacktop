// Rally-style pacenotes from the planned route's shape: each bend gets a
// severity from 1 (tightest) to 6 (nearly flat), hairpins are named, and
// bends that run into each other are joined ("Left 3 into right 2").
// Pure maths on the route line, worked out once per route.
import type { NavRoute } from './navigation';
import { tr } from '@/lib/i18n';

export interface Pacenote {
  /** Metres from the route start to the bend's entry. */
  along: number;
  text: string;
}

const STEP_M = 10;
const toRad = (d: number) => (d * Math.PI) / 180;

function bearing(a: [number, number], b: [number, number]): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
const delta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** Point on the line at `d` metres along. */
function pointAt(nav: NavRoute, d: number, hint: { i: number }): [number, number] {
  const { coords, cum } = nav;
  while (hint.i < cum.length - 2 && cum[hint.i + 1] < d) hint.i++;
  const i = hint.i;
  const seg = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i]) / seg));
  return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
}

function severity(radius: number, arc: number): number | 'hairpin' | null {
  if (arc >= 135 && radius < 25) return 'hairpin';
  if (radius < 25) return 1;
  if (radius < 45) return 2;
  if (radius < 75) return 3;
  if (radius < 115) return 4;
  if (radius < 170) return 5;
  if (radius < 260) return 6;
  return null;
}

function label(dir: 'left' | 'right', sev: number | 'hairpin', lower = false): string {
  let s: string;
  if (sev === 'hairpin') s = dir === 'left' ? tr("Hairpin left") : tr("Hairpin right");
  else s = dir === 'left' ? tr("Left {0}", [sev]) : tr("Right {0}", [sev]);
  return lower ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function buildPacenotes(nav: NavRoute | null): Pacenote[] {
  if (!nav || nav.coords.length < 3 || nav.length < STEP_M * 4) return [];
  const hint = { i: 0 };
  const pts: [number, number][] = [];
  for (let d = 0; d <= nav.length; d += STEP_M) pts.push(pointAt(nav, d, hint));
  const brg: number[] = [];
  for (let i = 1; i < pts.length; i++) brg.push(bearing(pts[i - 1], pts[i]));
  const turn: number[] = [];
  for (let i = 1; i < brg.length; i++) turn.push(delta(brg[i - 1], brg[i]));

  const bends: { start: number; end: number; dir: 'left' | 'right'; sev: number | 'hairpin' }[] = [];
  let i = 0;
  while (i < turn.length) {
    if (Math.abs(turn[i]) < 3) {
      i++;
      continue;
    }
    const sign = Math.sign(turn[i]);
    let arc = 0;
    let j = i;
    let quiet = 0;
    while (j < turn.length) {
      const t = turn[j];
      if (Math.sign(t) === -sign && Math.abs(t) > 3) break;
      if (Math.abs(t) < 1.5) {
        if (++quiet > 3) break;
      } else quiet = 0;
      if (Math.sign(t) === sign) arc += Math.abs(t);
      j++;
    }
    const end = j - quiet;
    const len = Math.max(STEP_M, (end - i) * STEP_M);
    if (arc >= 25) {
      const sev = severity(len / toRad(arc), arc);
      if (sev != null) bends.push({ start: i * STEP_M, end: end * STEP_M, dir: sign > 0 ? 'right' : 'left', sev });
    }
    i = Math.max(j, i + 1);
  }

  const notes: Pacenote[] = [];
  for (let k = 0; k < bends.length; k++) {
    const b = bends[k];
    const n = bends[k + 1];
    if (n && n.start - b.end < 40) {
      notes.push({ along: b.start, text: tr("{0} into {1}", [label(b.dir, b.sev), label(n.dir, n.sev, true)]) });
      k++;
    } else {
      notes.push({ along: b.start, text: label(b.dir, b.sev) });
    }
  }
  return notes;
}
