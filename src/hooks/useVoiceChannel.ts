import { useState, useCallback, useRef } from 'react';

interface VoiceChannelState {
  isConnected: boolean;
  isMuted: boolean;
  memberCount: number;
}

export function useVoiceChannel() {
  const [state, setState] = useState<VoiceChannelState>({
    isConnected: false,
    isMuted: true,
    memberCount: 0,
  });

  const mediaStreamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Start muted by default
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      
      // In a real implementation, this would connect to a WebRTC server
      setState(prev => ({
        ...prev,
        isConnected: true,
        isMuted: true,
        memberCount: 1,
      }));
      
      return true;
    } catch (error) {
      console.error('Failed to connect to voice channel:', error);
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setState({
      isConnected: false,
      isMuted: true,
      memberCount: 0,
    });
  }, []);

  const toggleMute = useCallback(() => {
    if (!state.isConnected || !mediaStreamRef.current) return;
    
    const newMutedState = !state.isMuted;
    
    // Toggle audio tracks
    mediaStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
    });
    
    setState(prev => ({ ...prev, isMuted: newMutedState }));
  }, [state.isConnected, state.isMuted]);

  return {
    ...state,
    connect,
    disconnect,
    toggleMute,
  };
}
