/**
 * The map's colour maths (imports nothing): every basemap colour goes through
 * `mapRgb` (`map/lib/mapLook.ts`), sRGB components 0 to 1. Two steps, one on
 * top of the other: the rider's map look, then (after sunset) the night look.
 *
 * Map looks (Settings → Navigation → Map look):
 *   normal:       Blacktop's dark map as it is
 *   infrared:     white-hot iron scale by brightness (black, violet, red, orange, yellow, white)
 *   nightvision:  green phosphor by brightness
 *   crt:          the colours as they are, a touch brighter; the scanlines are a still
 *                 overlay over the map (`.map-scanlines` in index.css), never a filter
 *   noir:         high-contrast black and white
 * The flyover's looks (`lib/sensorLook.ts`) use the same curves and iron scale
 * in its shader: keep the two in step.
 *
 * Night looks (the night map):
 *   dim:    a little greyer and at about half brightness
 *   ember:  shades of burn orange by brightness, the darks pressed near black
 *           (red light keeps night vision best; this is a touch warmer to read)
 */
export type MapLookId = 'normal' | 'infrared' | 'nightvision' | 'crt' | 'noir';
export type NightLook = 'dim' | 'ember';

export const MAP_LOOKS: MapLookId[] = ['normal', 'infrared', 'nightvision', 'crt', 'noir'];

type Rgb = [number, number, number];

/** Rec. 709 weights: how bright each channel looks. */
const LUM = [0.2126, 0.7152, 0.0722] as const;
const lumOf = (c: readonly number[]) => LUM[0] * c[0] + LUM[1] * c[1] + LUM[2] * c[2];
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** The white-hot iron scale (sensorLook's shader has the same stops). */
const IRON: Array<[number, Rgb]> = [
  [0, [0, 0, 0.02]],
  [0.2, [0.22, 0.02, 0.42]],
  [0.45, [0.72, 0.06, 0.32]],
  [0.65, [0.96, 0.38, 0.04]],
  [0.85, [1, 0.82, 0.18]],
  [1, [1, 1, 0.94]],
];
function iron(t: number): Rgb {
  const x = clamp(t);
  for (let i = 1; i < IRON.length; i++) {
    const [at, c] = IRON[i];
    const [from, p] = IRON[i - 1];
    if (x <= at) return mix(p, c, (x - from) / (at - from));
  }
  return IRON[IRON.length - 1][1];
}

/** The app's burn orange, hsl(15 85% 52%), as 0..1 RGB. */
const BURN: Rgb = [0.928, 0.316, 0.112];
const DIM_SCALE = 0.55;
const DIM_KEEP = 0.85; // how much colour stays (the rest goes to grey)
/** Ember's curve: above 1 presses the darks (the dark style's grey background turned brown at 1). */
const EMBER_GAMMA = 1.45;
const EMBER_GAIN = 1.19;

/** A colour through a map look. */
export function lookRgb(rgb: Rgb, look: MapLookId): Rgb {
  const l = lumOf(rgb);
  switch (look) {
    case 'infrared':
      return iron(Math.pow(l, 1.1) * 1.7);
    case 'nightvision': {
      const t = Math.pow(l, 0.85) * 1.45 + 0.015;
      return [clamp(0.18 * t), clamp(t), clamp(0.32 * t)];
    }
    case 'crt':
      return [clamp(rgb[0] * 1.08), clamp(rgb[1] * 1.08), clamp(rgb[2] * 1.12)];
    case 'noir': {
      const t = smoothstep(0.02, 0.62, l);
      return [t, t, t];
    }
    default:
      return rgb;
  }
}

/** A colour through a night look. */
export function nightRgb(rgb: Rgb, look: NightLook): Rgb {
  if (look === 'ember') {
    const t = Math.pow(lumOf(rgb), EMBER_GAMMA) * EMBER_GAIN;
    return [clamp(BURN[0] * t), clamp(BURN[1] * t), clamp(BURN[2] * t)];
  }
  const l = lumOf(rgb);
  return [0, 1, 2].map((c) => clamp(DIM_SCALE * ((1 - DIM_KEEP) * l + DIM_KEEP * rgb[c]))) as Rgb;
}

/** A colour through the map look, then the night look on top (null: daytime). */
export function mapRgb(rgb: Rgb, look: MapLookId, night: NightLook | null): Rgb {
  const day = lookRgb(rgb, look);
  return night ? nightRgb(day, night) : day;
}
