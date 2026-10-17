import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { setSpeakingUsers } from './voiceActivityStore';
import {
  refreshNativeCommunicationAudio,
  startBrowserCommunicationAudio,
  startNativeCommunicationAudio,
  stopBrowserCommunicationAudio,
  stopNativeCommunicationAudio,
  listenToMediaButtons,
} from '../lib/nativeAudioRoute';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { duckVolume, onAudioDuckChange } from '@/lib/audioDuck';
import { currentIceServers, loadIceServers, hasRelay } from '../lib/iceServers';
import { tr } from '@/lib/i18n';
import { sessionUser } from '@/lib/sessionUser';
import { setTalkDucked } from '@/lib/audioDuck';
import { setMediaKeys } from '@/lib/mediaKeys';
import { isAlarmOn } from '@/features/alarm/lib/alarmStore';
import { sceneCue } from '@/lib/radioFx';
import { SpeechDetector } from '../lib/speechDetector';

// Warn once per app session, not on every reconnect.
let relayWarningShown = false;
/**
 * Voice is a mesh: every phone sends its audio to every other, so upload and
 * battery grow with the convoy. Past this many riders (you included) mobile
 * data starts to drop people; riders are told once, nothing is cut off.
 */
export const VOICE_MESH_COMFORT = 8;
let meshWarningShown = false;
/**
 * Voice takes this many riders and no more (the convoy itself has no limit: the
 * map, rescue and waypoints carry on for everyone). Who's in is worked out the
 * same way on every phone from the channel's presence: the leader first, then
 * whoever joined voice earliest. A rider past the line waits with no audio links
 * and is let in by the same sum when someone leaves. Phones on an older copy of
 * the app don't know the rule: they're still counted, and a newer phone simply
 * doesn't answer one that's past the line.
 */
export const VOICE_MAX = 8;

interface VoicePresence {
  user_id?: string;
  joined_at?: number;
  priority?: boolean;
  /** The mic is off: the others show "Muted" beside this rider, so silence isn't mistaken for a broken link. */
  muted?: boolean;
}

/** The riders voice has room for, from everyone present on the channel. */
export function voiceSlots(present: VoicePresence[], max: number = VOICE_MAX): Set<string> {
  const riders = new Map<string, { at: number; first: boolean }>();
  for (const p of present) {
    if (!p?.user_id) continue;
    const at = typeof p.joined_at === 'number' ? p.joined_at : Number.MAX_SAFE_INTEGER;
    const had = riders.get(p.user_id);
    riders.set(p.user_id, { at: had ? Math.min(had.at, at) : at, first: !!p.priority || !!had?.first });
  }
  return new Set(
    [...riders.entries()]
      .sort((a, b) => Number(b[1].first) - Number(a[1].first) || a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1))
      .slice(0, max)
      .map(([id]) => id),
  );
}

interface PeerConnection {
  pc: RTCPeerConnection;
  oderId: string;
  createdAt: number;
}

export type PeerAudioLink = 'connecting' | 'connected' | 'failed';

/**
 * What's really happening to one rider's sound on this phone, read from the
 * connection itself every second: whether their audio is arriving at all,
 * how loud it is (0–1, so a voice shows as a moving bar), and whether this
 * phone has been stopped from playing it (autoplay rules: a tap plays it).
 * Tells a silent mic on their side from a link that carries nothing from a
 * phone that won't play what arrives.
 */
export interface PeerSound {
  arriving: boolean;
  level: number;
  blocked: boolean;
}

interface VoiceChannelState {
  isConnected: boolean;
  isMuted: boolean;
  speakingUsers: Set<string>; // User IDs currently speaking
  /**
   * Real audio path per remote rider. Speaking indicators travel over Supabase,
   * so a rider can "glow" while there is no WebRTC audio link at all — the UI
   * uses this to say so instead of implying they can be heard.
   */
  peerLinks: Record<string, PeerAudioLink>;
  /** Voice is full and this rider is waiting for a slot: connected to the channel, with no audio links. */
  waiting: boolean;
  /** Other riders in voice with their mic off (from the channel's presence). */
  mutedUsers: Set<string>;
  /** Per rider: is their sound arriving, how loud, can this phone play it (see PeerSound). */
  peerSound: Record<string, PeerSound>;
  /** This phone's own mic as it's being sent: whether anything is going out, and how loud. */
  micSound: { sending: boolean; level: number } | null;
}

// ICE servers (STUN + fetched TURN relay credentials) live in ../lib/iceServers.


// The lobby's mic and speaker picker is gone (2026-10-16): a choice saved there pinned voice to one
// device by its id, and riders with an intercom on heard nothing. Choices older apps saved are dropped.
try {
  localStorage.removeItem('blacktop_audio_input');
  localStorage.removeItem('blacktop_audio_output');
} catch { /* storage unavailable */ }

/**
 * Set when the headset's mic turned out to send nothing but digital silence (an
 * intercom whose call audio never started: the mic opens but carries nothing),
 * which left riders unheard while they could hear everyone. Voice then uses the
 * phone's own mic until the app is restarted.
 */
let headsetMicFailed = false;

/** The phone's own mics and the browser's stand-ins, never what a rider means by "my headset". */
const PHONE_MIC = /earpiece|speakerphone|built-?in|iphone|ipad|default|communications|phone mic|internal/i;
/** A Bluetooth headset or intercom, by the names phones give them. */
const BLUETOOTH_MIC = /bluetooth|hands-?free|airpods|buds|cardo|packtalk|freecom|sena|intercom|headset|helmet|interphone|uclear|bose|jabra|plantronics|poly/i;
/** A wired or USB headset. */
const WIRED_MIC = /wired|usb|headphone|earphone|lightning|type-?c/i;

/**
 * The mic voice should use: a Bluetooth headset or intercom when one is
 * connected, else a wired one, else none chosen (the phone's default). Every
 * sound in voice then follows it: in a call the phone sends what it plays to
 * the same headset. Names are only readable once the mic has been allowed, so
 * before that this answers nothing and the call starts on the default.
 */
async function pickVoiceMic(): Promise<string | undefined> {
  // A headset mic that sent pure silence this session: the phone's own mic from now on.
  if (headsetMicFailed) return undefined;
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.label);
    const named = inputs.filter((d) => !PHONE_MIC.test(d.label));
    const headset = named.find((d) => BLUETOOTH_MIC.test(d.label)) ?? named.find((d) => WIRED_MIC.test(d.label));
    if (headset) return headset.deviceId;
    // No headset, Android in a browser (the installed web app included): Chrome lists the phone's
    // own mic as "Speakerphone" and "Headset earpiece" and plays the call's sound from the matching
    // speaker. Left to its default, some phones chose the earpiece, so riders with the phone on a
    // mount heard nothing while they were heard. The Android app routes itself (NativeAudioRoute).
    if (isAndroidBrowser()) return inputs.find((d) => /speakerphone|speaker/i.test(d.label) && !/earpiece/i.test(d.label))?.deviceId;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Android in a browser or installed web app, not the Android app (which routes audio natively). */
function isAndroidBrowser(): boolean {
  return /android/i.test(navigator.userAgent) && Capacitor.getPlatform() === 'web';
}

/**
 * Where riders' voices play. Android in a browser: a Bluetooth headset, else wired earphones,
 * else the loudspeaker, never the earpiece (see pickVoiceMic); where the browser doesn't list
 * its outputs, or anywhere else, the system default ('').
 */
async function pickVoiceOutput(): Promise<string> {
  if (!isAndroidBrowser()) return '';
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId && d.label);
    const pick =
      outs.find((d) => BLUETOOTH_MIC.test(d.label) && !/earpiece/i.test(d.label)) ??
      outs.find((d) => WIRED_MIC.test(d.label) && !/earpiece/i.test(d.label)) ??
      outs.find((d) => /speaker/i.test(d.label) && !/earpiece/i.test(d.label));
    return pick?.deviceId ?? '';
  } catch {
    return '';
  }
}

const getAudioConstraints = (micId?: string): MediaTrackConstraints => {
  const deviceConstraint = micId ? { deviceId: { exact: micId } } : {};

  // iOS/Safari can behave poorly with strict sampleRate constraints.
  // Let the browser pick the native rate, but keep core voice processing toggles.
  const isiOSOrSafari = isIOSDevice() || isSafariBrowser();

  if (isiOSOrSafari) {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      ...deviceConstraint,
    };
  }

  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    ...deviceConstraint,
  };
};

/** While talking, the "speaking" message is sent again this often, so a lost "stopped" can't leave it stuck. */
const SPEAKING_REFRESH_MS = 4000;
/** A rider heard nothing from for this long is taken to have stopped talking. */
const SPEAKING_STALE_MS = 12000;
const SPEAKING_DEBOUNCE_MS = 150; // Debounce time for speaking state changes
const AUDIO_CHECK_INTERVAL_MS = 100; // Check audio levels every 100ms (was 50ms) for battery savings
const VOICE_REFRESH_INTERVAL_MS = 10000; // Re-announce presence every 10 seconds
const VOICE_STATE_KEY = 'blacktop_voice_state'; // Persist voice connection intent

// Exponential backoff for per-peer signaling retries after a connection
// failure/drop (e.g. poor cellular), instead of hammering the Realtime
// channel with immediate, high-frequency reconnect attempts.
const RECONNECT_BACKOFF_MS = [2000, 5000, 10000, 30000];

// A handshake that hasn't reached "connected" within this window is treated as
// stalled and gets rebuilt on the next presence heartbeat.
const HANDSHAKE_STALL_MS = 20000;

// iOS/Safari detection
const isIOSDevice = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSafariBrowser = (): boolean => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

// Global audio unlock state - iOS Safari requires audio to be "unlocked" via user gesture
let globalAudioUnlocked = false;
let unlockAudioContext: AudioContext | null = null;

// Call this function on ANY user gesture to unlock audio on iOS
// IMPORTANT: This function is fire-and-forget, never blocks, never throws
export const unlockIOSAudio = (): void => {
  if (globalAudioUnlocked) return;
  
  const isIOS = isIOSDevice();
  const isSafari = isSafariBrowser();
  
  console.log('[Voice] Attempting to unlock audio, iOS:', isIOS, 'Safari:', isSafari);
  
  // Fire-and-forget - don't await, don't block button handlers
  (async () => {
    try {
      // Create an AudioContext and resume it - this "unlocks" Web Audio on iOS
      if (!unlockAudioContext) {
        unlockAudioContext = new AudioContext();
      }
      
      if (unlockAudioContext.state === 'suspended') {
        await unlockAudioContext.resume();
      }
      
      // Also play a silent audio element to unlock HTMLAudioElement playback
      const silentAudio = document.createElement('audio');
      silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      silentAudio.volume = 0.01;
      silentAudio.muted = false;
      silentAudio.setAttribute('playsinline', 'true');
      silentAudio.setAttribute('webkit-playsinline', 'true');
      
      try {
        await silentAudio.play();
        silentAudio.pause();
        silentAudio.remove();
      } catch (e) {
        // Ignore errors - the attempt itself helps unlock
        console.log('[Voice] Silent audio play attempt:', e);
      }
      
      globalAudioUnlocked = true;
      console.log('[Voice] Audio unlocked successfully');
    } catch (e) {
      console.warn('[Voice] Failed to unlock audio:', e);
    }
  })();
};

/** A WebRTC signalling message on the convoy's voice channel (Supabase Realtime broadcast). */
interface SignalingMessage {
  type: 'user-joined' | 'offer' | 'answer' | 'ice-candidate' | 'user-left';
  from: string;
  to?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** The sender's recording consent (mixing their voice into a ride overlay). */
  consent?: boolean;
}

/** What a failed getUserMedia / play() rejects with (a DOMException, read loosely). */
type MediaError = { name?: string; message?: string } | undefined;

export function useVoiceChannel(convoyId?: string, options: { /** The convoy's leader always has a voice slot. */ priority?: boolean } = {}) {
  const [state, setState] = useState<VoiceChannelState>({
    isConnected: false,
    isMuted: true,
    speakingUsers: new Set(),
    mutedUsers: new Set(),
    peerSound: {},
    micSound: null,
    peerLinks: {},
    waiting: false,
  });
  const priorityRef = useRef(!!options.priority);
  priorityRef.current = !!options.priority;
  // Who voice has room for (null until the channel has said who's here: until then nobody is turned away).
  const slotsRef = useRef<Set<string> | null>(null);
  const waitingRef = useRef(false);
  // When this phone joined voice: kept for the whole session, so a re-announce never costs a rider their place.
  const joinedAtRef = useRef(0);

  const setPeerLink = useCallback((peerId: string, link: PeerAudioLink | null) => {
    setState((prev) => {
      if (link === null ? !(peerId in prev.peerLinks) : prev.peerLinks[peerId] === link) return prev;
      const peerLinks = { ...prev.peerLinks };
      if (link === null) delete peerLinks[peerId];
      else peerLinks[peerId] = link;
      return { ...prev, peerLinks };
    });
  }, []);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Remote peer streams kept so features like the overlay recorder can mix
  // the voice channel into recorded audio without touching the audio elements.
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  
  // Audio level detection refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelCheckIntervalRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const speakingTimeoutRef = useRef<number | null>(null);
  const staleSpeakerTimersRef = useRef<Map<string, number>>(new Map());
  const isMutedRef = useRef<boolean>(true); // Ref to avoid stale closure
  const isConnectingRef = useRef<boolean>(false); // Guard against multiple connection attempts
  const refreshIntervalRef = useRef<number | null>(null); // Periodic refresh for connection maintenance
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map()); // Store ICE candidates received before remote description
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map()); // Backoff step per peer
  const reconnectTimersRef = useRef<Map<string, number>>(new Map()); // Pending per-peer reconnect retry
  const applyOutputDeviceRef = useRef<(() => void) | null>(null); // Late-bound speaker routing helper
  const swapInputDeviceRef = useRef<(() => void) | null>(null); // Late-bound mic hot-swap helper
  // Per-rider recording consent. A peer is only mixed into someone else's ride
  // recording if that peer has the "Voice Channel Recording" toggle enabled.
  const peerConsentRef = useRef<Map<string, boolean>>(new Map());

  // Read our own consent flag straight from persisted settings so the voice
  // hook doesn't need to re-subscribe when the toggle changes mid-ride.
  const readRecordConsent = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem('blacktop-settings');
      if (!raw) return false;
      const s = JSON.parse(raw);
      // The switch is only visible (and only does anything) while overlay recording
      // is on, so consent requires both — a hidden stale "on" must not count.
      return Boolean(s?.voiceRecordingEnabled && s?.rideOverlayEnabled);
    } catch {
      return false;
    }
  }, []);

  // Tear down the local mic analyser (used both by cleanup and when hot-swapping
  // to a different input device, e.g. a Bluetooth intercom connecting mid-ride).
  const stopAudioLevelMonitoring = useCallback(() => {
    if (levelCheckIntervalRef.current) {
      clearInterval(levelCheckIntervalRef.current);
      levelCheckIntervalRef.current = null;
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Voice] Cleaning up voice channel');
    
    // Stop periodic refresh
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    // Stop audio level monitoring
    stopAudioLevelMonitoring();
    
    
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
    remoteStreamsRef.current.clear();
    peerConsentRef.current.clear();
    stopBrowserCommunicationAudio();
    void stopNativeCommunicationAudio();
    
    // Clear pending ICE candidates
    pendingCandidatesRef.current.clear();

    // Cancel any pending per-peer reconnect backoff timers
    reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    reconnectTimersRef.current.clear();
    reconnectAttemptsRef.current.clear();

    // Unsubscribe from channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [stopAudioLevelMonitoring]);


  // Cancel a pending reconnect retry for a peer (call on success or deliberate leave).
  const clearReconnectSchedule = useCallback((remoteUserId: string) => {
    const timer = reconnectTimersRef.current.get(remoteUserId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimersRef.current.delete(remoteUserId);
    }
    reconnectAttemptsRef.current.delete(remoteUserId);
  }, []);

  // Schedule a backed-off retry of the signaling handshake with a peer that
  // just failed/dropped. Each consecutive failure for that peer steps further
  // into RECONNECT_BACKOFF_MS; a successful connection (clearReconnectSchedule)
  // resets it back to the start.
  const scheduleReconnect = useCallback((remoteUserId: string) => {
    if (reconnectTimersRef.current.has(remoteUserId)) return; // already scheduled

    const attempt = reconnectAttemptsRef.current.get(remoteUserId) ?? 0;
    const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
    console.warn(`[Voice] Connection to ${remoteUserId} lost - retrying in ${delay}ms (attempt ${attempt + 1})`);

    const timer = window.setTimeout(() => {
      reconnectTimersRef.current.delete(remoteUserId);
      reconnectAttemptsRef.current.set(remoteUserId, attempt + 1);

      if (!channelRef.current || !userIdRef.current) return;
      // Re-announce presence to re-trigger the offer/answer handshake with this peer.
      channelRef.current.send({
        type: 'broadcast',
        event: 'user-joined',
        payload: { from: userIdRef.current, consent: readRecordConsent() },
      });
    }, delay);

    reconnectTimersRef.current.set(remoteUserId, timer);
  }, [readRecordConsent]);

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
    // The speech detector reads a 2,048-point spectrum lightly smoothed (npm run speech:check plays it the same).
    analyserRef.current.fftSize = 2048;
    analyserRef.current.smoothingTimeConstant = 0.2;
    
    const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
    source.connect(analyserRef.current);
    
    // Talking, not just loud: wind, the engine and road noise used to count (lib/speechDetector.ts).
    const spectrum = new Float32Array(analyserRef.current.frequencyBinCount);
    const detector = new SpeechDetector({ sampleRate: audioContextRef.current.sampleRate, fftSize: 2048 });
    let lastSent = 0;
    
    levelCheckIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current || !channelRef.current || !userIdRef.current) {
        return;
      }
      
      analyserRef.current.getFloatFrequencyData(spectrum);
      const talking = detector.push(spectrum);
      
      const wasSpeaking = isSpeakingRef.current;
      const isNowSpeaking = talking && !isMutedRef.current;

      // Still talking: say so again now and then, so a lost "stopped" can't leave anyone's radio down.
      if (isNowSpeaking && wasSpeaking && Date.now() - lastSent > SPEAKING_REFRESH_MS) {
        lastSent = Date.now();
        channelRef.current.send({ type: 'broadcast', event: 'speaking-state', payload: { oderId: userIdRef.current, isSpeaking: true } });
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
        lastSent = Date.now();
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

  // ---- Bluetooth / audio-device handling -------------------------------
  // Every remote voice plays on the system's own output, never one pinned by id:
  // in a call the phone routes that to the connected headset or intercom (and to
  // the loudspeaker without one). Called when an element is created and when a
  // headset connects or drops mid-ride.
  const applyOutputDevice = useCallback(() => {
    void pickVoiceOutput().then((sink) => {
      audioElementsRef.current.forEach((audio) => {
        if (!('setSinkId' in audio)) return;
        // '' is the system default output (which, in a call, follows the headset).
        (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> })
          .setSinkId(sink)
          .catch((e: unknown) => console.warn('[Voice] Failed to set the output device:', e));
      });
    });
  }, []);

  // Hot-swap the microphone without dropping the call. Grabs a fresh stream
  // using the currently preferred input and replaces the outgoing track on
  // every peer, so a Bluetooth intercom connecting (or dropping) mid-ride
  // doesn't leave the rider silent.
  // One swap at a time: a headset connecting fires several device changes, and two swaps
  // racing each other could leave a link holding a mic the other one had already stopped.
  const swapChainRef = useRef<Promise<void>>(Promise.resolve());
  const swapInputDevice = useCallback(() => {
    const next = swapChainRef.current.then(() => swapInputDeviceNow()).catch((e) => console.warn('[Voice] Mic swap failed:', e));
    swapChainRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const swapInputDeviceNow = async () => {
    if (!localStreamRef.current) return;

    await refreshNativeCommunicationAudio();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints(await pickVoiceMic()) });
    } catch (e) {
      console.warn('[Voice] Headset mic unavailable, falling back to default:', e);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        console.error('[Voice] Could not re-acquire microphone:', e2);
        return;
      }
    }

    const newTrack = stream.getAudioTracks()[0];
    if (!newTrack) return;
    newTrack.enabled = !isMutedRef.current;
    console.log('[Voice] Swapped microphone to:', newTrack.label);

    // Every link takes the new mic before the old one is stopped: a link whose swap failed
    // would otherwise be left sending a stopped track, which the other rider hears as silence.
    const oldStream = localStreamRef.current;
    localStreamRef.current = stream;
    await sendCurrentMic();
    oldStream.getTracks().forEach((t) => t.stop());

    // Re-point the speaking-detection analyser at the new stream.
    stopAudioLevelMonitoring();
    startAudioLevelMonitoring();
  };

  /**
   * Makes sure every link is sending the mic in use now (tried twice). Also run by the sound
   * check every second, so a link left on an old or ended track is put right within a moment.
   */
  const sendCurrentMic = useCallback(async () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    const jobs: Promise<unknown>[] = [];
    peersRef.current.forEach(({ pc }, remoteUserId) => {
      pc.getSenders()
        .filter((s) => s.track?.kind === 'audio' || !s.track)
        .forEach((sender) => {
          if (sender.track === track) return;
          jobs.push(
            sender.replaceTrack(track).catch(async (e) => {
              console.warn(`[Voice] replaceTrack failed for ${remoteUserId}, trying again:`, e);
              await new Promise((r) => setTimeout(r, 300));
              await sender.replaceTrack(track).catch((e2) => console.warn(`[Voice] replaceTrack failed again for ${remoteUserId}:`, e2));
            }),
          );
        });
    });
    await Promise.all(jobs);
  }, []);

  // Keep the late-bound refs (used inside pc callbacks) pointing at the
  // latest implementations.
  useEffect(() => {
    applyOutputDeviceRef.current = applyOutputDevice;
    swapInputDeviceRef.current = () => void swapInputDevice();
  }, [applyOutputDevice, swapInputDevice]);

  // Playback watchdog: a remote element can end up paused (autoplay policy,
  // Bluetooth route switch, app backgrounded) while the WebRTC stream is
  // perfectly healthy - which is exactly "I can see you talking but hear
  // nothing". Nudge every element back into playback periodically and on any
  // user gesture.
  useEffect(() => {
    const kick = () => {
      audioElementsRef.current.forEach((audio, peerId) => {
        const stream = audio.srcObject as MediaStream | null;
        stream?.getAudioTracks().forEach((t) => { t.enabled = true; });
        if (audio.muted) audio.muted = false;
        if (Math.abs(audio.volume - duckVolume()) > 0.01) audio.volume = duckVolume();
        if (audio.paused) {
          audio.play().catch((e) => console.warn('[Voice] Watchdog play failed for', peerId, e?.name));
        }
      });
    };

    const interval = window.setInterval(kick, 3000);
    const events: string[] = ['pointerdown', 'touchend', 'click', 'visibilitychange'];
    events.forEach((ev) => document.addEventListener(ev, kick, { passive: true }));
    // Turn-by-turn prompts lower the crew while they're spoken.
    const offDuck = onAudioDuckChange(kick);

    return () => {
      offDuck();
      window.clearInterval(interval);
      events.forEach((ev) => document.removeEventListener(ev, kick));
    };
  }, []);



  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    console.log(`[Voice] Creating peer connection for ${remoteUserId}`);
    
    setPeerLink(remoteUserId, 'connecting');
    const pc = new RTCPeerConnection({
      iceServers: currentIceServers(),
      // Pre-gather a few candidates (incl. TURN) so the handshake completes
      // faster on flaky mobile links.
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });


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
      // Without any m-line the peer carries no audio at all in EITHER
      // direction, so we'd stay permanently silent even once the mic arrives.
      pc.addTransceiver('audio', { direction: 'sendrecv' });
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
        clearReconnectSchedule(remoteUserId);
        setPeerLink(remoteUserId, 'connected');
      }
      if (pc.connectionState === 'disconnected') {
        // Usually a transient mobile-network blip. Give ICE a chance to
        // recover on its own before tearing the peer down.
        console.warn(`[Voice] Connection disconnected with ${remoteUserId} - waiting for ICE recovery`);
        return;
      }
      if (pc.connectionState === 'failed') {
        console.warn(`[Voice] Connection failed with ${remoteUserId}`);
        setPeerLink(remoteUserId, 'failed');
        pc.close();
        peersRef.current.delete(remoteUserId);
        audioElementsRef.current.get(remoteUserId)?.remove();
        audioElementsRef.current.delete(remoteUserId);
        remoteStreamsRef.current.delete(remoteUserId);
        peerConsentRef.current.delete(remoteUserId);
        // Back off instead of relying on the flat 10s presence heartbeat to
        // eventually retry - important under sustained poor cellular signal.
        scheduleReconnect(remoteUserId);
      }
    };

    
    // Handle ICE connection state changes (more granular)
    pc.oniceconnectionstatechange = () => {
      console.log(`[Voice] ICE state with ${remoteUserId}: ${pc.iceConnectionState}`);
      // An ICE restart re-gathers candidates (including TURN relays) without
      // rebuilding the whole peer - the cheapest recovery from a signal drop.
      if (
        pc.iceConnectionState === 'failed' &&
        typeof pc.restartIce === 'function' &&
        userIdRef.current &&
        userIdRef.current > remoteUserId
      ) {
        console.warn(`[Voice] ICE failed with ${remoteUserId} - restarting ICE`);
        try {
          pc.restartIce();
        } catch (e) {
          console.warn('[Voice] restartIce failed:', e);
        }
      }
    };

    // Renegotiation - fires after an ICE restart or when the local mic track is
    // swapped (e.g. plugging in a Bluetooth intercom). Only the designated
    // offerer renegotiates, and only once the peer is already established.
    pc.onnegotiationneeded = async () => {
      if (!channelRef.current || !userIdRef.current) return;
      if (userIdRef.current < remoteUserId) return;
      if (!pc.remoteDescription || pc.signalingState !== 'stable') return;

      try {
        const offerDesc = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offerDesc);
        channelRef.current.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer: offerDesc, from: userIdRef.current, to: remoteUserId },
        });
        console.log(`[Voice] Renegotiation offer sent to ${remoteUserId}`);
      } catch (e) {
        console.warn('[Voice] Renegotiation failed:', e);
      }
    };

    // Handle ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`[Voice] ICE gathering state with ${remoteUserId}: ${pc.iceGatheringState}`);
    };


    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`[Voice] Received remote track from ${remoteUserId}`, event.streams);
      
      // Unified Plan often delivers tracks with no associated stream (e.g. from
      // a pre-added transceiver). Never drop them — wrap the bare track instead.
      let remoteStream: MediaStream;
      if (event.streams && event.streams.length > 0) {
        remoteStream = event.streams[0];
      } else {
        const existing = remoteStreamsRef.current.get(remoteUserId);
        if (existing) {
          if (!existing.getTracks().includes(event.track)) existing.addTrack(event.track);
          remoteStream = existing;
        } else {
          remoteStream = new MediaStream([event.track]);
        }
      }
      remoteStreamsRef.current.set(remoteUserId, remoteStream);
      console.log(`[Voice] Remote stream tracks:`, remoteStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      
      const isIOS = isIOSDevice();
      const isSafari = isSafariBrowser();
      
      let audio = audioElementsRef.current.get(remoteUserId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        // iOS Safari requires these attributes
        audio.setAttribute('webkit-playsinline', 'true');
        // Set volume explicitly
        audio.volume = duckVolume();
        // iOS Safari specific - muted must be false for audio to play
        audio.muted = false;
        // iOS Safari is much more reliable if the element exists in the DOM
        audio.style.cssText = 'position: absolute; left: -9999px; top: -9999px;';
        document.body.appendChild(audio);
        audioElementsRef.current.set(remoteUserId, audio);
        console.log(`[Voice] Created audio element for ${remoteUserId}, iOS: ${isIOS}, Safari: ${isSafari}`);
        
        // Route to the selected output (e.g. a Bluetooth intercom) where the
        // browser supports it - NOT available on iOS/Safari.
        applyOutputDeviceRef.current?.();
      }


      // Set srcObject before playing
      audio.srcObject = remoteStream;
      
      // Multi-strategy play function for iOS/Safari compatibility
      const tryPlay = async (attempt: number = 1) => {
        const maxAttempts = 3;
        console.log(`[Voice] Play attempt ${attempt}/${maxAttempts} for ${remoteUserId}`);

        // iOS/Safari sometimes needs repeated "unlock" nudges.
        if (isIOS || isSafari) {
          unlockIOSAudio();
        }

        try {
          // Ensure unlock AudioContext is running (iOS requirement)
          if (unlockAudioContext && unlockAudioContext.state === 'suspended') {
            await unlockAudioContext.resume();
          }

          // Ensure element is configured correctly
          audio!.muted = false;
          audio!.volume = duckVolume();
          audio!.autoplay = true;
          audio!.setAttribute('playsinline', 'true');
          audio!.setAttribute('webkit-playsinline', 'true');

          // IMPORTANT: Do NOT touch currentTime for MediaStream-backed audio.
          await audio!.play();
          console.log(`[Voice] Audio playing successfully for ${remoteUserId}`);
        } catch (caught) {
          const err = caught as MediaError;
          console.warn(`[Voice] Audio play attempt ${attempt} failed for ${remoteUserId}:`, err?.name, err?.message);

          if (attempt < maxAttempts) {
            setTimeout(() => void tryPlay(attempt + 1), 250 * attempt);
            return;
          }

          // Final fallback - play on next user gesture
          console.log(`[Voice] Setting up gesture-based playback for ${remoteUserId}`);

          const playOnGesture = async () => {
            try {
              audio!.muted = false;
              audio!.volume = duckVolume();
              await audio!.play();
              console.log(`[Voice] Audio playing after gesture for ${remoteUserId}`);
            } catch (e2) {
              console.warn('[Voice] Audio play after gesture failed:', e2);
            }
          };

          ['pointerdown', 'touchstart', 'click', 'touchend'].forEach((eventType) => {
            document.addEventListener(eventType, playOnGesture, { once: true, passive: true });
          });
        }
      };

      // Bind media readiness events once per element (Safari can delay actual playout)
      if (!audio.dataset.voiceReadyBound) {
        audio.dataset.voiceReadyBound = '1';
        audio.addEventListener('loadedmetadata', () => void tryPlay(1), { passive: true });
        audio.addEventListener('canplay', () => void tryPlay(1), { passive: true });
      }

      // Small delay to ensure stream is fully attached
      setTimeout(() => void tryPlay(1), 50);
    };

    peersRef.current.set(remoteUserId, { pc, oderId: remoteUserId, createdAt: Date.now() });
    if (peersRef.current.size + 1 > VOICE_MESH_COMFORT && !meshWarningShown) {
      meshWarningShown = true;
      toast.warning(tr("Big convoy for voice"), {
        description: tr("Voice works best with up to {0} riders. With more, each phone sends to everyone, so on mobile data some riders may drop out. Muting when you're not talking helps.", [VOICE_MESH_COMFORT]),
        duration: 10000,
      });
    }
    return pc;
  }, [clearReconnectSchedule, scheduleReconnect, setPeerLink]);

  // Handle signaling messages
  const handleSignaling = useCallback(async (payload: SignalingMessage) => {
    const { type, from, to, offer, answer, candidate, consent } = payload;
    
    // Ignore messages not meant for us
    if (to && to !== userIdRef.current) return;
    // Ignore our own messages
    if (from === userIdRef.current) return;

    // Track each rider's recording consent so we never mix a non-consenting
    // rider's voice into our own ride recording.
    if (from && typeof consent === 'boolean') {
      peerConsentRef.current.set(from, consent);
    }

    // Voice is full: no audio links with a rider past the line, or for one who's waiting.
    if (type !== 'user-left' && from && slotsRef.current && userIdRef.current && !(slotsRef.current.has(userIdRef.current) && slotsRef.current.has(from))) return;

    console.log(`[Voice] Received signaling: ${type} from ${from}, our ID: ${userIdRef.current}`);

    switch (type) {
      case 'user-joined': {
        if (!userIdRef.current || !channelRef.current || !localStreamRef.current) {
          console.warn('[Voice] Not ready to handle user-joined - missing refs');
          return;
        }
        
        // Skip if we already have a live OR in-flight connection. The 10s
        // presence heartbeat used to blow away half-completed handshakes,
        // which meant peers could never finish connecting on slow links.
        const existingPeer = peersRef.current.get(from);
        const handshakeAge = existingPeer ? Date.now() - existingPeer.createdAt : Infinity;
        const inFlight =
          existingPeer &&
          (existingPeer.pc.connectionState === 'connecting' ||
            existingPeer.pc.connectionState === 'new') &&
          handshakeAge < HANDSHAKE_STALL_MS;

        if (existingPeer && (existingPeer.pc.connectionState === 'connected' || inFlight)) {
          console.log(`[Voice] Connection to ${from} is ${existingPeer.pc.connectionState}, skipping offer`);
          return;
        }


        
        // Clean up any existing failed connection
        if (existingPeer) {
          console.log(`[Voice] Cleaning up stale connection to ${from}`);
          existingPeer.pc.close();
          peersRef.current.delete(from);
          audioElementsRef.current.get(from)?.remove();
          audioElementsRef.current.delete(from);
          remoteStreamsRef.current.delete(from);
          peerConsentRef.current.delete(from);
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
                consent: readRecordConsent(),
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
          // Reuse a healthy peer so renegotiation (ICE restart / mic swap)
          // doesn't tear down a working call. Only rebuild broken ones.
          const existingPeer = peersRef.current.get(from);
          const canReuse =
            existingPeer &&
            existingPeer.pc.signalingState === 'stable' &&
            existingPeer.pc.connectionState !== 'failed' &&
            existingPeer.pc.connectionState !== 'closed' &&
            !!existingPeer.pc.remoteDescription;

          if (existingPeer && !canReuse) {
            existingPeer.pc.close();
            peersRef.current.delete(from);
            audioElementsRef.current.get(from)?.remove();
            audioElementsRef.current.delete(from);
          }

          if (!offer) return;
          const pc = canReuse ? existingPeer!.pc : createPeerConnection(from);
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
              consent: readRecordConsent(),
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
            if (peer.pc.signalingState === 'have-local-offer' && answer) {
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
        // Deliberate departure, not a drop - don't keep retrying them.
        clearReconnectSchedule(from);
        const peer = peersRef.current.get(from);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(from);
          audioElementsRef.current.get(from)?.remove();
          audioElementsRef.current.delete(from);
          remoteStreamsRef.current.delete(from);
          peerConsentRef.current.delete(from);
        }
        setPeerLink(from, null);
        // Clear from speaking users
        setState(prev => {
          const newSet = new Set(prev.speakingUsers);
          newSet.delete(from);
          return { ...prev, speakingUsers: newSet };
        });
        break;
      }
    }
  }, [createPeerConnection, clearReconnectSchedule, readRecordConsent, setPeerLink]);

  /** Works out who voice has room for, drops links with anyone past the line, and tells this rider when they start or stop waiting. */
  const applySlots = useCallback((present: VoicePresence[]) => {
    const me = userIdRef.current;
    if (!me) return;
    const slots = voiceSlots(present);
    // Our own presence hasn't arrived yet: nothing to decide on.
    if (!present.some((p) => p?.user_id === me)) return;
    slotsRef.current = slots;
    const waiting = !slots.has(me);
    for (const id of Array.from(peersRef.current.keys())) {
      if (!waiting && slots.has(id)) continue;
      clearReconnectSchedule(id);
      peersRef.current.get(id)?.pc.close();
      peersRef.current.delete(id);
      audioElementsRef.current.get(id)?.remove();
      audioElementsRef.current.delete(id);
      remoteStreamsRef.current.delete(id);
      setPeerLink(id, null);
    }
    if (waiting === waitingRef.current) return;
    waitingRef.current = waiting;
    if (waiting) {
      // Nobody can hear a rider who's waiting: the mic goes quiet until they're in.
      isMutedRef.current = true;
      localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = false));
      setState((prev) => ({ ...prev, waiting: true, isMuted: true }));
      toast.warning(tr("Voice is full ({0} riders)", [VOICE_MAX]), { description: tr("You'll still see everyone on the map, and you'll join voice as soon as someone leaves it."), duration: 10000 });
    } else {
      setState((prev) => ({ ...prev, waiting: false }));
      toast.success(tr("You're in voice now"), { description: tr("A slot opened. Unmute when you want to talk.") });
      // Say hello again, so the riders already in start their links with this phone.
      channelRef.current?.send({ type: 'broadcast', event: 'user-joined', payload: { from: me, consent: readRecordConsent() } });
    }
  }, [clearReconnectSchedule, readRecordConsent, setPeerLink]);

  // Check and request microphone permission
  // Note: iOS Safari doesn't reliably support permissions.query for microphone
  // so we treat 'prompt' and unknown states as "try anyway"
  const checkMicrophonePermission = useCallback(async (): Promise<'granted' | 'denied' | 'prompt'> => {
    const isIOS = isIOSDevice();
    const isSafari = isSafariBrowser();
    
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
      return { success: false, error: tr("No convoy ID") };
    }

    // Guard against multiple simultaneous connection attempts
    if (isConnectingRef.current || state.isConnected) {
      console.log('[Voice] Already connecting or connected, skipping');
      return { success: state.isConnected };
    }
    
    isConnectingRef.current = true;
    
    // CRITICAL: Unlock iOS audio immediately on this user gesture.
    // NOTE: Do NOT `await` here. Awaiting yields the call stack and can break iOS gesture requirements.
    unlockIOSAudio();

    // Start fetching TURN relay credentials in parallel; awaited before any peer is created.
    const iceReady = loadIceServers();

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
      const user = await sessionUser();
      if (!user) {
        console.error('[Voice] No authenticated user');
        isConnectingRef.current = false;
        return { success: false, error: tr("Not authenticated") };
      }
      userIdRef.current = user.id;
      await iceReady;
      if (!hasRelay() && !relayWarningShown) {
        relayWarningShown = true;
        toast.warning(tr("Voice relay unavailable"), {
          description: tr("Voice works on Wi-Fi, but riders on mobile data may not hear each other."),
        });
      }

      // Get microphone access with optimized settings
      // Native Android must enter communication mode before microphone capture;
      // this activates the Bluetooth HFP/SCO path for both input and playback.
      // Safari's Audio Session API provides the equivalent HFP call route.
      startBrowserCommunicationAudio();
      await startNativeCommunicationAudio();
      let stream: MediaStream;
      const mic = await pickVoiceMic();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(mic),
        });
      } catch (caught) {
        const mediaError = (caught ?? {}) as { name?: string };
        // OverconstrainedError → the headset went between finding it and opening it.
        // Retry with the default device.
        if (mediaError?.name === 'OverconstrainedError' || mediaError?.name === 'ConstraintNotSatisfiedError') {
          console.warn('[Voice] Headset mic unavailable, retrying with default');
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: getAudioConstraints(),
            });
          } catch (retryError) {
            console.error('[Voice] Retry without saved device failed:', retryError);
            // Last-ditch: bare audio:true
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (bareError) {
              console.error('[Voice] Bare audio:true also failed:', bareError);
              isConnectingRef.current = false;
              return { success: false, error: tr("Failed to access microphone. Please try again.") };
            }
          }
        } else {
          console.error('[Voice] Failed to get microphone access:', mediaError);
          isConnectingRef.current = false;

          const isIOS = isIOSDevice();

          if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
            if (isIOS) {
              return {
                success: false,
                error: tr("Microphone access denied. On iOS, go to Settings → Safari → Microphone, then enable access for this site.")
              };
            }
            return {
              success: false,
              error: tr("Microphone access denied. Please enable it in your browser or device settings.")
            };
          }
          if (mediaError.name === 'NotFoundError') {
            return { success: false, error: tr("No microphone found. Please connect a microphone and try again.") };
          }
          if (mediaError.name === 'NotReadableError' || mediaError.name === 'AbortError') {
            return { success: false, error: tr("Microphone is in use by another app. Please close other apps using the microphone.") };
          }
          return { success: false, error: tr("Failed to access microphone. Please try again.") };
        }
      }

      
      localStreamRef.current = stream;
      // The first time the mic is allowed its devices have no names yet, so no headset could be
      // picked: now they have, move to the headset if there is one.
      if (!mic) {
        void pickVoiceMic().then((id) => {
          if (id && localStreamRef.current === stream) swapInputDeviceRef.current?.();
        });
      }

      // Live straight away: joining voice is the tap that means "I want to talk", and a second
      // tap to unmute left riders talking to nobody. One tap mutes (the button, or the headset).
      isMutedRef.current = false;
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });

      // Start audio level monitoring as early as possible (important for iOS gesture policies)
      startAudioLevelMonitoring();

      // A new channel: who has a slot is decided afresh from its presence.
      slotsRef.current = null;
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
          // Forget a talker who goes quiet without saying so (a dropped message, a phone that left).
          const stale = staleSpeakerTimersRef.current;
          const old = stale.get(oderId);
          if (old) window.clearTimeout(old);
          stale.delete(oderId);
          if (isSpeaking) {
            stale.set(oderId, window.setTimeout(() => {
              stale.delete(oderId);
              setState((prev) => {
                if (!prev.speakingUsers.has(oderId)) return prev;
                const next = new Set(prev.speakingUsers);
                next.delete(oderId);
                return { ...prev, speakingUsers: next };
              });
            }, SPEAKING_STALE_MS));
          }
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
          const present = Object.values(presenceState).flat() as VoicePresence[];
          applySlots(present);
          const muted = new Set(present.filter((p) => p.muted && p.user_id && p.user_id !== user.id).map((p) => p.user_id as string));
          setState((prev) => ({ ...prev, mutedUsers: muted }));
        });

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Voice] Subscribed to voice channel');
          
          // Track our presence
          if (!joinedAtRef.current) joinedAtRef.current = Date.now();
          await channel.track({ user_id: user.id, joined_at: joinedAtRef.current, priority: priorityRef.current, muted: isMutedRef.current });
          
          // Announce we joined
          channel.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { from: user.id, consent: readRecordConsent() },
          });
        }
      });

      channelRef.current = channel;

      // Audio level monitoring already started above (after getUserMedia)

      // Start periodic refresh to maintain connections when returning from nav app
      refreshIntervalRef.current = window.setInterval(() => {
        if (channelRef.current && userIdRef.current && !waitingRef.current) {
          console.log('[Voice] Periodic refresh - re-announcing presence');
          // Re-announce presence to trigger reconnection with any lost peers
          channelRef.current.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { from: userIdRef.current, consent: readRecordConsent() },
          });
        }
      }, VOICE_REFRESH_INTERVAL_MS);
      
      // Persist voice connection state for restoration after nav app
      try {
        localStorage.setItem(VOICE_STATE_KEY, JSON.stringify({ 
          convoyId, 
          connected: true,
          muted: false,
          timestamp: Date.now() 
        }));
      } catch (e) {
        console.warn('[Voice] Failed to persist voice state:', e);
      }
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isMuted: isMutedRef.current,
      }));

      isConnectingRef.current = false;
      console.log('[Voice] Connected successfully');
      return { success: true };
    } catch (error) {
      console.error('[Voice] Failed to connect:', error);
      isConnectingRef.current = false;
      cleanup();
      return { success: false, error: tr("Failed to connect to voice channel") };
    }
  }, [convoyId, handleSignaling, cleanup, startAudioLevelMonitoring, state.isConnected, checkMicrophonePermission, readRecordConsent, applySlots]);

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
    slotsRef.current = null;
    waitingRef.current = false;
    joinedAtRef.current = 0;
    
    setState({
      isConnected: false,
      isMuted: true,
      speakingUsers: new Set(),
      mutedUsers: new Set(),
      peerSound: {},
      micSound: null,
      peerLinks: {},
      waiting: false,
    });
  }, [cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!state.isConnected || !localStreamRef.current) {
      console.warn('[Voice] Cannot toggle mute - not connected or no stream');
      return;
    }
    if (waitingRef.current) {
      toast.info(tr("Voice is full ({0} riders)", [VOICE_MAX]), { description: tr("You'll still see everyone on the map, and you'll join voice as soon as someone leaves it.") });
      return;
    }
    
    const newMutedState = !state.isMuted;
    isMutedRef.current = newMutedState; // Update ref for audio level detection
    
    console.log(`[Voice] Toggling mute: ${state.isMuted} -> ${newMutedState}`);

    // iOS/Safari: resuming AudioContext MUST happen on a user gesture.
    // Doing it here ensures speaking detection works after unmuting.
    if (!newMutedState) {
      unlockIOSAudio();
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('[Voice] AudioContext resumed on unmute');
        }).catch((e) => {
          console.warn('[Voice] AudioContext resume failed on unmute:', e);
        });
      }
    }

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
    
    // Tell the others: they show "Muted" beside this rider while the mic is off.
    if (channelRef.current && userIdRef.current) {
      void channelRef.current
        .track({ user_id: userIdRef.current, joined_at: joinedAtRef.current, priority: priorityRef.current, muted: newMutedState })
        .catch(() => {});
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
          payload: { from: userIdRef.current, consent: readRecordConsent() },
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
  }, [state.isConnected, readRecordConsent]);

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
            if (result.success && voiceState.muted) {
              // Voice comes back live; a rider who had muted stays muted.
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

  // React to audio hardware changes while connected: a Bluetooth intercom
  // pairing/dropping fires `devicechange`, and picking a device in settings
  // fires our own event. Both need the live call re-routed, not a reconnect.
  useEffect(() => {
    if (!state.isConnected) return;

    let swapTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSwap = () => {
      if (swapTimer) clearTimeout(swapTimer);
      // Bluetooth stacks emit several devicechange events in a row.
      swapTimer = setTimeout(() => {
        void refreshNativeCommunicationAudio();
        swapInputDeviceRef.current?.();
        applyOutputDeviceRef.current?.();
      }, 500);
    };

    const onSelection = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'audiooutput') {
        applyOutputDeviceRef.current?.();
      } else {
        swapInputDeviceRef.current?.();
      }
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', debouncedSwap);
    window.addEventListener('blacktop:audio-device-change', onSelection);

    return () => {
      if (swapTimer) clearTimeout(swapTimer);
      navigator.mediaDevices?.removeEventListener?.('devicechange', debouncedSwap);
      window.removeEventListener('blacktop:audio-device-change', onSelection);
    };
  }, [state.isConnected]);

  // The sound check: once a second, read each link's own statistics (nothing goes over the
  // network) to say whether a rider's audio is arriving, how loud, and whether this phone is
  // playing it, and whether this phone's mic is actually sending. One-way audio ("they hear me,
  // I can't hear them") otherwise looks the same from every side.
  useEffect(() => {
    if (!state.isConnected) return;
    type Seen = { bytes: number; energy: number; duration: number };
    const lastIn = new Map<string, Seen>();
    let lastOut: Seen | null = null;
    // Seconds in a row the unmuted mic has sent pure digital silence, and the fixes tried.
    let deadFor = 0;
    let micRestarts = 0;
    const levelFrom = (now: Seen, before: Seen | undefined | null, reported?: number) => {
      if (typeof reported === 'number') return reported;
      if (!before || now.duration <= before.duration) return 0;
      return Math.sqrt(Math.max(0, now.energy - before.energy) / (now.duration - before.duration));
    };
    const tick = async () => {
      const sound: Record<string, PeerSound> = {};
      let out: Seen = { bytes: 0, energy: 0, duration: 0 };
      let outLevel: number | undefined;
      for (const [id, { pc }] of peersRef.current) {
        try {
          const stats = await pc.getStats();
          let inbound: Seen | null = null;
          let inLevel: number | undefined;
          stats.forEach((r: RTCStats & Record<string, unknown>) => {
            if (r.type === 'inbound-rtp' && r.kind === 'audio') {
              inbound = { bytes: Number(r.bytesReceived) || 0, energy: Number(r.totalAudioEnergy) || 0, duration: Number(r.totalSamplesDuration) || 0 };
              if (typeof r.audioLevel === 'number') inLevel = r.audioLevel;
            } else if (r.type === 'outbound-rtp' && r.kind === 'audio') {
              out = { ...out, bytes: out.bytes + (Number(r.bytesSent) || 0) };
            } else if (r.type === 'media-source' && r.kind === 'audio') {
              out = { ...out, energy: Number(r.totalAudioEnergy) || 0, duration: Number(r.totalSamplesDuration) || 0 };
              if (typeof r.audioLevel === 'number') outLevel = r.audioLevel;
            }
          });
          const seen = inbound as Seen | null;
          const before = lastIn.get(id);
          const arriving = !!seen && !!before && seen.bytes > before.bytes;
          if (seen) lastIn.set(id, seen);
          const audio = audioElementsRef.current.get(id);
          sound[id] = {
            arriving,
            level: seen ? Math.min(1, levelFrom(seen, before, inLevel) * 3) : 0,
            blocked: !!audio && audio.paused && arriving,
          };
        } catch {
          /* a link closing as it's read */
        }
      }
      const sending = !!lastOut && out.bytes > lastOut.bytes;
      const micLevel = Math.min(1, levelFrom(out, lastOut, outLevel) * 3);
      // A live mic is never perfectly silent (room noise survives noise suppression as a
      // trace); a mic that opened but carries nothing reads exactly zero. Five seconds of
      // that while unmuted: move to the phone's own mic, or restart it, at most twice a connection.
      const measured = !!lastOut && out.duration > lastOut.duration;
      const silent = measured && out.energy - (lastOut as Seen).energy <= 1e-10;
      const track = localStreamRef.current?.getAudioTracks()[0];
      const live = !!track && track.readyState === 'live' && track.enabled && !isMutedRef.current && !waitingRef.current;
      deadFor = live && silent ? deadFor + 1 : 0;
      if (deadFor >= 5 && micRestarts < 2) {
        deadFor = 0;
        micRestarts += 1;
        const onHeadset = !!track?.getSettings?.().deviceId && !headsetMicFailed;
        headsetMicFailed = true;
        console.warn('[Voice] The mic sent only silence: switching to the phone mic', track?.label);
        toast.warning(onHeadset ? tr("Your mic sent no sound, so voice switched to the phone's own mic.") : tr("Your mic sent no sound, so voice restarted it."));
        void swapInputDevice();
      }
      // Every link sending the mic in use now (a failed swap could leave one on a stopped track).
      void sendCurrentMic();
      lastOut = out;
      setState((prev) => ({ ...prev, peerSound: sound, micSound: { sending: sending && !isMutedRef.current, level: isMutedRef.current ? 0 : micLevel } }));
    };
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      window.clearInterval(timer);
      setState((prev) => ({ ...prev, peerSound: {}, micSound: null }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isConnected]);

  /** A rider's sound arrived but this phone wasn't allowed to play it: a tap plays it. */
  const playBlocked = useCallback(() => {
    unlockIOSAudio();
    audioElementsRef.current.forEach((audio) => {
      if (audio.paused) void audio.play().catch((e) => console.warn('[Voice] Tap to play failed:', e?.name));
    });
  }, []);

  // If the active mic track dies (intercom powered off, OS reclaimed it),
  // transparently grab a replacement rather than going silent.
  useEffect(() => {
    if (!state.isConnected) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;

    const onEnded = () => {
      console.warn('[Voice] Local mic track ended - re-acquiring');
      swapInputDeviceRef.current?.();
    };
    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [state.isConnected]);

  // The headset's or intercom's play / pause button mutes and unmutes while in voice (any page:
  // the browser's media session, lib/mediaKeys; the Android app: its own, nativeAudioRoute).
  // A squelch says which way it went, since nobody looks at the phone to press it.
  const toggleMuteRef = useRef<() => void>(() => {});
  toggleMuteRef.current = toggleMute;
  const mutedNowRef = useRef(true);
  useEffect(() => {
    if (!state.isConnected) return;
    // Play only ever unmutes and pause only ever mutes: some intercoms send "play" or "pause"
    // by themselves when they connect or start a call, which a plain toggle turned into a mute
    // nobody chose. The one-button keys (togglemicrophone, a headset's hook) still toggle.
    const press = (want?: 'on' | 'off') => {
      // The armed alarm owns the buttons (a double press can turn it off): voice leaves them be.
      if (isAlarmOn()) return;
      const unmuting = mutedNowRef.current;
      if (want === 'on' && !unmuting) return;
      if (want === 'off' && unmuting) return;
      toggleMuteRef.current();
      sceneCue(unmuting ? 'radioIn' : 'radioOut');
    };
    setMediaKeys('voice', { play: () => press('on'), pause: () => press('off'), togglemicrophone: () => press() });
    let stopNative: (() => void) | null = null;
    let gone = false;
    void listenToMediaButtons((key) => press(key === 'play' ? 'on' : key === 'pause' ? 'off' : undefined)).then((stop) => {
      if (gone) stop();
      else stopNative = stop;
    });
    return () => {
      gone = true;
      setMediaKeys('voice', null);
      stopNative?.();
    };
  }, [state.isConnected]);
  useEffect(() => {
    mutedNowRef.current = state.isMuted;
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms || !state.isConnected) return;
    try {
      ms.playbackState = state.isMuted ? 'paused' : 'playing';
      ms.metadata = new MediaMetadata({ title: tr("Convoy voice"), artist: state.isMuted ? tr("Muted") : tr("Live"), album: 'Blacktop' });
    } catch {
      /* no media session here */
    }
  }, [state.isConnected, state.isMuted]);

  // Mirror speakingUsers into the shared store so other features (e.g. the

  // map's member markers) can read who's talking without their own connection.
  useEffect(() => {
    setSpeakingUsers(state.speakingUsers);
    // Blacktop Radio dips while anyone else in the convoy is talking (not for this rider's own voice).
    setTalkDucked([...state.speakingUsers].some((id) => id !== userIdRef.current));
  }, [state.speakingUsers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      setSpeakingUsers(new Set());
      setTalkDucked(false);
      staleSpeakerTimersRef.current.forEach((t) => window.clearTimeout(t));
      staleSpeakerTimersRef.current.clear();
    };
  }, [cleanup]);

  // Live snapshot of every voice audio stream (own mic + remote peers) so the
  // overlay recorder can mix the convoy channel into its MP4 when enabled.
  const getAudioStreams = useCallback((): MediaStream[] => {
    const streams: MediaStream[] = [];
    if (localStreamRef.current) streams.push(localStreamRef.current);
    // Consent gate: only include riders who have opted into voice recording.
    remoteStreamsRef.current.forEach((stream, peerId) => {
      if (peerConsentRef.current.get(peerId)) streams.push(stream);
    });
    return streams;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    toggleMute,
    getAudioStreams,
    playBlocked,
  };
}
