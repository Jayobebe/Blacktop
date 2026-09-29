import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Fuel, MoveHorizontal, Pause, Play, Shield, Trophy, Wind } from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/PageHeader';
import { saveModeBest, saveScore, useArcadeScores, useModeBests } from '../../hooks/useArcadeScores';

/*
 * Petrol Head: three-lane traffic run.
 *
 * Score is seconds survived (the crew board score). Depth on top:
 *  - fuel drains; grab cans or coast to a stop,
 *  - near misses (dodging late, or threading past alongside) build a combo,
 *    top the tank up a little and charge the slipstream meter,
 *  - a full meter gives a shield that shrugs off one hit,
 *  - later on, traffic indicates and changes lanes.
 *
 * Everything runs in logical units: the road is 320 wide and as tall as the
 * screen allows; the canvas is drawn at the device pixel ratio so it stays sharp.
 * Movement is time-based, so 60 Hz and 120 Hz phones play the same.
 */

type Phase = 'idle' | 'playing' | 'paused' | 'crashing' | 'coasting' | 'over';
type EndReason = 'crash' | 'fuel';
type Kind = 'car' | 'van' | 'truck';

const W = 320;
const ROAD_L = 14;
const ROAD_R = 306;
const LANES = [63, 160, 257];
const PW = 16;
const PH = 40;
const FUEL_SECONDS = 20;
const CAN_FUEL = 0.38;
const MISS_FUEL = 0.04;
const START_CLEAR_S = 2.2;

const SIZE: Record<Kind, { w: number; h: number }> = {
  car: { w: 30, h: 54 },
  van: { w: 32, h: 64 },
  truck: { w: 36, h: 118 },
};
const CAR_SHADES = ['#e4e4e7', '#a1a1aa', '#71717a', '#52525b', '#d4d4d8'];
const TRAILER_SHADES = ['#e4e4e7', '#a1a1aa', '#3f3f46'];

interface Vehicle {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  lane: number;
  toLane: number;
  shade: string;
  blinkY: number | null;
  changeY: number | null;
  moving: boolean;
  minGap: number;
  passed: boolean;
  /** Seconds left flying off after a shield hit (0 = on the road). */
  knock: number;
  gone: boolean;
  vx: number;
  spin: number;
}
interface Can { x: number; y: number; lane: number }
interface Popup { x: number; y: number; text: string; life: number; accent: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; accent: boolean }

interface Stats { misses: number; bestCombo: number; cans: number; shields: number; topKmh: number }

interface World {
  t: number;
  clock: number;
  speed: number;
  travel: number;
  nextSpawn: number;
  lane: number;
  px: number;
  lean: number;
  fuel: number;
  slip: number;
  shield: boolean;
  invuln: number;
  combo: number;
  comboLeft: number;
  vehicles: Vehicle[];
  cans: Can[];
  popups: Popup[];
  sparks: Spark[];
  lastCanT: number;
  shake: number;
  flash: number;
  pull: number;
  endAt: number;
  stats: Stats;
  attract: boolean;
  nextId: number;
}

const speedAt = (t: number) => 200 + 4.2 * t + 0.028 * t * t;
const kmhOf = (speed: number) => Math.round(60 + speed * 0.28);

function newWorld(attract: boolean): World {
  return {
    t: 0,
    clock: 0,
    speed: attract ? 150 : speedAt(0),
    travel: 0,
    nextSpawn: attract ? 60 : speedAt(0) * START_CLEAR_S,
    lane: 1,
    px: LANES[1],
    lean: 0,
    fuel: 1,
    slip: 0,
    shield: false,
    invuln: 0,
    combo: 0,
    comboLeft: 0,
    vehicles: [],
    cans: [],
    popups: [],
    sparks: [],
    lastCanT: 0,
    shake: 0,
    flash: 0,
    pull: 0,
    endAt: 0,
    stats: { misses: 0, bestCombo: 0, cans: 0, shields: 0, topKmh: 0 },
    attract,
    nextId: 1,
  };
}

// ── Simulation ───────────────────────────────────────────────────────────

const playerYFor = (H: number) => H - 88;

/** Lanes (0-2) with something in them between yTop and yBottom. */
function lanesTaken(w: World, yTop: number, yBottom: number, skip?: Vehicle): Set<number> {
  const out = new Set<number>();
  for (const v of w.vehicles) {
    if (v === skip || v.knock > 0 || v.gone) continue;
    if (v.y + v.h / 2 < yTop || v.y - v.h / 2 > yBottom) continue;
    out.add(v.lane);
    if (v.moving || v.blinkY != null) out.add(v.toLane);
  }
  return out;
}

function spawnRow(w: World, H: number) {
  const t = w.t;
  const band = 270;
  const taken = lanesTaken(w, -200, band);
  let free = [0, 1, 2].filter(l => !taken.has(l));
  if (w.attract) free = free.filter(l => l !== w.lane);
  if (free.length === 0 || (!w.attract && free.length === 1)) return;

  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const doubleChance = w.attract ? 0 : Math.min(0.45, Math.max(0, (t - 14) * 0.011));
  const count = free.length === 3 && Math.random() < doubleChance ? 2 : 1;
  const maxCount = w.attract ? free.length : free.length - 1;
  const use = free.slice(0, Math.min(count, maxCount));
  const truckChance = Math.min(0.32, 0.1 + t * 0.004);
  const changerChance = w.attract || t < 22 ? 0 : Math.min(0.3, (t - 22) * 0.006);

  for (const lane of use) {
    const r = Math.random();
    const kind: Kind = r < truckChance ? 'truck' : r < truckChance + 0.18 ? 'van' : 'car';
    const { w: vw, h: vh } = SIZE[kind];
    let changeY: number | null = null;
    let blinkY: number | null = null;
    if (Math.random() < changerChance && kind !== 'truck') {
      const latest = playerYFor(H) - 280;
      if (latest > 90) {
        changeY = 90 + Math.random() * (latest - 90);
        blinkY = changeY - w.speed * 0.8;
      }
    }
    w.vehicles.push({
      id: w.nextId++,
      kind,
      x: LANES[lane],
      y: -vh / 2 - 12,
      w: vw,
      h: vh,
      lane,
      toLane: lane,
      shade: kind === 'truck' ? TRAILER_SHADES[Math.floor(Math.random() * TRAILER_SHADES.length)] : CAR_SHADES[Math.floor(Math.random() * CAR_SHADES.length)],
      blinkY,
      changeY,
      moving: false,
      minGap: Infinity,
      passed: false,
      knock: 0,
      gone: false,
      vx: 0,
      spin: 0,
    });
  }

  // Fuel: guaranteed every ~8.5 s, more likely when the tank is low.
  if (w.attract) return;
  const odds = w.fuel < 0.35 ? 0.4 : w.fuel < 0.7 ? 0.18 : 0.05;
  if (t - w.lastCanT > 8.5 || Math.random() < odds) {
    const open = free.filter(l => !use.includes(l));
    const lane = open.length ? open[Math.floor(Math.random() * open.length)] : null;
    if (lane != null) {
      w.cans.push({ x: LANES[lane], y: -24, lane });
      w.lastCanT = t;
    }
  }
}

interface Hooks {
  onCrash: () => void;
  onDry: () => void;
  onEnd: () => void;
  onMiss: (combo: number) => void;
  onShield: () => void;
  onCan: () => void;
  onBlock: () => void;
  labels: { nearMiss: string; shield: string; fuel: string; blocked: string };
}

function step(w: World, dt: number, H: number, phase: Phase, hooks: Hooks) {
  const py = playerYFor(H);
  w.clock += dt;

  if (phase === 'playing') {
    w.t += dt;
    w.speed = speedAt(w.t);
    w.stats.topKmh = Math.max(w.stats.topKmh, kmhOf(w.speed));
    w.fuel -= dt / FUEL_SECONDS;
    if (w.fuel <= 0) {
      w.fuel = 0;
      w.endAt = w.clock;
      hooks.onDry();
    }
  } else if (phase === 'coasting') {
    w.speed = Math.max(0, w.speed - dt * 260);
    w.pull = Math.min(160, w.pull + dt * 120);
    if (w.clock - w.endAt > 2.2) hooks.onEnd();
  } else if (phase === 'crashing') {
    w.speed *= Math.exp(-dt * 4);
    if (w.clock - w.endAt > 1.1) hooks.onEnd();
  }

  const rel = w.speed - w.pull;
  w.travel += w.speed * dt;
  if ((phase === 'playing' || phase === 'idle') && w.travel >= w.nextSpawn) {
    spawnRow(w, H);
    const gap = w.attract ? 260 + Math.random() * 200 : Math.max(190, 330 - w.t * 1.5) + Math.random() * 140;
    w.nextSpawn = w.travel + gap;
  }

  // Rider
  const tx = LANES[w.lane];
  const dx = tx - w.px;
  w.px += dx * (1 - Math.exp(-dt * 20));
  const leanTarget = phase === 'crashing' ? w.lean : Math.max(-1, Math.min(1, dx / 90)) * 0.4;
  w.lean += (leanTarget - w.lean) * (1 - Math.exp(-dt * 16));
  if (phase === 'crashing') w.lean += dt * 7;
  w.invuln = Math.max(0, w.invuln - dt);
  w.comboLeft -= dt;
  if (w.comboLeft <= 0) w.combo = 0;
  w.shake = Math.max(0, w.shake - dt * 2.5);
  w.flash = Math.max(0, w.flash - dt * 2.8);

  const pTop = py - PH / 2;
  const pBot = py + PH / 2;
  const missWindow = 40 + w.speed * 0.06;

  for (const v of w.vehicles) {
    v.y += rel * dt;
    if (v.knock > 0) {
      v.knock -= dt;
      if (v.knock <= 0) v.gone = true;
      v.x += v.vx * dt;
      v.spin += dt * 7 * Math.sign(v.vx || 1);
      continue;
    }
    // Indicate, then change lanes if it's still safe to.
    if (v.blinkY != null && !v.moving && v.toLane === v.lane && v.y >= v.blinkY) {
      const options = [v.lane - 1, v.lane + 1].filter(l => l >= 0 && l <= 2);
      const clear = options.filter(l => !lanesTaken(w, v.y - v.h - 120, v.y + v.h + 120, v).has(l));
      if (clear.length) v.toLane = clear[Math.floor(Math.random() * clear.length)];
      else { v.blinkY = null; v.changeY = null; }
    }
    if (v.changeY != null && !v.moving && v.y >= v.changeY) {
      const near = lanesTaken(w, v.y - v.h - 90, v.y + v.h + 90, v);
      const band = lanesTaken(w, v.y - 270, v.y + 270, v);
      band.add(v.toLane);
      const freeAfter = [0, 1, 2].filter(l => !band.has(l)).length;
      if (v.toLane !== v.lane && !near.has(v.toLane) && freeAfter >= 1 && v.y + v.h / 2 < py - 200) v.moving = true;
      else { v.toLane = v.lane; v.blinkY = null; }
      v.changeY = null;
    }
    if (v.moving) {
      const d = LANES[v.toLane] - v.x;
      v.x += d * (1 - Math.exp(-dt * 4.5));
      if (Math.abs(d) < 1.5) { v.x = LANES[v.toLane]; v.lane = v.toLane; v.moving = false; v.blinkY = null; }
      else if (Math.abs(d) < 49) v.lane = v.toLane;
    }

    if (phase !== 'playing') continue;
    const vTop = v.y - v.h / 2;
    const vBot = v.y + v.h / 2;
    const gapX = Math.abs(w.px - v.x);
    if (vBot > pTop + 5 && vTop < pBot - 5 && gapX < (v.w + PW) / 2 - 3) {
      if (w.invuln > 0) continue;
      if (w.shield) {
        w.shield = false;
        w.invuln = 0.9;
        w.stats.shields++;
        v.knock = 0.8;
        v.vx = (v.x >= w.px ? 1 : -1) * 260;
        w.shake = 0.6;
        w.flash = 0.35;
        burst(w, (v.x + w.px) / 2, pTop, 12, true);
        w.popups.push({ x: w.px, y: py - 44, text: hooks.labels.blocked, life: 1, accent: true });
        hooks.onBlock();
        continue;
      }
      w.endAt = w.clock;
      w.shake = 1;
      w.flash = 1;
      burst(w, (v.x + w.px) / 2, pTop + 4, 22, false);
      hooks.onCrash();
      return;
    }
    if (vBot > pTop - missWindow && vTop < pBot) v.minGap = Math.min(v.minGap, gapX);
    if (!v.passed && vTop > pBot) {
      v.passed = true;
      if (v.minGap < 64) {
        w.combo = w.comboLeft > 0 ? w.combo + 1 : 1;
        w.comboLeft = 2.8;
        w.stats.misses++;
        w.stats.bestCombo = Math.max(w.stats.bestCombo, w.combo);
        w.fuel = Math.min(1, w.fuel + MISS_FUEL);
        w.slip += 0.2 + 0.05 * (Math.min(w.combo, 6) - 1);
        w.popups.push({ x: v.x, y: py - 30, text: w.combo > 1 ? `${hooks.labels.nearMiss} ×${w.combo}` : hooks.labels.nearMiss, life: 1, accent: w.combo > 1 });
        hooks.onMiss(w.combo);
        if (w.slip >= 1) {
          if (!w.shield) {
            w.shield = true;
            w.slip = 0;
            w.popups.push({ x: w.px, y: py - 58, text: hooks.labels.shield, life: 1.2, accent: true });
            hooks.onShield();
          } else w.slip = 1;
        }
      }
    }
  }
  w.vehicles = w.vehicles.filter(v => !v.gone && v.y - v.h / 2 < H + 30 && v.y + v.h / 2 > -400);

  for (const c of w.cans) c.y += rel * dt;
  if (phase === 'playing') {
    w.cans = w.cans.filter(c => {
      if (Math.abs(c.x - w.px) < 22 && Math.abs(c.y - py) < 32) {
        w.fuel = Math.min(1, w.fuel + CAN_FUEL);
        w.stats.cans++;
        w.popups.push({ x: c.x, y: py - 36, text: hooks.labels.fuel, life: 1, accent: true });
        hooks.onCan();
        return false;
      }
      return true;
    });
  }
  w.cans = w.cans.filter(c => c.y < H + 30);

  for (const p of w.popups) { p.life -= dt * 1.1; p.y -= dt * 46; }
  w.popups = w.popups.filter(p => p.life > 0);
  for (const s of w.sparks) { s.life -= dt * 1.8; s.x += s.vx * dt; s.y += s.vy * dt + rel * dt * 0.4; s.vx *= 0.96; s.vy *= 0.96; }
  w.sparks = w.sparks.filter(s => s.life > 0);
}

function burst(w: World, x: number, y: number, n: number, accent: boolean) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    w.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.4, accent: accent && i % 2 === 0 });
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────

function withAlpha(hsl: string, a: number) {
  return hsl.startsWith('hsl(') ? hsl.replace('hsl(', 'hsla(').replace(/\)\s*$/, `, ${a})`) : hsl;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function drawRoad(ctx: CanvasRenderingContext2D, w: World, H: number) {
  ctx.fillStyle = '#060607';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  const g = ctx.createLinearGradient(ROAD_L, 0, ROAD_R, 0);
  g.addColorStop(0, '#0e0e10');
  g.addColorStop(0.5, '#141417');
  g.addColorStop(1, '#0e0e10');
  ctx.fillStyle = g;
  ctx.fillRect(ROAD_L, -20, ROAD_R - ROAD_L, H + 40);

  // Rumble strips
  const period = 34;
  const off = w.travel % period;
  ctx.fillStyle = '#1d1d21';
  for (let y = off - period; y < H + period; y += period) {
    ctx.fillRect(ROAD_L - 6, y, 6, period / 2);
    ctx.fillRect(ROAD_R, y, 6, period / 2);
  }
  // Edge lines
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillRect(ROAD_L + 4, -20, 2, H + 40);
  ctx.fillRect(ROAD_R - 6, -20, 2, H + 40);
  // Lane dashes
  const dp = 72;
  const doff = w.travel % dp;
  ctx.fillStyle = 'rgba(255,255,255,0.17)';
  for (let y = doff - dp; y < H + dp; y += dp) {
    ctx.fillRect((LANES[0] + LANES[1]) / 2 - 1.5, y, 3, 32);
    ctx.fillRect((LANES[1] + LANES[2]) / 2 - 1.5, y, 3, 32);
  }
  // Speed streaks once it's quick
  const s = Math.min(1, Math.max(0, (w.speed - 380) / 600));
  if (s > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 * s})`;
    const len = 30 + w.speed * 0.08;
    const sp = 173;
    const soff = (w.travel * 1.6) % sp;
    const xs = [4, 38, 112, 208, 282, 316];
    xs.forEach((x, i) => {
      for (let y = soff - sp + i * 29; y < H + sp; y += sp) ctx.fillRect(x, y, 1, len);
    });
  }
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, clock: number) {
  const { w, h } = v;
  ctx.save();
  ctx.translate(v.x, v.y);
  if (v.knock > 0) {
    ctx.rotate(v.spin);
    ctx.globalAlpha = Math.max(0, Math.min(1, v.knock / 0.5));
  }
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, -w / 2 + 2, -h / 2 + 4, w, h, 7);
  ctx.fill();

  if (v.kind === 'truck') {
    // Trailer
    ctx.fillStyle = v.shade;
    rr(ctx, -w / 2, -h / 2 + 30, w, h - 30, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = -h / 2 + 44; y < h / 2 - 8; y += 16) ctx.fillRect(-w / 2 + 3, y, w - 6, 1);
    // Cab
    ctx.fillStyle = '#27272a';
    rr(ctx, -w / 2 + 1, -h / 2, w - 2, 27, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rr(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, 7, 2);
    ctx.fill();
  } else {
    ctx.fillStyle = v.shade;
    rr(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fill();
    const side = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.28)');
    side.addColorStop(0.3, 'rgba(0,0,0,0)');
    side.addColorStop(0.7, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = side;
    rr(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fill();
    // Windscreen, roof, rear window
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    rr(ctx, -w / 2 + 4, -h / 2 + 11, w - 8, 10, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, -w / 2 + 5, -h / 2 + 22, w - 10, h - (v.kind === 'van' ? 30 : 38), 3);
    ctx.fill();
    if (v.kind === 'car') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rr(ctx, -w / 2 + 5, h / 2 - 15, w - 10, 6, 2);
      ctx.fill();
    }
  }
  // Rim so grey cars read on the tarmac
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  rr(ctx, -w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, v.kind === 'truck' ? 4 : 8);
  ctx.stroke();

  // Tail lights
  ctx.fillStyle = 'rgba(239,68,68,0.28)';
  ctx.fillRect(-w / 2, h / 2 - 6, 11, 7);
  ctx.fillRect(w / 2 - 11, h / 2 - 6, 11, 7);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-w / 2 + 2, h / 2 - 4, 7, 3);
  ctx.fillRect(w / 2 - 9, h / 2 - 4, 7, 3);

  // Indicators
  const signalling = v.knock <= 0 && (v.toLane !== v.lane || v.moving);
  if (signalling && Math.floor(clock * 6) % 2 === 0) {
    const sx = (v.toLane > v.lane || LANES[v.toLane] > v.x ? 1 : -1) * (w / 2 - 1);
    ctx.fillStyle = 'rgba(245,158,11,0.35)';
    ctx.beginPath(); ctx.arc(sx, -h / 2 + 4, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, h / 2 - 4, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(sx - 2, -h / 2 + 2, 4, 4);
    ctx.fillRect(sx - 2, h / 2 - 6, 4, 4);
  }
  ctx.restore();
}

function drawCan(ctx: CanvasRenderingContext2D, c: Can, clock: number, accent: string) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const pulse = 0.14 + 0.08 * Math.sin(clock * 6);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  glow.addColorStop(0, withAlpha(accent, pulse + 0.1));
  glow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accent;
  rr(ctx, -8, -10, 16, 21, 3);
  ctx.fill();
  ctx.fillRect(3, -14, 4, 5);
  ctx.fillStyle = '#0b0b0c';
  rr(ctx, -5, -7, 7, 4, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 8); ctx.moveTo(5, 0); ctx.lineTo(-5, 8); ctx.stroke();
  ctx.restore();
}

function drawRider(ctx: CanvasRenderingContext2D, w: World, py: number, accent: string, phase: Phase) {
  // Headlight
  if (phase !== 'crashing') {
    const beam = ctx.createLinearGradient(0, py - 20, 0, py - 240);
    beam.addColorStop(0, withAlpha(accent, 0.2));
    beam.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(w.px - 4, py - 20);
    ctx.lineTo(w.px - 56 + w.lean * 60, py - 240);
    ctx.lineTo(w.px + 56 + w.lean * 60, py - 240);
    ctx.lineTo(w.px + 4, py - 20);
    ctx.closePath();
    ctx.fill();
  }

  ctx.save();
  ctx.translate(w.px, py);
  ctx.rotate(w.lean);
  if (w.invuln > 0 && Math.floor(w.clock * 14) % 2 === 0) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(2, 4, 10, 22, 0, 0, Math.PI * 2); ctx.fill();
  // Tyres
  ctx.fillStyle = '#050505';
  rr(ctx, -3.5, 7, 7, 15, 3); ctx.fill();
  rr(ctx, -3, -22, 6, 12, 3); ctx.fill();
  // Body
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(8, -13, 7, 1);
  ctx.lineTo(5, 13);
  ctx.quadraticCurveTo(0, 18, -5, 13);
  ctx.lineTo(-7, 1);
  ctx.quadraticCurveTo(-8, -13, 0, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.ellipse(-2, -8, 2, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Bars
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, -11); ctx.lineTo(9, -11); ctx.stroke();
  // Rider
  ctx.fillStyle = '#18181b';
  rr(ctx, -8, -5, 16, 11, 5); ctx.fill();
  ctx.fillStyle = '#f4f4f5';
  ctx.beginPath(); ctx.arc(0, -3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath(); ctx.arc(0, -4.5, 3.4, Math.PI * 1.1, Math.PI * 1.9); ctx.lineTo(0, -4.5); ctx.fill();
  // Tail light
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-2, 15, 4, 2);
  ctx.restore();

  if (w.shield) {
    const r = 29 + Math.sin(w.clock * 5) * 1.5;
    ctx.fillStyle = withAlpha(accent, 0.08);
    ctx.strokeStyle = withAlpha(accent, 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w.px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function draw(ctx: CanvasRenderingContext2D, w: World, H: number, accent: string, phase: Phase, reduced: boolean) {
  ctx.save();
  if (w.shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * 9 * w.shake, (Math.random() - 0.5) * 9 * w.shake);
  drawRoad(ctx, w, H);
  for (const c of w.cans) drawCan(ctx, c, w.clock, accent);
  const py = playerYFor(H);
  drawRider(ctx, w, py, accent, phase);
  for (const v of w.vehicles) drawVehicle(ctx, v, w.clock);
  for (const s of w.sparks) {
    ctx.fillStyle = s.accent ? withAlpha(accent, s.life) : `rgba(255,255,255,${s.life})`;
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  for (const p of w.popups) {
    const a = Math.min(1, p.life * 1.6);
    ctx.fillStyle = p.accent ? withAlpha(accent, a) : `rgba(255,255,255,${a})`;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
  if (w.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${w.flash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Component ────────────────────────────────────────────────────────────

interface Result { score: number; reason: EndReason; record: boolean; missRecord: boolean; stats: Stats }

interface PetrolHeadProps {
  accentColor: string;
  /** Show km/h (off when the rider hasn't asked for speed-focused stats). */
  showSpeed: boolean;
}

export function PetrolHead({ accentColor, showSpeed }: PetrolHeadProps) {
  const { scores } = useArcadeScores();
  const modeBests = useModeBests();
  const best = scores['petrol-head'];
  const bestMisses = modeBests['petrol-head-misses'];

  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const [result, setResult] = useState<Result | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(newWorld(true));
  const sizeRef = useRef({ H: 560, scale: 1, dpr: 1 });
  const [boxW, setBoxW] = useState(0);
  const accentRef = useRef(accentColor);
  accentRef.current = accentColor;
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const kickRef = useRef<() => void>(() => {});

  // HUD, written straight to the DOM each frame.
  const timeRef = useRef<HTMLSpanElement>(null);
  const kmhRef = useRef<HTMLSpanElement>(null);
  const fuelRef = useRef<HTMLDivElement>(null);
  const fuelPillRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const hudCache = useRef({ t: -1, kmh: -1, low: false, shield: false, combo: -1 });

  const labels = useRef({ nearMiss: tr("Near miss"), shield: tr("Shield ready"), fuel: tr("+ Fuel"), blocked: tr("Shield hit") });

  const finishRun = useCallback((reason: EndReason) => {
    const w = worldRef.current;
    const score = Math.floor(w.t);
    const record = saveScore('petrol-head', score);
    const missRecord = saveModeBest('petrol-head-misses', w.stats.misses);
    setResult({ score, reason, record, missRecord, stats: { ...w.stats } });
  }, []);

  const hooks = useRef<Hooks>({
    onCrash: () => { setPhase('crashing'); haptics.error(); finishRun('crash'); },
    onDry: () => { setPhase('coasting'); haptics.medium(); finishRun('fuel'); },
    onEnd: () => setPhase('over'),
    onMiss: (combo) => (combo > 2 ? haptics.light() : haptics.tick()),
    onShield: () => haptics.success(),
    onCan: () => haptics.light(),
    onBlock: () => haptics.heavy(),
    labels: labels.current,
  });

  // Size the canvas to the space it's given (portrait road, sharp at any DPR).
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const fit = () => {
      const rect = area.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const cssW = Math.min(rect.width, rect.height * 0.72);
      const scale = cssW / W;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      sizeRef.current = { H: rect.height / scale, scale, dpr };
      const c = canvasRef.current;
      if (c) {
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(rect.height * dpr);
        c.style.width = `${cssW}px`;
        c.style.height = `${rect.height}px`;
      }
      setBoxW(cssW);
      kickRef.current();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // One loop for attract mode, the run and the crash; it sleeps when paused or over.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      const w = worldRef.current;
      const ph = phaseRef.current;
      const { H, scale, dpr } = sizeRef.current;
      if (ph !== 'paused' && ph !== 'over') step(w, dt, H, ph, hooks.current);
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (ctx) {
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        draw(ctx, w, H, accentRef.current, phaseRef.current, !!reduced.current);
      }
      updateHud(w);
      const now = phaseRef.current;
      if (now !== 'paused' && now !== 'over') raf = requestAnimationFrame(tick);
      else last = 0;
    };
    kickRef.current = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    kickRef.current();
    return () => cancelAnimationFrame(raf);
  }, []);

  function updateHud(w: World) {
    const h = hudCache.current;
    const t = Math.floor(w.t);
    if (t !== h.t && timeRef.current) { timeRef.current.textContent = String(t); h.t = t; }
    const kmh = kmhOf(w.speed);
    if (kmh !== h.kmh && kmhRef.current) { kmhRef.current.textContent = String(kmh); h.kmh = kmh; }
    if (fuelRef.current) fuelRef.current.style.transform = `scaleX(${w.fuel})`;
    const low = w.fuel < 0.25;
    if (low !== h.low && fuelPillRef.current) { fuelPillRef.current.dataset.low = low ? '1' : '0'; h.low = low; }
    if (slipRef.current) slipRef.current.style.transform = `scaleX(${w.shield ? 1 : w.slip})`;
    if (w.shield !== h.shield && shieldRef.current) { shieldRef.current.dataset.on = w.shield ? '1' : '0'; h.shield = w.shield; }
    const combo = w.combo > 1 ? w.combo : 0;
    if (combo !== h.combo && comboRef.current) {
      comboRef.current.textContent = combo ? `×${combo}` : '';
      comboRef.current.dataset.on = combo ? '1' : '0';
      h.combo = combo;
    }
  }

  const start = useCallback(() => {
    worldRef.current = newWorld(false);
    hudCache.current = { t: -1, kmh: -1, low: false, shield: false, combo: -1 };
    setResult(null);
    setPhase('playing');
    kickRef.current();
  }, []);

  const toMenu = useCallback(() => {
    worldRef.current = newWorld(true);
    setResult(null);
    setPhase('idle');
    kickRef.current();
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    setPhase('paused');
  }, []);
  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    setPhase('playing');
    kickRef.current();
  }, []);

  const steer = useCallback((dir: -1 | 1) => {
    if (phaseRef.current !== 'playing') return;
    const w = worldRef.current;
    const next = Math.max(0, Math.min(2, w.lane + dir));
    if (next !== w.lane) { w.lane = next; haptics.tick(); }
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); steer(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); steer(1); }
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (phaseRef.current === 'playing') pause(); else resume(); }
      else if ((e.key === ' ' || e.key === 'Enter') && (phaseRef.current === 'idle' || phaseRef.current === 'over')) { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer, pause, resume, start]);

  // Leaving the app pauses the run.
  useEffect(() => {
    const onHide = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', pause);
    };
  }, [pause]);

  // Touch: a swipe steers as soon as it's clear which way; otherwise a tap steers by side.
  const gesture = useRef<{ x: number; y: number; done: boolean; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'playing') return;
    gesture.current = { x: e.clientX, y: e.clientY, done: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.done || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(e.clientY - g.y)) {
      g.done = true;
      steer(dx < 0 ? -1 : 1);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.done || g.id !== e.pointerId) return;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    steer(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
  };

  const inRun = phase === 'playing' || phase === 'paused' || phase === 'crashing' || phase === 'coasting';
  const safeBottom = 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]';

  return (
    <div
      ref={areaRef}
      data-no-pull
      className="absolute inset-0 overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; }}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: boxW || '100%' }}>
        <canvas ref={canvasRef} className="block" />
        {/* Distance fade */}
        <div className="absolute inset-x-0 top-0 h-24 pointer-events-none bg-gradient-to-b from-background to-transparent" />

        {/* HUD */}
        <div className={cn('absolute inset-x-0 top-0 px-3 pt-2 pointer-events-none transition-opacity duration-300', inRun ? 'opacity-100' : 'opacity-0')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-0.5">
                <span ref={timeRef} className="font-mono text-[40px] font-semibold leading-none text-foreground">0</span>
                <span className="text-sm text-muted-foreground">s</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
                {best > 0 ? tr("Best {0}s", [best]) : tr("First run")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showSpeed && (
                <div className="rounded-full frost px-3 py-1.5 flex items-baseline gap-1">
                  <span ref={kmhRef} className="font-mono text-sm font-semibold text-foreground">0</span>
                  <span className="text-[10px] text-muted-foreground">{tr("km/h")}</span>
                </div>
              )}
              <HeaderButton
                className="pointer-events-auto"
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onClick={() => (phaseRef.current === 'paused' ? resume() : pause())}
                aria-label={phase === 'paused' ? tr("Resume") : tr("Pause")}
              >
                {phase === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </HeaderButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <div ref={fuelPillRef} data-low="0" className="group rounded-full frost px-3 py-2 flex items-center gap-2 data-[low=1]:border-destructive/60 data-[low=1]:animate-pulse">
              <Fuel className="w-3.5 h-3.5 text-accent group-data-[low=1]:text-destructive shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div ref={fuelRef} className="h-full w-full origin-left rounded-full bg-accent group-data-[low=1]:bg-destructive" />
              </div>
            </div>
            <div ref={shieldRef} data-on="0" className="group rounded-full frost px-3 py-2 flex items-center gap-2 data-[on=1]:border-accent/70">
              <Wind className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-data-[on=1]:hidden" />
              <Shield className="w-3.5 h-3.5 text-accent shrink-0 hidden group-data-[on=1]:block" />
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div ref={slipRef} className="h-full w-full origin-left rounded-full bg-foreground/70 group-data-[on=1]:bg-accent" style={{ transform: 'scaleX(0)' }} />
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-3">
            <div
              ref={comboRef}
              data-on="0"
              className="font-mono text-2xl font-semibold text-accent opacity-0 scale-75 transition-all duration-200 data-[on=1]:opacity-100 data-[on=1]:scale-100"
            />
          </div>
        </div>

        {/* Start */}
        {phase === 'idle' && (
          <div className={cn('absolute inset-x-3 frost rounded-3xl p-4 flex flex-col gap-3 animate-slide-up', safeBottom)}>
            <div className="flex flex-col gap-2.5">
              {[
                { icon: MoveHorizontal, text: tr("Swipe or tap either side to change lanes.") },
                { icon: Wind, text: tr("Cut past traffic late for near misses. Chain them and a shield charges.") },
                { icon: Fuel, text: tr("Grab fuel on the way. Run dry and it's over.") },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <p className="text-[13px] leading-snug text-foreground/90 pt-1">{text}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{tr("Best time")}</div>
                <div className="font-mono text-lg font-semibold text-foreground">{best > 0 ? `${best} s` : '—'}</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{tr("Most near misses")}</div>
                <div className="font-mono text-lg font-semibold text-foreground">{bestMisses > 0 ? bestMisses : '—'}</div>
              </div>
            </div>
            <Button variant="accent" size="xl" className="w-full" onClick={start}>{tr("Start")}</Button>
          </div>
        )}

        {/* Paused */}
        {phase === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-background/40">
            <div className="w-full max-w-[260px] frost rounded-3xl p-4 flex flex-col gap-3 animate-scale-in">
              <p className="text-center text-lg font-semibold text-foreground">{tr("Paused")}</p>
              <Button variant="accent" size="xl" onClick={resume}>{tr("Resume")}</Button>
              <Button variant="outline" size="lg" onClick={toMenu}>{tr("Quit run")}</Button>
            </div>
          </div>
        )}

        {/* Result */}
        {phase === 'over' && result && (
          <div className={cn('absolute inset-x-3 frost rounded-3xl p-4 flex flex-col gap-3 animate-slide-up', safeBottom)}>
            <div className="text-center">
              <p className={cn('text-xs font-medium uppercase tracking-[0.16em]', result.reason === 'crash' ? 'text-destructive' : 'text-warning')}>
                {result.reason === 'crash' ? tr("Crashed") : tr("Out of fuel")}
              </p>
              <p className="font-mono text-6xl font-semibold text-foreground leading-none mt-2 animate-scale-in">
                {result.score}<span className="text-2xl text-muted-foreground ml-1">s</span>
              </p>
              <div className="mt-2 h-6 flex items-center justify-center">
                {result.record ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                    <Trophy className="w-3 h-3" />{tr("New personal best")}
                  </span>
                ) : best > 0 ? (
                  <span className="text-xs text-muted-foreground">{tr("Best {0}s", [best])}</span>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 stagger-in">
              {[
                { label: tr("Near misses"), value: result.stats.misses, star: result.missRecord && result.stats.misses > 0 },
                { label: tr("Best combo"), value: result.stats.bestCombo > 1 ? `×${result.stats.bestCombo}` : '—' },
                { label: tr("Fuel cans"), value: result.stats.cans },
                showSpeed
                  ? { label: tr("Top speed"), value: `${result.stats.topKmh} ${tr("km/h")}` }
                  : { label: tr("Shields used"), value: result.stats.shields },
              ].map((s, i) => (
                <div key={i} style={{ ['--i' as string]: i }} className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1">
                    {s.label}{s.star && <Trophy className="w-3 h-3 text-accent" />}
                  </div>
                  <div className="font-mono text-lg font-semibold text-foreground">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="xl" onClick={toMenu}>{tr("Menu")}</Button>
              <Button variant="accent" size="xl" onClick={start}>{tr("Again")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
