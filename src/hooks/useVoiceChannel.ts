import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface PeerConnection {
  pc: RTCPeerConnection;
  userId: string;
}

interface VoiceChannelState {
  isConnected: boolean;
  isMuted: boolean;
  activeSpeakers: string[];
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
  sampleRate: 48000,
  channelCount: 1,
};

export function useVoiceChannel(convoyId?: string) {
  const [state, setState] = useState<VoiceChannelState>({
    isConnected: false,
    isMuted: true,
    activeSpeakers: [],
  });

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Voice] Cleaning up voice channel');
    
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

    peersRef.current.set(remoteUserId, { pc, userId: remoteUserId });
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

    try {
      console.log('[Voice] Connecting to voice channel for convoy:', convoyId);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Voice] No authenticated user');
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
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isMuted: true,
      }));

      console.log('[Voice] Connected successfully');
      return true;
    } catch (error) {
      console.error('[Voice] Failed to connect:', error);
      cleanup();
      return false;
    }
  }, [convoyId, handleSignaling, cleanup]);

  // Disconnect from voice channel
  const disconnect = useCallback(() => {
    console.log('[Voice] Disconnecting from voice channel');
    
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
      activeSpeakers: [],
    });
  }, [cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!state.isConnected || !localStreamRef.current) return;
    
    const newMutedState = !state.isMuted;
    
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
      console.log(`[Voice] Track enabled: ${track.enabled}`);
    });
    
    setState(prev => ({ ...prev, isMuted: newMutedState }));
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
