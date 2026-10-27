/**
 * Sensor looks for the ride flyover (imports nothing): the map's picture run
 * through one small WebGL pass before the stat cards are drawn on top, so the
 * look is in the downloaded video too and the figures stay clean.
 *
 *   infrared:     white-hot iron scale (black, violet, red, orange, yellow, white)
 *   nightvision:  green phosphor, grain, a round vignette
 *   crt:          scanlines, a slight curve, colour fringing at the edges
 *   noir:         high-contrast black and white with a little grain
 *
 * "Infrared", never "thermal": Thermal mode is the app's battery saver.
 */
export type SensorLookId = 'normal' | 'infrared' | 'nightvision' | 'crt' | 'noir';

export const SENSOR_LOOKS: SensorLookId[] = ['normal', 'infrared', 'nightvision', 'crt', 'noir'];

const LOOK_INDEX: Record<Exclude<SensorLookId, 'normal'>, number> = { infrared: 1, nightvision: 2, crt: 3, noir: 4 };

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D img;
uniform int look;
uniform float time;
uniform vec2 res;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 iron(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.02);
  vec3 c1 = vec3(0.22, 0.02, 0.42);
  vec3 c2 = vec3(0.72, 0.06, 0.32);
  vec3 c3 = vec3(0.96, 0.38, 0.04);
  vec3 c4 = vec3(1.0, 0.82, 0.18);
  vec3 c5 = vec3(1.0, 1.0, 0.94);
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.45) return mix(c1, c2, (t - 0.2) / 0.25);
  if (t < 0.65) return mix(c2, c3, (t - 0.45) / 0.2);
  if (t < 0.85) return mix(c3, c4, (t - 0.65) / 0.2);
  return mix(c4, c5, (t - 0.85) / 0.15);
}

void main() {
  vec2 st = uv;
  if (look == 3) {
    // CRT: bulge the picture a touch, black beyond the curved edge.
    vec2 c = st * 2.0 - 1.0;
    c *= 1.0 + 0.045 * dot(c, c);
    st = c * 0.5 + 0.5;
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }
  vec3 col = texture2D(img, st).rgb;
  vec2 fromMid = uv - 0.5;
  float edge = dot(fromMid, fromMid);
  float grain = hash(floor(uv * res) + floor(time * 24.0)) - 0.5;

  if (look == 1) {
    // Infrared: the dark map runs cool, lit roads, labels and the route run hot.
    float t = pow(lum(col), 1.1) * 1.7;
    col = iron(t);
  } else if (look == 2) {
    float t = pow(lum(col), 0.85) * 1.45 + 0.015;
    t += grain * 0.12;
    col = vec3(0.18, 1.0, 0.32) * t;
    col *= smoothstep(0.42, 0.12, edge);
  } else if (look == 3) {
    float px = 1.6 / res.x;
    float off = px * (0.5 + edge * 6.0);
    col = vec3(texture2D(img, st + vec2(off, 0.0)).r, col.g, texture2D(img, st - vec2(off, 0.0)).b);
    float line = 0.72 + 0.28 * step(0.5, fract(uv.y * res.y / 3.0));
    col *= line * 1.18;
    col *= smoothstep(0.55, 0.18, edge);
  } else if (look == 4) {
    float t = lum(col);
    t = smoothstep(0.02, 0.62, t);
    t += grain * 0.05;
    col = vec3(t);
    col *= smoothstep(0.6, 0.2, edge);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** One WebGL canvas that turns a picture into a look. Make one per player. */
export class SensorLook {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private uLook: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uLook = gl.getUniformLocation(prog, 'look');
    this.uTime = gl.getUniformLocation(prog, 'time');
    this.uRes = gl.getUniformLocation(prog, 'res');
    gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0);
    gl.viewport(0, 0, width, height);
    this.gl = gl;
  }

  /** Whether the looks can be drawn here (no WebGL: the flyover keeps the normal picture). */
  get available(): boolean {
    return !!this.gl;
  }

  /** The picture in the look, at this canvas's size; null for normal or without WebGL. */
  render(source: TexImageSource, look: SensorLookId, timeS: number): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl || look === 'normal') return null;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(this.uLook, LOOK_INDEX[look]);
    gl.uniform1f(this.uTime, timeS);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  dispose(): void {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}
