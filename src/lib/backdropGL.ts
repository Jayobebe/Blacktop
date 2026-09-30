/**
 * The backdrop's BLACKTOP wordmark drawn on the GPU (see components/AppBackdrop):
 * one full-screen WebGL quad. Each pixel goes back through the fish-eye lens,
 * finds its row (rows loop endlessly and follow scrolling), shifts by that row's
 * conveyor-belt drift and samples a single "BLACKTOP " word from a small texture.
 * It replaced ~90 CSS-animated rows under an SVG displacement filter, which the
 * browser redrew on the CPU over the whole screen every frame (and every frosted
 * card on top re-blurred with it): the app's main source of lag.
 *
 * The letters are the background colour, so like before they only show where
 * the lava blobs' light (CSS, underneath) comes through the gaps.
 */

export interface BackdropFrame {
  /** Seconds of belt travel (integrates the belts' speed multiple). */
  beltTime: number;
  /** Px the rows have travelled up (scroll follow minus pull). */
  offsetY: number;
  /** Lens strength multiple (1 at rest, more while pulling). 0 = flat, no lens. */
  lens: number;
}

/** Row pitch in CSS px (the look of the old DOM rows). */
export const ROW_HEIGHT = 11.5;
/** Peak magnification at the lens centre, and the lens ellipse as a multiple of the half-screen. */
const LENS_STRENGTH = 0.38;
const LENS_OVERSCAN_X = 1.55;
const LENS_OVERSCAN_Y = 1.4;
/** One belt period = 40 words; each row takes 110–200 s per period (per-row, from a hash). */
const WORDS_PER_PERIOD = 40;

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uView;       // CSS px
uniform float uDpr;
uniform sampler2D uWord;  // one "BLACKTOP " in white on transparent
uniform float uWordW;     // CSS px
uniform float uRowH;
uniform float uTime;      // belt seconds
uniform float uOffsetY;
uniform float uLens;      // strength multiple, 0 = flat
uniform vec3 uColor;

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  // Screen position in CSS px, top-left origin.
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  // Back through the lens: inside the ellipse each pixel samples nearer the centre.
  vec2 c = uView * 0.5;
  vec2 d = p - c;
  vec2 r = c * vec2(${LENS_OVERSCAN_X.toFixed(2)}, ${LENS_OVERSCAN_Y.toFixed(2)});
  float r2 = dot(d / r, d / r);
  vec2 src = p;
  if (uLens > 0.0 && r2 < 1.0) src = c + d * (1.0 - ${LENS_STRENGTH.toFixed(2)} * uLens * (1.0 - r2));
  // Which row, and where in it.
  float y = src.y + uOffsetY;
  float row = floor(y / uRowH);
  float inRow = (y - row * uRowH) / uRowH;
  // Each row is a belt: its own speed and phase, alternate rows the other way.
  float period = uWordW * ${WORDS_PER_PERIOD.toFixed(1)};
  float duration = 110.0 + floor(hash(row + 1.0) * 90.0 + 0.5);
  float drift = fract(uTime / duration + hash(row + 101.0)) * period;
  float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
  float x = mod(src.x + dir * drift, uWordW);
  float a = texture2D(uWord, vec2(x / uWordW, inRow)).a;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** "BLACKTOP " as the old rows set it: Inter 900 11px, 0.02em letters, 0.2em extra word space. */
function drawWord(dpr: number): { canvas: HTMLCanvasElement; width: number } | null {
  const size = 11;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `900 ${size}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.font = font;
  const letters = 'BLACKTOP';
  const gap = 0.02 * size;
  let width = 0;
  for (const ch of letters) width += ctx.measureText(ch).width + gap;
  width += ctx.measureText(' ').width + gap + 0.2 * size;
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(ROW_HEIGHT * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  let x = 0;
  for (const ch of letters) {
    ctx.fillText(ch, x, ROW_HEIGHT / 2 + 0.5);
    x += ctx.measureText(ch).width + gap;
  }
  return { canvas, width: canvas.width / dpr };
}

function parseColor(css: string): [number, number, number] {
  const m = css.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] : [0.04, 0.04, 0.04];
}

export interface BackdropRenderer {
  draw(frame: BackdropFrame): void;
  resize(): void;
  dispose(): void;
}

/** A renderer on `canvas`, or null where WebGL isn't available (the caller falls back to plain rows). */
export function createBackdropRenderer(canvas: HTMLCanvasElement, colorProbe: HTMLElement): BackdropRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uView = u('uView');
  const uDpr = u('uDpr');
  const uWordW = u('uWordW');
  const uRowH = u('uRowH');
  const uTime = u('uTime');
  const uOffsetY = u('uOffsetY');
  const uLens = u('uLens');
  const uColor = u('uColor');

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(u('uWord'), 0);
  gl.uniform1f(uRowH, ROW_HEIGHT);

  // The GPU's own pixels: at most 2x (the letters are tiny and soft; 3x only costs).
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    // The canvas fills the viewport; its own box is the reliable size (0 before layout).
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uView, w, h);
    gl.uniform1f(uDpr, canvas.width / w);
    const word = drawWord(dpr);
    if (word) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, word.canvas);
      gl.uniform1f(uWordW, word.width);
    }
    const [r, g, b] = parseColor(getComputedStyle(colorProbe).backgroundColor);
    gl.uniform3f(uColor, r, g, b);
  };
  resize();
  // Inter may still be loading: redraw the word once fonts are in.
  document.fonts?.ready.then(() => resize()).catch(() => {});

  return {
    draw(frame) {
      gl.uniform1f(uTime, frame.beltTime);
      gl.uniform1f(uOffsetY, frame.offsetY);
      gl.uniform1f(uLens, frame.lens);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    resize,
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
