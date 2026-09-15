import { useEffect, useRef, useState, useCallback } from 'react';
import { saveScore, useArcadeScores } from '../../hooks/useArcadeScores';

type GameState = 'idle' | 'playing' | 'gameover';

type EnemyKind = 'car' | 'truck';
interface Enemy { lane: number; y: number; color: string; kind: EnemyKind; hh: number; }

const CW = 320;
const CH = 500;
const LANES = [53, 160, 267] as const;
const PLAYER_Y = 430;
const PLAYER_HH = 20; // half-height for collision
const ENEMY_HH = 21;
const CAR_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];

// --- Drawing primitives ---

function drawRoad(ctx: CanvasRenderingContext2D, frame: number, speed: number) {
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, CW, CH);

  // Shoulders
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 8, CH);
  ctx.fillRect(312, 0, 8, CH);

  // Edge lines
  ctx.fillStyle = '#ffffff18';
  ctx.fillRect(8, 0, 2, CH);
  ctx.fillRect(310, 0, 2, CH);

  // Scrolling lane dividers
  const dashH = 26;
  const period = 46;
  const offset = (frame * speed) % period;
  ctx.fillStyle = '#ffffff2a';
  for (let y = offset - period; y < CH + dashH; y += period) {
    ctx.fillRect(106, y, 4, dashH);
    ctx.fillRect(210, y, 4, dashH);
  }
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - 13, y - ENEMY_HH, 26, ENEMY_HH * 2);

  // Roof overlay
  ctx.fillStyle = '#00000044';
  ctx.fillRect(x - 10, y - 14, 20, 20);

  // Windows
  ctx.fillStyle = '#00000099';
  ctx.fillRect(x - 9, y - 13, 18, 7);
  ctx.fillRect(x - 9, y + 6, 18, 7);

  // Headlights
  ctx.fillStyle = '#ffffffdd';
  ctx.fillRect(x - 12, y - ENEMY_HH + 1, 5, 4);
  ctx.fillRect(x + 7, y - ENEMY_HH + 1, 5, 4);

  // Tail lights
  ctx.fillStyle = '#ff000099';
  ctx.fillRect(x - 12, y + ENEMY_HH - 5, 5, 3);
  ctx.fillRect(x + 7, y + ENEMY_HH - 5, 5, 3);

  // Wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 15, y - 14, 3, 8);
  ctx.fillRect(x + 12, y - 14, 3, 8);
  ctx.fillRect(x - 15, y + 6, 3, 8);
  ctx.fillRect(x + 12, y + 6, 3, 8);
}

function drawBike(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  // Rear wheel
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 10, y + 10, 20, 6);
  ctx.fillStyle = '#444';
  ctx.fillRect(x - 8, y + 11, 16, 2);

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - 8, y - 16, 16, 28);

  // Fairing
  ctx.fillStyle = '#ffffff15';
  ctx.fillRect(x - 6, y - 20, 12, 8);

  // Front wheel
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 10, y - 22, 20, 6);
  ctx.fillStyle = '#444';
  ctx.fillRect(x - 8, y - 21, 16, 2);

  // Rider helmet
  ctx.fillStyle = '#ffffffbb';
  ctx.fillRect(x - 4, y - 28, 8, 8);
  ctx.fillStyle = '#00000066';
  ctx.fillRect(x - 4, y - 25, 8, 3);
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, best: number, accent: string) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#00000099';
  ctx.fillRect(4, 4, 114, 22);
  ctx.fillRect(CW - 118, 4, 114, 22);

  ctx.font = 'bold 10px monospace';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${score}s`, 10, 15);

  ctx.fillStyle = '#ffffff55';
  ctx.textAlign = 'right';
  ctx.fillText(`BEST: ${best}s`, CW - 10, 15);
}

// --- Component ---

interface PetrolHeadProps {
  accentColor: string;
}

export function PetrolHead({ accentColor }: PetrolHeadProps) {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  // All mutable game state in refs (avoid stale closures in RAF loop)
  const playerLaneRef = useRef(1);
  const enemiesRef = useRef<Enemy[]>([]);
  const speedRef = useRef(3);
  const frameRef = useRef(0);
  const scoreRef = useRef(0);
  const gameStateRef = useRef<GameState>('idle');

  const { scores } = useArcadeScores();
  const bestRef = useRef(scores['petrol-head']);
  useEffect(() => { bestRef.current = scores['petrol-head']; }, [scores]);

  // Draw static idle canvas
  const drawIdle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawRoad(ctx, 0, 0);
    // A few ghost cars for preview
    drawCar(ctx, LANES[0], 120, '#ef444466');
    drawCar(ctx, LANES[2], 80, '#3b82f666');
    drawCar(ctx, LANES[1], 220, '#f59e0b66');
    drawBike(ctx, LANES[1], PLAYER_Y, accentColor + '88');
  }, [accentColor]);

  // Main game loop (runs only during 'playing' state)
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameStateRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    frameRef.current++;
    speedRef.current = Math.min(12, 3 + frameRef.current * 0.0005);
    scoreRef.current = Math.floor(frameRef.current / 60);

    // Move enemies
    enemiesRef.current = enemiesRef.current
      .map(e => ({ ...e, y: e.y + speedRef.current }))
      .filter(e => e.y < CH + 60);

    // Spawn (frequency increases over time)
    const spawnEvery = Math.max(22, 70 - Math.floor(scoreRef.current * 0.8));
    if (frameRef.current % spawnEvery === 0) {
      const lane = Math.floor(Math.random() * 3);
      const crowded = enemiesRef.current.some(e => e.lane === lane && e.y < 90);
      if (!crowded) {
        enemiesRef.current = [
          ...enemiesRef.current,
          { lane, y: -ENEMY_HH - 10, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] },
        ];
      }
    }

    // Collision detection
    const pl = playerLaneRef.current;
    const hit = enemiesRef.current.some(
      e => e.lane === pl && e.y + ENEMY_HH >= PLAYER_Y - PLAYER_HH && e.y - ENEMY_HH <= PLAYER_Y + PLAYER_HH
    );

    if (hit) {
      const finalScore = scoreRef.current;
      const newBest = saveScore('petrol-head', finalScore);
      setScore(finalScore);
      setIsNewRecord(newBest);
      setGameState('gameover');
      gameStateRef.current = 'gameover';
      // Draw one final frozen frame (bike + crash highlight)
      drawRoad(ctx, frameRef.current, speedRef.current);
      for (const e of enemiesRef.current) drawCar(ctx, LANES[e.lane], e.y, e.color);
      ctx.fillStyle = '#ff000033';
      ctx.fillRect(0, 0, CW, CH);
      drawBike(ctx, LANES[pl], PLAYER_Y, '#ef4444');
      return;
    }

    // Draw
    drawRoad(ctx, frameRef.current, speedRef.current);
    for (const e of enemiesRef.current) drawCar(ctx, LANES[e.lane], e.y, e.color);
    drawBike(ctx, LANES[pl], PLAYER_Y, accentColor);
    drawHUD(ctx, scoreRef.current, bestRef.current, accentColor);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [accentColor]);

  // Input: keyboard
  useEffect(() => {
    if (gameState !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') playerLaneRef.current = Math.max(0, playerLaneRef.current - 1);
      if (e.key === 'ArrowRight') playerLaneRef.current = Math.min(2, playerLaneRef.current + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState]);

  // Input: touch
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (gameStateRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const relX = (touchX / rect.width) * CW; // scale to logical canvas coords
    if (relX < CW / 2) {
      playerLaneRef.current = Math.max(0, playerLaneRef.current - 1);
    } else {
      playerLaneRef.current = Math.min(2, playerLaneRef.current + 1);
    }
  }, []);

  // Start game
  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playerLaneRef.current = 1;
    enemiesRef.current = [];
    speedRef.current = 3;
    frameRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setIsNewRecord(false);
    setGameState('playing');
    gameStateRef.current = 'playing';
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // Cleanup RAF on unmount
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  // Draw idle canvas on mount and when returning to idle
  useEffect(() => {
    if (gameState === 'idle') drawIdle();
  }, [gameState, drawIdle]);

  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
      {/* Scanline overlay (pointer-events: none so it doesn't block touches) */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, #00000018 3px, #00000018 4px)',
        }}
      />

      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        onTouchStart={onTouchStart}
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          touchAction: 'none',
        }}
      />

      {/* Idle overlay */}
      {gameState === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-24 z-20">
          <div className="flex flex-col items-center gap-4">
            {scores['petrol-head'] > 0 && (
              <p className="font-mono text-[10px] tracking-widest uppercase text-white/30">
                BEST: {scores['petrol-head']}s
              </p>
            )}
            <button
              onClick={startGame}
              className="font-mono text-sm tracking-widest uppercase px-10 py-4 border-2 rounded-xl font-bold"
              style={{ borderColor: accentColor, color: accentColor, boxShadow: `0 0 14px ${accentColor}44` }}
            >
              START
            </button>
            <p className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground/50 text-center">
              TAP LEFT / RIGHT TO CHANGE LANES
            </p>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20" style={{ background: '#00000088' }}>
          <div className="text-center">
            <p className="font-mono text-xs tracking-widest uppercase text-red-400 mb-2">GAME OVER</p>
            <p
              className="font-mono text-6xl font-bold tabular-nums"
              style={{ color: accentColor, textShadow: `0 0 16px ${accentColor}88` }}
            >
              {score}<span className="text-2xl ml-1 opacity-60">s</span>
            </p>
            {isNewRecord && (
              <p
                className="mt-2 font-mono text-xs tracking-widest uppercase font-bold"
                style={{ color: accentColor, textShadow: `0 0 8px ${accentColor}` }}
              >
                ★ NEW RECORD ★
              </p>
            )}
            {!isNewRecord && scores['petrol-head'] > 0 && (
              <p className="mt-2 font-mono text-[10px] tracking-widest uppercase text-white/30">
                BEST: {scores['petrol-head']}s
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={startGame}
              className="font-mono text-xs tracking-widest uppercase px-6 py-4 border-2 rounded-xl"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              AGAIN
            </button>
            <button
              onClick={() => setGameState('idle')}
              className="font-mono text-xs tracking-widest uppercase px-6 py-4 rounded-xl border border-border/40 text-muted-foreground"
            >
              MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
