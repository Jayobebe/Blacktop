import { useState, useRef, useCallback, useEffect } from 'react';

interface PiPStats {
  speed: number;
  distance: number;
  duration: number;
  speedUnit: string;
  distanceUnit: string;
}

export function usePictureInPicture() {
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const statsRef = useRef<PiPStats>({
    speed: 0,
    distance: 0,
    duration: 0,
    speedUnit: 'MPH',
    distanceUnit: 'mi',
  });

  // Check PiP support on mount
  useEffect(() => {
    const supported = 'pictureInPictureEnabled' in document && 
      (document as any).pictureInPictureEnabled;
    setIsPiPSupported(supported);
  }, []);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const drawStats = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stats = statsRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // Clear and draw background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw gradient accent bar at top
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#f59e0b');
    gradient.addColorStop(1, '#ea580c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, 4);

    // Draw speed (large, centered)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(stats.speed).toString(), width / 2, height / 2 - 20);

    // Draw speed unit
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillText(stats.speedUnit, width / 2, height / 2 + 30);

    // Draw distance (bottom left)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#71717a';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('DISTANCE', 20, height - 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    const distanceText = stats.distance < 10 
      ? stats.distance.toFixed(2) 
      : stats.distance.toFixed(1);
    ctx.fillText(`${distanceText} ${stats.distanceUnit}`, 20, height - 25);

    // Draw duration (bottom right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#71717a';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('TIME', width - 20, height - 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatDuration(stats.duration), width - 20, height - 25);

    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(drawStats);
  }, []);

  const startPiP = useCallback(async () => {
    if (!isPiPSupported) {
      console.warn('Picture-in-Picture is not supported');
      return false;
    }

    try {
      // Create canvas if it doesn't exist
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        canvasRef.current = canvas;
      }

      // Create video element if it doesn't exist
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        
        // Capture canvas stream
        const stream = canvasRef.current.captureStream(30);
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            video.play().then(() => resolve());
          };
        });
        
        videoRef.current = video;
      }

      // Start drawing stats
      drawStats();

      // Request PiP
      await (videoRef.current as any).requestPictureInPicture();
      setIsPiPActive(true);

      // Listen for PiP exit
      videoRef.current.addEventListener('leavepictureinpicture', () => {
        setIsPiPActive(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to start Picture-in-Picture:', error);
      return false;
    }
  }, [isPiPSupported, drawStats]);

  const stopPiP = useCallback(async () => {
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      }
      setIsPiPActive(false);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } catch (error) {
      console.error('Failed to exit Picture-in-Picture:', error);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    if (isPiPActive) {
      await stopPiP();
    } else {
      await startPiP();
    }
  }, [isPiPActive, startPiP, stopPiP]);

  const updateStats = useCallback((newStats: Partial<PiPStats>) => {
    statsRef.current = { ...statsRef.current, ...newStats };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if ((document as any).pictureInPictureElement) {
        (document as any).exitPictureInPicture().catch(() => {});
      }
    };
  }, []);

  return {
    isPiPActive,
    isPiPSupported,
    startPiP,
    stopPiP,
    togglePiP,
    updateStats,
  };
}
