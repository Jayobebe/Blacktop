import { useState, useRef, useCallback, useEffect } from 'react';

interface PiPStats {
  speed: number;
  distance: number;
  duration: number;
  speedUnit: string;
  distanceUnit: string;
  leanAngle?: number;
  maxLeanLeft?: number;
  maxLeanRight?: number;
  leanEnabled?: boolean;
  // Convoy stats
  convoyName?: string;
  memberCount?: number;
  isLeader?: boolean;
}

export function usePictureInPicture() {
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(false); // Use ref to avoid stale closure in animation loop
  const statsRef = useRef<PiPStats>({
    speed: 0,
    distance: 0,
    duration: 0,
    speedUnit: 'MPH',
    distanceUnit: 'mi',
    leanAngle: 0,
    maxLeanLeft: 0,
    maxLeanRight: 0,
    leanEnabled: false,
  });

  // Check PiP support on mount
  useEffect(() => {
    const hasPiPAPI = 'pictureInPictureEnabled' in document;
    const isPiPEnabled = hasPiPAPI && (document as any).pictureInPictureEnabled === true;
    const hasRequestPiP = 'requestPictureInPicture' in HTMLVideoElement.prototype;
    
    const supported = isPiPEnabled && hasRequestPiP;
    console.log('[PiP] Support check:', { hasPiPAPI, isPiPEnabled, hasRequestPiP, supported });
    setIsPiPSupported(supported);
  }, []);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const drawLeanAngleBar = (ctx: CanvasRenderingContext2D, width: number, y: number, stats: PiPStats) => {
    const barWidth = width - 40;
    const barHeight = 8;
    const centerX = width / 2;
    const startX = 20;
    
    // Background bar
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.roundRect(startX, y, barWidth, barHeight, 4);
    ctx.fill();
    
    // Center line
    ctx.fillStyle = '#52525b';
    ctx.fillRect(centerX - 1, y - 2, 2, barHeight + 4);
    
    const leanAngle = stats.leanAngle || 0;
    const maxLean = 45; // Maximum lean angle for visualization
    
    // Current lean indicator
    const leanPercent = Math.min(Math.abs(leanAngle) / maxLean, 1);
    const leanWidth = (barWidth / 2) * leanPercent;
    
    // Gradient based on lean intensity
    let leanColor = '#22c55e'; // Green for low lean
    if (Math.abs(leanAngle) > 30) {
      leanColor = '#ef4444'; // Red for high lean
    } else if (Math.abs(leanAngle) > 20) {
      leanColor = '#f59e0b'; // Amber for medium lean
    }
    
    ctx.fillStyle = leanColor;
    if (leanAngle < 0) {
      // Leaning left
      ctx.beginPath();
      ctx.roundRect(centerX - leanWidth, y, leanWidth, barHeight, 2);
      ctx.fill();
    } else if (leanAngle > 0) {
      // Leaning right
      ctx.beginPath();
      ctx.roundRect(centerX, y, leanWidth, barHeight, 2);
      ctx.fill();
    }
    
    // Lean angle text
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(leanAngle))}°`, centerX, y + barHeight + 14);
  };

  const drawStats = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      if (isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(drawStats);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(drawStats);
      }
      return;
    }

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

    // Convoy info at top if present
    let topOffset = 12;
    if (stats.convoyName) {
      ctx.fillStyle = '#71717a';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const convoyText = stats.isLeader 
        ? `👑 ${stats.convoyName} (${stats.memberCount || 1})`
        : `${stats.convoyName} (${stats.memberCount || 1})`;
      ctx.fillText(convoyText, width / 2, topOffset + 10);
      topOffset += 18;
    }

    // Calculate vertical positions based on whether lean is enabled
    const hasLean = stats.leanEnabled;
    const speedY = hasLean ? height / 2 - 30 : height / 2 - 20;
    const leanBarY = height / 2 + 25;

    // Draw speed (large, centered)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(stats.speed).toString(), width / 2, speedY);

    // Draw speed unit
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillText(stats.speedUnit, width / 2, speedY + 38);

    // Draw lean angle bar if enabled
    if (hasLean) {
      drawLeanAngleBar(ctx, width, leanBarY, stats);
    }

    // Draw distance (bottom left)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#71717a';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('DISTANCE', 16, height - 38);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    const distanceText = stats.distance < 10 
      ? stats.distance.toFixed(2) 
      : stats.distance.toFixed(1);
    ctx.fillText(`${distanceText} ${stats.distanceUnit}`, 16, height - 20);

    // Draw duration (bottom right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#71717a';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('TIME', width - 16, height - 38);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatDuration(stats.duration), width - 16, height - 20);

    // Schedule next frame using ref instead of state
    if (isActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(drawStats);
    }
  }, []);

  const startPiP = useCallback(async () => {
    console.log('[PiP] Starting PiP, supported:', isPiPSupported);
    
    if (!isPiPSupported) {
      console.warn('[PiP] Picture-in-Picture is not supported');
      return false;
    }

    try {
      // Create canvas if it doesn't exist
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        canvasRef.current = canvas;
        console.log('[PiP] Canvas created');
      }

      // Draw initial frame before capturing
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', 160, 100);
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
        
        console.log('[PiP] Video element created, waiting for metadata...');
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video load timeout'));
          }, 5000);
          
          video.onloadedmetadata = () => {
            console.log('[PiP] Video metadata loaded');
            video.play()
              .then(() => {
                console.log('[PiP] Video playing');
                clearTimeout(timeout);
                resolve();
              })
              .catch(reject);
          };
          
          video.onerror = (e) => {
            clearTimeout(timeout);
            reject(e);
          };
        });
        
        videoRef.current = video;
      } else {
        // Ensure video is playing
        if (videoRef.current.paused) {
          await videoRef.current.play();
        }
      }

      // Mark as active BEFORE starting animation loop
      isActiveRef.current = true;
      setIsPiPActive(true);

      // Start drawing stats animation
      drawStats();

      console.log('[PiP] Requesting PiP...');
      
      // Request PiP
      await videoRef.current.requestPictureInPicture();
      
      console.log('[PiP] PiP active!');

      // Listen for PiP exit
      const handleLeavePiP = () => {
        console.log('[PiP] Left PiP mode');
        isActiveRef.current = false;
        setIsPiPActive(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
      
      videoRef.current.addEventListener('leavepictureinpicture', handleLeavePiP, { once: true });

      return true;
    } catch (error) {
      console.error('[PiP] Failed to start Picture-in-Picture:', error);
      isActiveRef.current = false;
      setIsPiPActive(false);
      return false;
    }
  }, [isPiPSupported, drawStats]);

  const stopPiP = useCallback(async () => {
    try {
      isActiveRef.current = false;
      
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      }
      setIsPiPActive(false);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } catch (error) {
      console.error('[PiP] Failed to exit Picture-in-Picture:', error);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    console.log('[PiP] Toggle called, current state:', isPiPActive);
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
      isActiveRef.current = false;
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
