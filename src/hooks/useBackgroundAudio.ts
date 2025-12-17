import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to keep audio session alive when app is in background
 * Uses a silent audio loop to maintain audio focus on mobile
 */
export function useBackgroundAudio(enabled: boolean = false) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startBackgroundAudio = useCallback(() => {
    // Create a silent audio element to maintain audio session
    if (!audioRef.current) {
      const audio = new Audio();
      // Tiny silent WAV (44 bytes) - base64 encoded
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.loop = true;
      audio.volume = 0.001; // Nearly silent
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audioRef.current = audio;
    }

    // Create audio context to keep audio processing alive
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    // Resume audio context if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    // Play silent audio to maintain audio focus
    audioRef.current.play().catch(() => {
      // Autoplay blocked - will try again on user interaction
      console.log('[BackgroundAudio] Autoplay blocked, will retry on interaction');
    });

    console.log('[BackgroundAudio] Started');
  }, []);

  const stopBackgroundAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    console.log('[BackgroundAudio] Stopped');
  }, []);

  // Handle visibility changes to keep audio alive
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // App going to background - ensure audio stays alive
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      } else if (document.visibilityState === 'visible') {
        // App returning to foreground
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled]);

  // Start/stop based on enabled state
  useEffect(() => {
    if (enabled) {
      startBackgroundAudio();
    } else {
      stopBackgroundAudio();
    }

    return () => {
      stopBackgroundAudio();
    };
  }, [enabled, startBackgroundAudio, stopBackgroundAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  return {
    startBackgroundAudio,
    stopBackgroundAudio,
  };
}
