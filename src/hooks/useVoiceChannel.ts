import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface PeerConnection {
  pc: RTCPeerConnection;
  oderId: string;
}

interface VoiceChannelState {
  isConnected: boolean;
  isMuted: boolean;
  speakingUsers: Set<string>; // User IDs currently speaking
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 24000, // Lower sample rate for battery optimization (was 48000)
  channelCount: 1,
};

const SPEAKING_THRESHOLD = 0.02; // Audio level threshold for speaking detection
const SPEAKING_DEBOUNCE_MS = 150; // Debounce time for speaking state changes
const AUDIO_CHECK_INTERVAL_MS = 100; // Check audio levels every 100ms (was 50ms) for battery savings
const VOICE_REFRESH_INTERVAL_MS = 10000; // Re-announce presence every 10 seconds

export function useVoiceChannel(convoyId?: string) {
  const [state, setState] = useState<VoiceChannelState>({
    isConnected: false,
    isMuted: true,
    speakingUsers: new Set(),
  });

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  // Audio level detection refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelCheckIntervalRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const speakingTimeoutRef = useRef<number | null>(null);
  const isMutedRef = useRef<boolean>(true); // Ref to avoid stale closure
  const isConnectingRef = useRef<boolean>(false); // Guard against multiple connection attempts
  const refreshIntervalRef = useRef<number | null>(null); // Periodic refresh for connection maintenance

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Voice] Cleaning up voice channel');
    
    // Stop periodic refresh
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    // Stop audio level monitoring
    if (levelCheckIntervalRef.current) {
      clearInterval(levelCheckIntervalRef.current);
      levelCheckIntervalRef.current = null;
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peersRef.current.forEach((peer, oderId) => {
      console.log(`[Voice] Closing peer connection with ${oderId}`);
      peer.pc.close();
    });
    peersRef.current.clear();

    // Remove audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    // Unsubscribe from channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  // Start audio level monitoring for speaking detection
  const startAudioLevelMonitoring = useCallback(() => {
    if (!localStreamRef.current) {
      console.log('[Voice] No local stream for audio monitoring');
      return;
    }
    
    console.log('[Voice] Starting audio level monitoring');
    
    audioContextRef.current = new AudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        console.log('[Voice] AudioContext resumed');
      });
    }
    
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 512;
    analyserRef.current.smoothingTimeConstant = 0.3;
    
    const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
    source.connect(analyserRef.current);
    
    // Use time domain data for better voice detection
    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    
    levelCheckIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current || !channelRef.current || !userIdRef.current) {
        return;
      }
      
      // Get time domain data (waveform) for RMS calculation
      analyserRef.current.getByteTimeDomainData(dataArray);
      
      // Calculate RMS (root mean square) for better volume detection
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128; // Normalize to -1 to 1
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      
      const wasSpeaking = isSpeakingRef.current;
      const isNowSpeaking = rms > SPEAKING_THRESHOLD && !isMutedRef.current;
      
      // Debug log occasionally
      if (Math.random() < 0.02) {
        console.log(`[Voice] RMS: ${rms.toFixed(3)}, muted: ${isMutedRef.current}, speaking: ${isNowSpeaking}`);
      }
      
      if (isNowSpeaking && !wasSpeaking) {
        // Started speaking
        console.log('[Voice] Started speaking, user:', userIdRef.current);
        isSpeakingRef.current = true;
        if (speakingTimeoutRef.current) {
          clearTimeout(speakingTimeoutRef.current);
          speakingTimeoutRef.current = null;
        }
        
        // Broadcast speaking state
        channelRef.current.send({
          type: 'broadcast',
          event: 'speaking-state',
          payload: { oderId: userIdRef.current, isSpeaking: true },
        });
        
        // Update local state
        setState(prev => ({
          ...prev,
          speakingUsers: new Set([...prev.speakingUsers, userIdRef.current!]),
        }));
        console.log('[Voice] Updated speakingUsers, added:', userIdRef.current);
      } else if (!isNowSpeaking && wasSpeaking) {
        // Stopped speaking - debounce to avoid flickering
        if (!speakingTimeoutRef.current) {
          speakingTimeoutRef.current = window.setTimeout(() => {
            isSpeakingRef.current = false;
            
            if (channelRef.current && userIdRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'speaking-state',
                payload: { oderId: userIdRef.current, isSpeaking: false },
              });
              
              setState(prev => {
                const newSet = new Set(prev.speakingUsers);
                newSet.delete(userIdRef.current!);
                return { ...prev, speakingUsers: newSet };
              });
            }
            speakingTimeoutRef.current = null;
          }, SPEAKING_DEBOUNCE_MS);
        }
      }
    }, AUDIO_CHECK_INTERVAL_MS); // Battery-optimized interval
  }, []); // No deps - uses refs to avoid stale closures

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    console.log(`[Voice] Creating peer connection for ${remoteUserId}`);
    
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[Voice] Adding local track to peer ${remoteUserId}`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        console.log(`[Voice] Sending ICE candidate to ${remoteUserId}`);
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate,
            from: userIdRef.current,
            to: remoteUserId,
          },
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[Voice] Connection state with ${remoteUserId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Attempt to reconnect
        peersRef.current.delete(remoteUserId);
        audioElementsRef.current.get(remoteUserId)?.remove();
        audioElementsRef.current.delete(remoteUserId);
      }
    };

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`[Voice] Received remote track from ${remoteUserId}`);
      
      let audio = audioElementsRef.current.get(remoteUserId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audioElementsRef.current.set(remoteUserId, audio);
      }
      
      audio.srcObject = event.streams[0];
      audio.play().catch(err => console.error('[Voice] Audio play error:', err));
    };

    peersRef.current.set(remoteUserId, { pc, oderId: remoteUserId });
    return pc;
  }, []);

  // Handle signaling messages
  const handleSignaling = useCallback(async (payload: any) => {
    const { type, from, to, offer, answer, candidate } = payload;
    
    // Ignore messages not meant for us
    if (to && to !== userIdRef.current) return;
    // Ignore our own messages
    if (from === userIdRef.current) return;

    console.log(`[Voice] Received signaling: ${type} from ${from}`);

    switch (type) {
      case 'user-joined': {
        // New user joined, create offer if we have a higher user ID (to avoid both creating offers)
        if (userIdRef.current && userIdRef.current > from) {
          const pc = createPeerConnection(from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          channelRef.current?.send({
            type: 'broadcast',
            event: 'offer',
            payload: {
              offer,
              from: userIdRef.current,
              to: from,
            },
          });
        }
        break;
      }

      case 'offer': {
        const pc = peersRef.current.get(from)?.pc || createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        channelRef.current?.send({
          type: 'broadcast',
          event: 'answer',
          payload: {
            answer,
            from: userIdRef.current,
            to: from,
          },
        });
        break;
      }

      case 'answer': {
        const peer = peersRef.current.get(from);
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        break;
      }

      case 'ice-candidate': {
        const peer = peersRef.current.get(from);
        if (peer && candidate) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('[Voice] Error adding ICE candidate:', err);
          }
        }
        break;
      }

      case 'user-left': {
        const peer = peersRef.current.get(from);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(from);
          audioElementsRef.current.get(from)?.remove();
          audioElementsRef.current.delete(from);
        }
        break;
      }
    }
  }, [createPeerConnection]);

  // Connect to voice channel
  const connect = useCallback(async () => {
    if (!convoyId) {
      console.error('[Voice] No convoy ID provided');
      return false;
    }

    // Guard against multiple simultaneous connection attempts
    if (isConnectingRef.current || state.isConnected) {
      console.log('[Voice] Already connecting or connected, skipping');
      return state.isConnected;
    }
    
    isConnectingRef.current = true;

    try {
      console.log('[Voice] Connecting to voice channel for convoy:', convoyId);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Voice] No authenticated user');
        isConnectingRef.current = false;
        return false;
      }
      userIdRef.current = user.id;

      // Get microphone access with optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
      });
      localStreamRef.current = stream;
      
      // Start muted by default
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      // Create signaling channel
      const channel = supabase.channel(`voice:${convoyId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: user.id },
        },
      });

      // Listen for signaling events
      channel
        .on('broadcast', { event: 'user-joined' }, ({ payload }) => 
          handleSignaling({ type: 'user-joined', ...payload }))
        .on('broadcast', { event: 'offer' }, ({ payload }) => 
          handleSignaling({ type: 'offer', ...payload }))
        .on('broadcast', { event: 'answer' }, ({ payload }) => 
          handleSignaling({ type: 'answer', ...payload }))
        .on('broadcast', { event: 'ice-candidate' }, ({ payload }) => 
          handleSignaling({ type: 'ice-candidate', ...payload }))
        .on('broadcast', { event: 'user-left' }, ({ payload }) => 
          handleSignaling({ type: 'user-left', ...payload }))
        .on('broadcast', { event: 'speaking-state' }, ({ payload }) => {
          // Update speaking state from remote user
          const { oderId, isSpeaking } = payload;
          console.log(`[Voice] Speaking state from ${oderId}: ${isSpeaking}`);
          setState(prev => {
            const newSet = new Set(prev.speakingUsers);
            if (isSpeaking) {
              newSet.add(oderId);
            } else {
              newSet.delete(oderId);
            }
            return { ...prev, speakingUsers: newSet };
          });
        })
        .on('presence', { event: 'sync' }, () => {
          const presenceState = channel.presenceState();
          console.log('[Voice] Presence sync:', presenceState);
        });

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Voice] Subscribed to voice channel');
          
          // Track our presence
          await channel.track({ user_id: user.id, joined_at: Date.now() });
          
          // Announce we joined
          channel.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { from: user.id },
          });
        }
      });

      channelRef.current = channel;
      
      // Start audio level monitoring for speaking detection
      startAudioLevelMonitoring();
      
      // Start periodic refresh to maintain connections when returning from nav app
      refreshIntervalRef.current = window.setInterval(() => {
        if (channelRef.current && userIdRef.current) {
          console.log('[Voice] Periodic refresh - re-announcing presence');
          // Re-announce presence to trigger reconnection with any lost peers
          channelRef.current.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { from: userIdRef.current },
          });
        }
      }, VOICE_REFRESH_INTERVAL_MS);
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isMuted: true,
      }));

      isConnectingRef.current = false;
      console.log('[Voice] Connected successfully');
      return true;
    } catch (error) {
      console.error('[Voice] Failed to connect:', error);
      isConnectingRef.current = false;
      cleanup();
      return false;
    }
  }, [convoyId, handleSignaling, cleanup, startAudioLevelMonitoring, state.isConnected]);

  // Disconnect from voice channel
  const disconnect = useCallback(() => {
    console.log('[Voice] Disconnecting from voice channel');
    
    // Reset connecting flag
    isConnectingRef.current = false;
    
    // Announce we're leaving
    if (channelRef.current && userIdRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'user-left',
        payload: { from: userIdRef.current },
      });
    }

    cleanup();
    
    setState({
      isConnected: false,
      isMuted: true,
      speakingUsers: new Set(),
    });
  }, [cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!state.isConnected || !localStreamRef.current) return;
    
    const newMutedState = !state.isMuted;
    isMutedRef.current = newMutedState; // Update ref for audio level detection
    
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
      console.log(`[Voice] Track enabled: ${track.enabled}`);
    });
    
    // Clear own speaking state when muting
    if (newMutedState && userIdRef.current) {
      isSpeakingRef.current = false;
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'speaking-state',
          payload: { oderId: userIdRef.current, isSpeaking: false },
        });
      }
      setState(prev => {
        const newSet = new Set(prev.speakingUsers);
        newSet.delete(userIdRef.current!);
        return { ...prev, isMuted: newMutedState, speakingUsers: newSet };
      });
    } else {
      setState(prev => ({ ...prev, isMuted: newMutedState }));
    }
  }, [state.isConnected, state.isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    connect,
    disconnect,
    toggleMute,
  };
}
