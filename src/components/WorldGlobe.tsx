import { useEffect, useRef, useCallback } from 'react';
import { geoOrthographic, geoPath, geoGraticule, type GeoPermissibleObjects } from 'd3-geo';

const RADAR_REFRESH_MS = 5 * 60 * 1000;
const RADAR_OPACITY = 0.5;
const REPROJ_SIZE = 128; // offscreen canvas resolution for radar reprojection
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import countriesTopo from 'world-atlas/countries-110m.json';

const land = feature(
  landTopo as unknown as Parameters<typeof feature>[0],
  (landTopo as unknown as { objects: { land: unknown } }).objects.land as never,
) as unknown as GeoPermissibleObjects;

const countriesGeo = feature(
  countriesTopo as unknown as Parameters<typeof feature>[0],
  (countriesTopo as unknown as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as { features: { id: string; type: string; geometry: GeoPermissibleObjects }[] };

const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
const graticule = geoGraticule()();

// City lights intensity stages (users → visual params)
const LIGHT_STAGES: { min: number; color: string; shadow: string; blur: number }[] = [
  { min: 1,   color: 'rgba(253,230,138,0.13)', shadow: 'rgba(253,220,100,0.25)', blur: 8  },
  { min: 5,   color: 'rgba(251,191,36,0.24)',  shadow: 'rgba(251,180,30,0.40)',  blur: 14 },
  { min: 20,  color: 'rgba(245,158,11,0.40)',  shadow: 'rgba(240,140,10,0.55)',  blur: 22 },
  { min: 100, color: 'rgba(251,146,60,0.58)',  shadow: 'rgba(250,120,20,0.70)',  blur: 32 },
];

export interface WorldLandmark {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Visual glyph drawn on the pin. */
  kind: 'convoys' | 'leaderboard' | 'join';
}

interface Props {
  accentColor: string;
  landmarks: WorldLandmark[];
  onLandmarkSelect?: (id: string) => void;
  countryLights?: Record<number, number>;
  onScaleChange?: (scale: number) => void;
  className?: string;
}

// ── Canvas landmark drawing ─────────────────────────────────────────

function drawGlyph(ctx: CanvasRenderingContext2D, kind: WorldLandmark['kind'], color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  if (kind === 'convoys') {
    // three chevrons in convoy formation
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 3.2, i === 0 ? -1.5 : 1.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'leaderboard') {
    // podium bars
    ctx.fillRect(-4.5, -1, 2.6, 5);
    ctx.fillRect(-1.3, -4, 2.6, 8);
    ctx.fillRect(1.9, 0.5, 2.6, 3.5);
  } else {
    // plus sign
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
    ctx.moveTo(0, -4); ctx.lineTo(0, 4);
    ctx.stroke();
  }
}

/**
 * Draws a landmark: a glowing beacon anchored on the globe surface with a
 * floating label chip above it. Returns the chip's hit rectangle (CSS px).
 */
function drawLandmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  lm: WorldLandmark,
  accentColor: string,
  alpha: number,
): { x: number; y: number; w: number; h: number } {
  const bob = Math.sin(t * 1.6 + x * 0.05) * 1.6;
  const stalk = 22;
  const label = lm.label.toUpperCase();

  ctx.save();
  ctx.globalAlpha = alpha;

  // Anchor dot pulsing on the surface
  const pulse = 0.6 + Math.sin(t * 2.4 + y * 0.05) * 0.4;
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = alpha * 0.35 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();

  // Stalk
  const topY = y - stalk + bob;
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, topY + 8);
  ctx.stroke();
  ctx.globalAlpha = alpha;

  // Chip
  ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  const padX = 7;
  const glyphW = 14;
  const w = padX * 2 + glyphW + 5 + textW;
  const h = 20;
  const bx = x - w / 2;
  const by = topY - h + 8;

  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.fillStyle = 'rgba(8,10,14,0.92)';
  ctx.beginPath();
  // rounded rect
  const rr = h / 2;
  ctx.moveTo(bx + rr, by);
  ctx.lineTo(bx + w - rr, by);
  ctx.quadraticCurveTo(bx + w, by, bx + w, by + rr);
  ctx.lineTo(bx + w, by + h - rr);
  ctx.quadraticCurveTo(bx + w, by + h, bx + w - rr, by + h);
  ctx.lineTo(bx + rr, by + h);
  ctx.quadraticCurveTo(bx, by + h, bx, by + h - rr);
  ctx.lineTo(bx, by + rr);
  ctx.quadraticCurveTo(bx, by, bx + rr, by);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = alpha * 0.75;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = alpha;

  ctx.save();
  ctx.translate(bx + padX + glyphW / 2, by + h / 2);
  drawGlyph(ctx, lm.kind, accentColor);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, bx + padX + glyphW + 5, by + h / 2 + 0.5);

  ctx.restore();

  return { x: bx, y: by, w, h };
}


// ── Component ───────────────────────────────────────────────────────

export function WorldGlobe({ accentColor, landmarks, onLandmarkSelect, countryLights = {}, onScaleChange, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef<[number, number]>([0, -15]);
  const scaleRef = useRef(1.0);
  const autoRef = useRef(true);
  const recentreRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPtrRef = useRef({ x: 0, y: 0 });
  const isDragRef = useRef(false);
  const pinchRef = useRef(0);
  const rafRef = useRef(0);
  const landmarksRef = useRef(landmarks);
  landmarksRef.current = landmarks;
  const hitsRef = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const onSelectRef = useRef(onLandmarkSelect);
  onSelectRef.current = onLandmarkSelect;
  const downPtRef = useRef({ x: 0, y: 0 });
  const countryLightsRef = useRef(countryLights);
  countryLightsRef.current = countryLights;
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;
  const lastReportedScaleRef = useRef(1.0);


  // Radar overlay state (all mutable refs — no re-renders needed)
  const radarSrcRef = useRef<Uint8ClampedArray | null>(null);     // 256×256 RGBA from RainViewer zoom-0 tile
  const radarBufRef = useRef(new Uint8ClampedArray(REPROJ_SIZE * REPROJ_SIZE * 4)); // reused output buffer
  const radarImgRef = useRef<ImageData | null>(null);             // wraps radarBufRef, created once
  const radarOffRef = useRef<HTMLCanvasElement | null>(null);     // REPROJ_SIZE×REPROJ_SIZE offscreen canvas
  const radarProjRef = useRef<ReturnType<typeof geoOrthographic> | null>(null); // reused reprojection

  const draw = useCallback((canvas: HTMLCanvasElement, t: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w === 0 || h === 0) return;

    const baseR = Math.min(w, h) / 2 - 10;
    const r = baseR * scaleRef.current;
    const cx = w / 2;
    const cy = h / 2;

    const projection = geoOrthographic()
      .scale(r)
      .translate([cx, cy])
      .clipAngle(90)
      .rotate([rotRef.current[0], rotRef.current[1]]);
    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, w, h);

    // Atmosphere glow — tinted with accent colour
    const [ah, as_, al] = accentColor.replace(/[^\d.,]/g, '').split(',').map(Number);
    const atmColor = `hsla(${ah},${as_}%,${Math.min(al + 10, 80)}%,`;
    const grd = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r * 1.24);
    grd.addColorStop(0, `${atmColor}0.22)`);
    grd.addColorStop(1, `${atmColor}0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.24, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Ocean — matches app background hue (very dark blue-grey)
    ctx.beginPath();
    path(SPHERE);
    ctx.fillStyle = 'hsl(220,20%,5%)';
    ctx.fill();

    // Graticule grid
    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Land — dark, slightly warmer than ocean
    ctx.beginPath();
    path(land);
    ctx.fillStyle = 'hsl(220,12%,10%)';
    ctx.fill();

    // Country city-lights glow (users per country → warm amber bloom)
    const lights = countryLightsRef.current;
    if (Object.keys(lights).length > 0) {
      ctx.save();
      for (const feat of countriesGeo.features) {
        const count = lights[Number(feat.id)] ?? 0;
        if (count === 0) continue;
        let stage = LIGHT_STAGES[0];
        for (const s of LIGHT_STAGES) { if (count >= s.min) stage = s; }
        ctx.shadowBlur = stage.blur;
        ctx.shadowColor = stage.shadow;
        ctx.fillStyle = stage.color;
        ctx.beginPath();
        path(feat.geometry);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Radar overlay — reprojects RainViewer zoom-0 tile (Mercator) onto the
    // orthographic sphere at REPROJ_SIZE×REPROJ_SIZE, then stretches it over
    // the globe circle. Transparent pixels outside the hemisphere are left at
    // alpha=0 so nothing bleeds outside the sphere.
    const radarSrc = radarSrcRef.current;
    const radarOff = radarOffRef.current;
    const radarImg = radarImgRef.current;
    const radarProj = radarProjRef.current;
    if (radarSrc && radarOff && radarImg && radarProj) {
      radarProj.scale(REPROJ_SIZE / 2).translate([REPROJ_SIZE / 2, REPROJ_SIZE / 2])
        .rotate([rotRef.current[0], rotRef.current[1]]);
      const buf = radarBufRef.current;
      const S = REPROJ_SIZE;
      for (let py = 0; py < S; py++) {
        for (let px = 0; px < S; px++) {
          const di = (py * S + px) * 4;
          const ll = radarProj.invert!([px, py]);
          if (!ll) { buf[di + 3] = 0; continue; }
          const [lng, lat] = ll;
          if (lat < -85 || lat > 85) { buf[di + 3] = 0; continue; }
          const tx = Math.min(255, Math.max(0, Math.floor((lng + 180) / 360 * 256)));
          const latR = lat * Math.PI / 180;
          const mercY = Math.log(Math.tan(Math.PI / 4 + latR / 2));
          const ty = Math.min(255, Math.max(0, Math.floor((1 - mercY / Math.PI) / 2 * 256)));
          const si = (ty * 256 + tx) * 4;
          buf[di] = radarSrc[si]; buf[di + 1] = radarSrc[si + 1];
          buf[di + 2] = radarSrc[si + 2]; buf[di + 3] = radarSrc[si + 3];
        }
      }
      const offCtx = radarOff.getContext('2d');
      if (offCtx) {
        offCtx.putImageData(radarImg, 0, 0);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.globalAlpha = RADAR_OPACITY;
        ctx.drawImage(radarOff, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    // Coastlines — accent
    ctx.beginPath();
    path(land);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Rim — accent
    ctx.beginPath();
    path(SPHERE);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Crew landmarks — beacons with tappable label chips
    const lambda0 = -rotRef.current[0] * Math.PI / 180;
    const phi0 = -rotRef.current[1] * Math.PI / 180;
    const hits: { id: string; x: number; y: number; w: number; h: number }[] = [];
    landmarksRef.current.forEach((lm) => {
      // Cull points on the back hemisphere via dot-product test
      const pLambda = lm.lng * Math.PI / 180;
      const pPhi = lm.lat * Math.PI / 180;
      const dot = Math.sin(pPhi) * Math.sin(phi0) + Math.cos(pPhi) * Math.cos(phi0) * Math.cos(pLambda - lambda0);
      if (dot < 0.12) return;

      const proj = projection([lm.lng, lm.lat]);
      if (!proj) return;
      const [px, py] = proj;
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > r * r * 1.01) return;

      const alpha = Math.min(1, (dot - 0.12) / 0.25);
      const rect = drawLandmark(ctx, px, py, t, lm, accentColor, alpha);
      if (alpha > 0.5) hits.push({ id: lm.id, ...rect });
    });
    hitsRef.current = hits;
  }, [accentColor]);


  // One-time setup: offscreen canvas + reusable ImageData + reprojection projection
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = REPROJ_SIZE; off.height = REPROJ_SIZE;
    radarOffRef.current = off;
    radarImgRef.current = new ImageData(radarBufRef.current, REPROJ_SIZE, REPROJ_SIZE);
    radarProjRef.current = geoOrthographic().clipAngle(90);
  }, []);

  // Fetch latest RainViewer zoom-0 global tile and extract raw pixels.
  // Refreshes every 5 minutes. Silent no-op on network failure.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!res.ok || cancelled) return;
        const data = await res.json() as { host: string; radar: { past: { time: number; path: string }[]; nowcast: { time: number; path: string }[] } };
        const frames = [...(data.radar?.past ?? []), ...(data.radar?.nowcast ?? [])];
        if (frames.length === 0 || cancelled) return;
        const latest = frames[frames.length - 1];
        const url = `${data.host}${latest.path}/256/0/0/0/2/1_1.png`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled) return;
          const tmp = document.createElement('canvas');
          tmp.width = 256; tmp.height = 256;
          const tmpCtx = tmp.getContext('2d');
          if (!tmpCtx) return;
          tmpCtx.drawImage(img, 0, 0);
          const id = tmpCtx.getImageData(0, 0, 256, 256);
          radarSrcRef.current = new Uint8ClampedArray(id.data.buffer.slice(0));
        };
        img.onerror = () => {};
        img.src = url;
      } catch {}
    }

    load();
    const timer = setInterval(load, RADAR_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let lastT = 0;
    const animate = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      if (autoRef.current) {
        // Slow ambient rotation
        rotRef.current[0] = (rotRef.current[0] + 3 * dt) % 360;
        // Smooth recentre: lerp tilt back to default and zoom back to 1
        if (recentreRef.current) {
          const tiltDiff = -15 - rotRef.current[1];
          const zoomDiff = 1.0 - scaleRef.current;
          rotRef.current[1] += tiltDiff * Math.min(1, 3.5 * dt);
          scaleRef.current += zoomDiff * Math.min(1, 3.5 * dt);
          if (Math.abs(tiltDiff) < 0.05 && Math.abs(zoomDiff) < 0.005) {
            rotRef.current[1] = -15;
            scaleRef.current = 1.0;
            recentreRef.current = false;
          }
        }
      }
      draw(canvas, now / 1000);
      // Report scale changes at 0.05 granularity so parent can react without thrashing
      const snapped = Math.round(scaleRef.current * 20) / 20;
      if (snapped !== lastReportedScaleRef.current) {
        lastReportedScaleRef.current = snapped;
        onScaleChangeRef.current?.(scaleRef.current);
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    const scheduleResume = () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      autoTimerRef.current = setTimeout(() => {
        autoRef.current = true;
        recentreRef.current = true;
      }, 5000);
    };

    let activeTouches = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && activeTouches >= 2) return;
      isDragRef.current = true;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      autoRef.current = false;
      recentreRef.current = false;
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragRef.current) return;
      // Suppress single-finger rotation while a pinch is in progress
      if (e.pointerType === 'touch' && activeTouches >= 2) return;
      const dx = e.clientX - lastPtrRef.current.x;
      const dy = e.clientY - lastPtrRef.current.y;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      rotRef.current[0] = (rotRef.current[0] + dx * 0.35) % 360;
      rotRef.current[1] = Math.max(-85, Math.min(85, rotRef.current[1] - dy * 0.35));
    };
    const onUp = () => { isDragRef.current = false; scheduleResume(); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scaleRef.current = Math.max(0.5, Math.min(3.0, scaleRef.current * (e.deltaY > 0 ? 0.93 : 1.07)));
    };
    const onTouchStart = (e: TouchEvent) => {
      activeTouches = e.touches.length;
      if (e.touches.length >= 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = Math.hypot(dx, dy);
        autoRef.current = false;
        isDragRef.current = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (pinchRef.current > 0) {
          scaleRef.current = Math.max(0.5, Math.min(3.0, scaleRef.current * (dist / pinchRef.current)));
        }
        pinchRef.current = dist;
        scheduleResume();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      activeTouches = e.touches.length;
      // Reset pinch baseline; if one finger remains, re-seat drag origin to avoid a jump
      pinchRef.current = 0;
      if (e.touches.length === 1) {
        lastPtrRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        isDragRef.current = false; // wait for a fresh pointerdown to resume drag
      }
    };


    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [draw]);

  return <canvas ref={canvasRef} className={className} style={{ touchAction: 'none' }} />;
}
