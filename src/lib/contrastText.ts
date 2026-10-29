/**
 * Black or white, whichever stands out more on a colour (any CSS colour: hex, rgb, hsl). For lettering on a
 * solid fill the rider picks, such as their own pin on the map in their accent: white letters vanished on the
 * Pearl (white) accent. By the colour's relative luminance (WCAG), read once per colour. Imports nothing.
 */
const cache = new Map<string, string>();
let ctx: CanvasRenderingContext2D | null = null;

export function contrastText(color: string): '#000000' | '#ffffff' {
  const hit = cache.get(color);
  if (hit) return hit as '#000000' | '#ffffff';
  let out: '#000000' | '#ffffff' = '#ffffff';
  try {
    ctx ??= document.createElement('canvas').getContext('2d');
    if (ctx) {
      // The canvas turns any CSS colour into one it can read back: draw a pixel and read it.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      // Where black and white contrast equally (luminance about 0.18): above it black wins.
      out = l > 0.179 ? '#000000' : '#ffffff';
    }
  } catch {
    /* white, as before */
  }
  cache.set(color, out);
  return out;
}
