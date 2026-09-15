import { useEffect, useRef, useState, useCallback } from 'react';
import { useGForce } from '@/hooks/useGForce';
import { saveScore, useArcadeScores } from '../../hooks/useArcadeScores';

type GameState = 'idle' | 'countdown' | 'active' | 'result';

const GAME_DURATION = 5;
const MAX_G = 8;

// --- Canvas drawing ---

function drawMeter(canvas: HTMLCanvasElement, g: number, live: boolean, accentHex: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const cx = W / 2;
  const cy = H - 10;
  const r = Math.min(cx - 18, cy - 8);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0, false);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#1c1c1c';
  ctx.stroke();

  // Colored zones on the arc
  const zones: { from: number; to: number; color: string }[] = [
    { from: 0, to: 3, color: '#22c55e' },
    { from: 3, to: 5, color: '#eab308' },
    { from: 5, to: MAX_G, color: '#ef4444' },
  ];
  for (const z of zones) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI + (z.from / MAX_G) * Math.PI, Math.PI + (z.to / MAX_G) * Math.PI, false);
    ctx.lineWidth = 10;
    ctx.strokeStyle = z.color + (live ? 'bb' : '44');
    ctx.stroke();
  }

  // Tick marks and labels
  ctx.lineWidth = 2;
  for (let i = 0; i <= MAX_G; i++) {
    const angle = Math.PI + (i / MAX_G) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const major = i % 2 === 0;
    const outerR = r + 4;
    const innerR = r - (major ? 14 : 8);

    ctx.beginPath();
    ctx.moveTo(cx + cos * outerR, cy + sin * outerR);
    ctx.lineTo(cx + cos * innerR, cy + sin * innerR);
    ctx.strokeStyle = major ? '#ffffff88' : '#ffffff33';
    ctx.lineWidth = major ? 2 : 1;
    ctx.stroke();

    if (major) {
      const labelR = innerR - 11;
      ctx.font = `bold ${i === MAX_G ? 7 : 8}px monospace`;
      ctx.fillStyle = '#ffffff55';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i) + 'G', cx + cos * labelR, cy + sin * labelR);
    }
  }

  // Needle
  const gClamped = Math.min(g, MAX_G);
  const needleAngle = Math.PI + (gClamped / MAX_G) * Math.PI;
  const needleLen = r * 0.82;
  const tipX = cx + Math.cos(needleAngle) * needleLen;
  const tipY = cy + Math.sin(needleAngle) * needleLen;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tipX, tipY);
  ctx.lineWidth = 5;
  ctx.strokeStyle = live ? accentHex : '#555';
  ctx.lineCap = 'square';
  ctx.stroke();

  // Square pivot (pixel-art style)
  ctx.fillStyle = live ? accentHex : '#555';
  ctx.fillRect(Math.round(cx) - 5, Math.round(cy) - 5, 10, 10);
}

// --- Component ---

interface HitHeavyProps {
  accentColor: string;
}

export function HitHeavy({ accentColor }: HitHeavyProps) {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [peakG, setPeakG] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const peakGRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isActive = gameState === 'active';
  const { currentG, permissionGranted, requestPermission } = useGForce(isActive);
  const { scores } = useArcadeScores();
  const bestScore = scores['hit-heavy'];

  // Redraw meter on G change or state change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = isActive ? currentG : (gameState === 'result' ? peakGRef.current : 0);
    drawMeter(canvas, g, isActive, accentColor);
  }, [currentG, gameState, isActive, accentColor]);

  // Track peak G
  useEffect(() => {
    if (!isActive) return;
    if (currentG > peakGRef.current) {
      peakGRef.current = currentG;
      setPeakG(currentG);
    }
  }, [currentG, isActive]);

  // Countdown tick
  useEffect(() => {
    if (gameState !== 'countdown') return;
    if (countdown === 0) {
      setGameState('active');
      setTimeLeft(GAME_DURATION);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, countdown]);

  // Game timer
  useEffect(() => {
    if (gameState !== 'active') return;
    if (timeLeft === 0) {
      const final = peakGRef.current;
      setPeakG(final);
      const newBest = saveScore('hit-heavy', Math.round(final * 100) / 100);
      setIsNewRecord(newBest);
      setGameState('result');
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timeLeft]);

  const start = useCallback(async () => {
    if (!permissionGranted) {
      const ok = await requestPermission();
      if (!ok) return;
    }
    peakGRef.current = 0;
    setPeakG(0);
    setIsNewRecord(false);
    setCountdown(3);
    setGameState('countdown');
  }, [permissionGranted, requestPermission]);

  const reset = useCallback(() => {
    peakGRef.current = 0;
    setPeakG(0);
    setIsNewRecord(false);
    setGameState('idle');
  }, []);

  const displayG = isActive ? currentG : (gameState === 'result' ? peakG : 0);

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-6 w-full flex-1">
      {/* Meter canvas */}
      <div className="w-full max-w-xs relative">
        <canvas
          ref={canvasRef}
          width={300}
          height={170}
          style={{ imageRendering: 'pixelated', width: '100%', height: 'auto' }}
        />

        {/* Countdown overlay */}
        {gameState === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-mono text-7xl font-bold"
              style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}` }}
            >
              {countdown === 0 ? 'GO' : countdown}
            </span>
          </div>
        )}
      </div>

      {/* Digital readout */}
      <div className="text-center">
        <div
          className="font-mono text-6xl font-bold tabular-nums"
          style={{ color: isActive ? accentColor : '#555', textShadow: isActive ? `0 0 16px ${accentColor}88` : 'none' }}
        >
          {displayG.toFixed(2)}
          <span className="text-2xl ml-1 opacity-60">G</span>
        </div>

        {(gameState === 'active' || gameState === 'result') && (
          <div className="mt-1 font-mono text-xs tracking-widest uppercase text-white/30">
            {gameState === 'active' ? `PEAK ${peakG.toFixed(2)}G` : 'PEAK'}
          </div>
        )}

        {gameState === 'active' && (
          <div className="mt-3 font-mono text-sm tracking-widest uppercase" style={{ color: accentColor }}>
            {timeLeft}s
          </div>
        )}
      </div>

      {/* State-specific UI */}
      {gameState === 'idle' && (
        <div className="flex flex-col items-center gap-4 w-full">
          {!permissionGranted ? (
            <button
              onClick={() => requestPermission()}
              className="font-mono text-xs tracking-widest uppercase px-6 py-3 border-2 rounded-xl w-full max-w-xs"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              GRANT SENSOR ACCESS
            </button>
          ) : null}

          {bestScore > 0 && (
            <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              BEST: {bestScore.toFixed(2)}G
            </p>
          )}

          <button
            onClick={start}
            className="font-mono text-sm tracking-widest uppercase px-8 py-4 w-full max-w-xs border-2 rounded-xl font-bold"
            style={{ borderColor: accentColor, color: accentColor, boxShadow: `0 0 12px ${accentColor}44` }}
          >
            HIT IT
          </button>

          <p className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground/50 text-center">
            PUNCH THE AIR · GIVE IT YOUR BEST SHOT
          </p>
        </div>
      )}

      {gameState === 'result' && (
        <div className="flex flex-col items-center gap-4 w-full">
          {isNewRecord ? (
            <p
              className="font-mono text-xs tracking-widest uppercase font-bold"
              style={{ color: accentColor, textShadow: `0 0 8px ${accentColor}` }}
            >
              ★ NEW RECORD ★
            </p>
          ) : bestScore > 0 ? (
            <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              BEST: {bestScore.toFixed(2)}G
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
            <button
              onClick={start}
              className="font-mono text-xs tracking-widest uppercase py-4 border-2 rounded-xl"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              AGAIN
            </button>
            <button
              onClick={reset}
              className="font-mono text-xs tracking-widest uppercase py-4 rounded-xl border border-border/40 text-muted-foreground"
            >
              BACK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
