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
const VOICE_STATE_KEY = 'blacktop_voice_state'; // Persist voice connection intent

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
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map()); // Store ICE candidates received before remote description

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
    
    // Clear pending ICE candidates
    pendingCandidatesRef.current.clear();

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
        console.log(`[Voice] Adding local track to peer ${remoteUserId}:`, {
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.warn(`[Voice] No local stream when creating peer for ${remoteUserId}`);
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
      if (pc.connectionState === 'connected') {
        console.log(`[Voice] Successfully connected to ${remoteUserId}`);
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`[Voice] Connection ${pc.connectionState} with ${remoteUserId}`);
        // Attempt to reconnect
        peersRef.current.delete(remoteUserId);
        audioElementsRef.current.get(remoteUserId)?.remove();
        audioElementsRef.current.delete(remoteUserId);
      }
    };
    
    // Handle ICE connection state changes (more granular)
    pc.oniceconnectionstatechange = () => {
      console.log(`[Voice] ICE state with ${remoteUserId}: ${pc.iceConnectionState}`);
    };
    
    // Handle ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`[Voice] ICE gathering state with ${remoteUserId}: ${pc.iceGatheringState}`);
    };

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`[Voice] Received remote track from ${remoteUserId}`, event.streams);
      
      if (!event.streams || event.streams.length === 0) {
        console.warn(`[Voice] No streams in track event from ${remoteUserId}`);
        return;
      }
      
      const remoteStream = event.streams[0];
      console.log(`[Voice] Remote stream tracks:`, remoteStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      
      let audio = audioElementsRef.current.get(remoteUserId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        // iOS Safari requires these attributes
        audio.setAttribute('webkit-playsinline', 'true');
        // Set volume explicitly
        audio.volume = 1.0;
        // iOS Safari is much more reliable if the element exists in the DOM
        audio.style.cssText = 'position: absolute; left: -9999px; top: -9999px;';
        document.body.appendChild(audio);
        audioElementsRef.current.set(remoteUserId, audio);
        console.log(`[Voice] Created audio element for ${remoteUserId}`);
      }

      audio.srcObject = remoteStream;
      
      // Force play with multiple retry strategies
      const tryPlay = async () => {
        try {
          await audio!.play();
          console.log(`[Voice] Audio playing for ${remoteUserId}`);
        } catch (err: any) {
          console.warn(`[Voice] Audio play blocked for ${remoteUserId}:`, err.name, err.message);
          
          // On iOS/Safari, we need a user gesture - set up listeners
          const playOnGesture = async () => {
            try {
              await audio?.play();
              console.log(`[Voice] Audio playing after gesture for ${remoteUserId}`);
            } catch (e2) {
              console.warn('[Voice] Audio play retry failed:', e2);
            }
          };
          
          // Listen for any user interaction
          ['pointerdown', 'touchstart', 'click'].forEach(eventType => {
            document.addEventListener(eventType, playOnGesture, { once: true, passive: true });
          });
        }
      };
      
      tryPlay();
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

    console.log(`[Voice] Received signaling: ${type} from ${from}, our ID: ${userIdRef.current}`);

    switch (type) {
      case 'user-joined': {
        if (!userIdRef.current || !channelRef.current || !localStreamRef.current) {
          console.warn('[Voice] Not ready to handle user-joined - missing refs');
          return;
        }
        
        // Always create an offer when a new user joins and we don't have a connection to them
        // The receiver will handle duplicate connections gracefully
        const existingPeer = peersRef.current.get(from);
        if (existingPeer && existingPeer.pc.connectionState === 'connected') {
          console.log(`[Voice] Already connected to ${from}, skipping offer`);
          return;
        }
        
        // Clean up any existing failed connection
        if (existingPeer) {
          console.log(`[Voice] Cleaning up stale connection to ${from}`);
          existingPeer.pc.close();
          peersRef.current.delete(from);
          audioElementsRef.current.get(from)?.remove();
          audioElementsRef.current.delete(from);
        }
        
        // Use deterministic ordering: higher ID creates offer
        if (userIdRef.current > from) {
          console.log(`[Voice] Creating offer to ${from} (we have higher ID)`);
          try {
            const pc = createPeerConnection(from);
            const offerDesc = await pc.createOffer();
            await pc.setLocalDescription(offerDesc);
            
            channelRef.current.send({
              type: 'broadcast',
              event: 'offer',
              payload: {
                offer: offerDesc,
                from: userIdRef.current,
                to: from,
              },
            });
            console.log(`[Voice] Offer sent to ${from}`);
          } catch (err) {
            console.error('[Voice] Error creating offer:', err);
          }
        } else {
          console.log(`[Voice] Waiting for offer from ${from} (they have higher ID)`);
        }
        break;
      }

      case 'offer': {
        if (!userIdRef.current || !channelRef.current) {
          console.warn('[Voice] Not ready to handle offer');
          return;
        }
        
        console.log(`[Voice] Received offer from ${from}`);
        
        try {
          // Clean up any existing connection first
          const existingPeer = peersRef.current.get(from);
          if (existingPeer) {
            existingPeer.pc.close();
            peersRef.current.delete(from);
            audioElementsRef.current.get(from)?.remove();
            audioElementsRef.current.delete(from);
          }
          
          const pc = createPeerConnection(from);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          
          // Process any pending ICE candidates after setting remote description
          const pendingCandidates = pendingCandidatesRef.current.get(from);
          if (pendingCandidates && pendingCandidates.length > 0) {
            console.log(`[Voice] Processing ${pendingCandidates.length} pending ICE candidates for ${from}`);
            for (const cand of pendingCandidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('[Voice] Error adding pending ICE candidate:', e);
              }
            }
            pendingCandidatesRef.current.delete(from);
          }
          
          const answerDesc = await pc.createAnswer();
          await pc.setLocalDescription(answerDesc);
          
          channelRef.current.send({
            type: 'broadcast',
            event: 'answer',
            payload: {
              answer: answerDesc,
              from: userIdRef.current,
              to: from,
            },
          });
          console.log(`[Voice] Answer sent to ${from}`);
        } catch (err) {
          console.error('[Voice] Error handling offer:', err);
        }
        break;
      }

      case 'answer': {
        console.log(`[Voice] Received answer from ${from}`);
        const peer = peersRef.current.get(from);
        if (peer) {
          try {
            if (peer.pc.signalingState === 'have-local-offer') {
              await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
              console.log(`[Voice] Remote description set for ${from}`);
              
              // Process any pending ICE candidates
              const pendingCandidates = pendingCandidatesRef.current.get(from);
              if (pendingCandidates && pendingCandidates.length > 0) {
                console.log(`[Voice] Processing ${pendingCandidates.length} pending ICE candidates for ${from}`);
                for (const cand of pendingCandidates) {
                  try {
                    await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn('[Voice] Error adding pending ICE candidate:', e);
                  }
                }
                pendingCandidatesRef.current.delete(from);
              }
            } else {
              console.warn(`[Voice] Ignoring answer - wrong state: ${peer.pc.signalingState}`);
            }
          } catch (err) {
            console.error('[Voice] Error setting remote description:', err);
          }
        } else {
          console.warn(`[Voice] No peer connection for answer from ${from}`);
        }
        break;
      }

      case 'ice-candidate': {
        const peer = peersRef.current.get(from);
        if (peer && candidate) {
          try {
            // Only add ICE candidates when we have a remote description
            if (peer.pc.remoteDescription) {
              await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`[Voice] ICE candidate added from ${from}`);
            } else {
              console.log(`[Voice] Queuing ICE candidate from ${from} - no remote description yet`);
              // Store candidate for later
              if (!pendingCandidatesRef.current.has(from)) {
                pendingCandidatesRef.current.set(from, []);
              }
              pendingCandidatesRef.current.get(from)!.push(candidate);
            }
          } catch (err) {
            console.error('[Voice] Error adding ICE candidate:', err);
          }
        }
        break;
      }

      case 'user-left': {
        console.log(`[Voice] User left: ${from}`);
        const peer = peersRef.current.get(from);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(from);
          audioElementsRef.current.get(from)?.remove();
          audioElementsRef.current.delete(from);
        }
        // Clear from speaking users
        setState(prev => {
          const newSet = new Set(prev.speakingUsers);
          newSet.delete(from);
          return { ...prev, speakingUsers: newSet };
        });
        break;
      }
    }
  }, [createPeerConnection]);

  // Check and request microphone permission
  // Note: iOS Safari doesn't reliably support permissions.query for microphone
  // so we treat 'prompt' and unknown states as "try anyway"
  const checkMicrophonePermission = useCallback(async (): Promise<'granted' | 'denied' | 'prompt'> => {
    // iOS Safari doesn't support permissions.query for microphone reliably
    // Check if we're on iOS/Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    if (isIOS || isSafari) {
      console.log('[Voice] iOS/Safari detected - skipping permissions API check');
      // On iOS/Safari, we can't reliably check permissions - just return 'prompt' to try anyway
      return 'prompt';
    }
    
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return result.state as 'granted' | 'denied' | 'prompt';
      } catch (e) {
        console.log('[Voice] Permissions API not available for microphone:', e);
        return 'prompt';
      }
    }
    return 'prompt';
  }, []);

  // Connect to voice channel
  const connect = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!convoyId) {
      console.error('[Voice] No convoy ID provided');
      return { success: false, error: 'No convoy ID' };
    }

    // Guard against multiple simultaneous connection attempts
    if (isConnectingRef.current || state.isConnected) {
      console.log('[Voice] Already connecting or connected, skipping');
      return { success: state.isConnected };
    }
    
    isConnectingRef.current = true;

    try {
      console.log('[Voice] Connecting to voice channel for convoy:', convoyId);

      // Check microphone permission first (but on iOS/Safari this may not be reliable)
      const permissionStatus = await checkMicrophonePermission();
      console.log('[Voice] Microphone permission status:', permissionStatus);
      
      // Only reject if permissions API explicitly says denied (not on iOS/Safari)
      // We'll let the actual getUserMedia call be the source of truth
      if (permissionStatus === 'denied') {
        console.warn('[Voice] Microphone permission appears denied, but will try getUserMedia anyway');
        // Don't return early - let getUserMedia try and give us the real error
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Voice] No authenticated user');
        isConnectingRef.current = false;
        return { success: false, error: 'Not authenticated' };
      }
      userIdRef.current = user.id;

      // Get microphone access with optimized settings
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
        });
      } catch (mediaError: any) {
        console.error('[Voice] Failed to get microphone access:', mediaError);
        isConnectingRef.current = false;
        
        // Detect iOS/Safari for more specific error messages
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
          if (isIOS) {
            return { 
              success: false, 
              error: 'Microphone access denied. On iOS, go to Settings → Safari → Microphone, then enable access for this site.' 
            };
          }
          return { 
            success: false, 
            error: 'Microphone access denied. Please enable it in your browser or device settings.' 
          };
        }
        if (mediaError.name === 'NotFoundError') {
          return { success: false, error: 'No microphone found. Please connect a microphone and try again.' };
        }
        return { success: false, error: 'Failed to access microphone. Please try again.' };
      }
      
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
      
      // Persist voice connection state for restoration after nav app
      try {
        localStorage.setItem(VOICE_STATE_KEY, JSON.stringify({ 
          convoyId, 
          connected: true,
          muted: true,
          timestamp: Date.now() 
        }));
      } catch (e) {
        console.warn('[Voice] Failed to persist voice state:', e);
      }
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isMuted: true,
      }));

      isConnectingRef.current = false;
      console.log('[Voice] Connected successfully');
      return { success: true };
    } catch (error) {
      console.error('[Voice] Failed to connect:', error);
      isConnectingRef.current = false;
      cleanup();
      return { success: false, error: 'Failed to connect to voice channel' };
    }
  }, [convoyId, handleSignaling, cleanup, startAudioLevelMonitoring, state.isConnected, checkMicrophonePermission]);

  // Disconnect from voice channel
  // Disconnect from voice channel
  const disconnect = useCallback(() => {
    console.log('[Voice] Disconnecting from voice channel');
    
    // Reset connecting flag
    isConnectingRef.current = false;
    
    // Clear persisted voice state
    try {
      localStorage.removeItem(VOICE_STATE_KEY);
    } catch (e) {
      console.warn('[Voice] Failed to clear voice state:', e);
    }
    
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
    if (!state.isConnected || !localStreamRef.current) {
      console.warn('[Voice] Cannot toggle mute - not connected or no stream');
      return;
    }
    
    const newMutedState = !state.isMuted;
    isMutedRef.current = newMutedState; // Update ref for audio level detection
    
    console.log(`[Voice] Toggling mute: ${state.isMuted} -> ${newMutedState}`);
    
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
      console.log(`[Voice] Track "${track.label}" enabled: ${track.enabled}, readyState: ${track.readyState}`);
    });
    
    // Log peer connection states for debugging
    peersRef.current.forEach((peer, oderId) => {
      console.log(`[Voice] Peer ${oderId} connection state: ${peer.pc.connectionState}, ICE: ${peer.pc.iceConnectionState}`);
      const senders = peer.pc.getSenders();
      senders.forEach(sender => {
        if (sender.track) {
          console.log(`[Voice] Sender track to ${oderId}: kind=${sender.track.kind}, enabled=${sender.track.enabled}`);
        }
      });
    });
    
    // Update mute state in persisted storage
    try {
      const stored = localStorage.getItem(VOICE_STATE_KEY);
      if (stored) {
        const voiceState = JSON.parse(stored);
        voiceState.muted = newMutedState;
        localStorage.setItem(VOICE_STATE_KEY, JSON.stringify(voiceState));
      }
    } catch (e) {
      console.warn('[Voice] Failed to persist mute state:', e);
    }
    
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

  // Refresh voice connection when returning from nav app (visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isConnected && channelRef.current && userIdRef.current) {
        console.log('[Voice] App visible - refreshing voice connection');
        // Re-announce presence to reconnect with peers
        channelRef.current.send({
          type: 'broadcast',
          event: 'user-joined',
          payload: { from: userIdRef.current },
        });
        
        // Resume AudioContext if it was suspended (iOS/Safari)
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
            console.log('[Voice] AudioContext resumed after visibility change');
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isConnected]);

  // Auto-reconnect voice if returning from nav app with persisted state
  useEffect(() => {
    if (!convoyId || state.isConnected || isConnectingRef.current) return;
    
    try {
      const stored = localStorage.getItem(VOICE_STATE_KEY);
      if (stored) {
        const voiceState = JSON.parse(stored);
        // Only auto-reconnect if it's the same convoy and within 5 minutes
        if (voiceState.convoyId === convoyId && 
            voiceState.connected && 
            (Date.now() - voiceState.timestamp) < 5 * 60 * 1000) {
          console.log('[Voice] Auto-reconnecting voice channel after page reload');
          connect().then(result => {
            if (result.success && !voiceState.muted) {
              // Restore mute state
              toggleMute();
            }
          });
        } else {
          // Clear stale voice state
          localStorage.removeItem(VOICE_STATE_KEY);
        }
      }
    } catch (e) {
      console.warn('[Voice] Failed to restore voice state:', e);
    }
  }, [convoyId, state.isConnected, connect, toggleMute]);

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
