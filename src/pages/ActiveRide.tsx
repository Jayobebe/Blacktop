import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useActiveRide, useRideHistory, RideSummary, useSoloRoute, clearSoloRoute } from '@/features/ride';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';
import { useConvoyState } from '@/features/convoy';
import { openBlacktopMap, clearMapDestination, closeBlacktopMap } from '@/features/map';
import { useNextWaypoint } from '@/features/waypoints';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';
import { useProfile } from '@/features/profile';
import { useRescue, RescueAlert, CrashCheckPrompt } from '@/features/rescue';
import { useCrashDetection } from '@/features/ride';
import { AUTO_RESCUE_ACK_TIMEOUT_SEC } from '@/features/settings/hooks/useSettings';
import { useWaypoints } from '@/features/waypoints';

import { announceSoloRescueToDiscord, useDiscordIntegration } from '@/features/integrations/discord';
import { useGarage } from '@/features/garage';
import { useOrientationLock } from '@/hooks/useOrientationLock';
import { useLeanAngle } from '@/hooks/useLeanAngle';
import { useGForce } from '@/hooks/useGForce';
import { useLiveOverlayRecorder } from '@/hooks/useLiveOverlayRecorder';
import { saveRideOverlayBlob } from '@/lib/overlayStore';

import { LeanAngleBar } from '@/components/LeanAngleBar';
import { GForceGauge } from '@/components/GForceGauge';
import { supabase } from '@/integrations/supabase/client';
import { ConvoyMemberInfo, BadgeType } from '@/types/convoy';
import { GpsStatus, GForceSample } from '@/types/blacktop';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, PhoneOff, Phone, Navigation, Users, Crown, User, Signal, SignalLow, SignalMedium, SignalHigh, AlertTriangle, Pause, Play } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getMemberColorStyles } from '@/lib/memberColors';

// GPS Signal Indicator Component
function GpsIndicator({ gpsStatus }: { gpsStatus: GpsStatus }) {
  const timeSinceUpdate = gpsStatus.lastUpdate 
    ? Math.floor((Date.now() - gpsStatus.lastUpdate) / 1000)
    : null;
  
  const isStale = timeSinceUpdate !== null && timeSinceUpdate > 5;
  const accuracy = gpsStatus.accuracy;
  
  // Determine signal quality
  let SignalIcon = Signal;
  let signalColor = 'text-muted-foreground/50';
  let title = 'Waiting for GPS...';
  
  if (gpsStatus.source !== 'none' && !isStale) {
    if (accuracy !== null && accuracy <= 10) {
      SignalIcon = SignalHigh;
      signalColor = 'text-emerald-400';
      title = `GPS: Excellent (±${Math.round(accuracy)}m)`;
    } else if (accuracy !== null && accuracy <= 30) {
      SignalIcon = SignalMedium;
      signalColor = 'text-accent';
      title = `GPS: Good (±${Math.round(accuracy)}m)`;
    } else if (accuracy !== null && accuracy <= 100) {
      SignalIcon = SignalLow;
      signalColor = 'text-yellow-400';
      title = `GPS: Fair (±${Math.round(accuracy)}m)`;
    } else {
      SignalIcon = SignalLow;
      signalColor = 'text-orange-400';
      title = accuracy ? `GPS: Weak (±${Math.round(accuracy)}m)` : 'GPS: Active';
    }
  } else if (isStale) {
    signalColor = 'text-destructive/70';
    title = 'GPS signal lost';
  }
  
  return (
    <div className="flex items-center gap-1" title={title}>
      <SignalIcon className={cn("w-3.5 h-3.5 transition-colors", signalColor)} />
    </div>
  );
}

// Get color styles for a member based on their accent color
const getMemberStyles = (member: ConvoyMemberInfo) => {
  return getMemberColorStyles(member.accentColor);
};

export default function ActiveRide() {
  const navigate = useNavigate();
  const { rideState, endRide, setRidePaused, updateLeanAngle, updateGForce } = useActiveRide();
  const { convoy, resetNavigationStatus, endConvoyRide, setConvoyRealtimeSuspended } = useConvoyState();
  // Only use voice channel for convoy rides with other members
  const voiceChannel = useVoiceChannel(rideState.isConvoyMode ? convoy.id : undefined);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = voiceChannel;
  const { settings } = useSettings();
  const { activeBike } = useGarage();
  const { updateRideBadges, addRideRecording, setRideOverlayAvailable } = useRideHistory();
  const { user, profile } = useProfile();
  const wakeLock = useWakeLock();
  const { addWaypoint } = useWaypoints(convoy.id, convoy.isLeader);
  const nextWaypoint = useNextWaypoint();
  const soloRoute = useSoloRoute();

  const { 
    rescueRequests, 
    hasPendingRescue, 
    sendRescueRequest, 
    acknowledgeRescue, 
    dismissRescue,
    cancelRescueRequest 
  } = useRescue(convoy.id, convoy.isLeader, user?.id || null, profile.name || null);
  
  // Keep audio session alive in background only when in convoy with other members
  useBackgroundAudio(rideState.isConvoyMode && isConnected && convoy.members.length > 1);
  
  // Lean angle sensor
  const leanAngle = useLeanAngle(settings.leanAngleEnabled && rideState.isActive);

  // G-force sensor - shared by the live gauge AND auto-rescue crash detection,
  // so there's a single devicemotion listener regardless of which feature(s) need it.
  const gForce = useGForce(rideState.isActive && (settings.gForceEnabled || settings.autoRescueEnabled));

  // Check if ride has lean / G-force data for overlay
  const hasLeanData = settings.leanAngleEnabled && leanAngle.isSupported;
  const hasGForceData = settings.gForceEnabled && gForce.isSupported;

  // MapLibre-style problem: canvas color parsing can't resolve `hsl(var(--accent))`,
  // so resolve the literal HSL for the selected accent up front (see BlacktopMap.tsx).
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  // "Blacktop Maps enabled" = the rider's preferred nav app is our in-app map.
  // Drives whether the downloadable overlay includes the live mini-map card.
  const blacktopMapEnabled = profile.preferredNavApp === 'blacktop';

  // Live overlay recorder
  const overlayRecorder = useLiveOverlayRecorder({
    speedUnit: settings.speedUnit,
    distanceUnit: settings.distanceUnit,
    hasLeanData,
    hasGForceData,
    accentColor,
    blacktopMapEnabled,
  });
  const overlayRecorderRef = useRef(overlayRecorder);
  overlayRecorderRef.current = overlayRecorder;
  
  // Pending overlay blob to save after ride ID is available
  const [pendingOverlayBlob, setPendingOverlayBlob] = useState<Blob | null>(null);
  
  // Orientation tracking (respects system rotation lock)
  const { orientation } = useOrientationLock();
  
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [endingFlow, setEndingFlow] = useState(false);
  const [finalMembers, setFinalMembers] = useState<ConvoyMemberInfo[]>([]);
  const [savedRideId, setSavedRideId] = useState<string | null>(null);
  const [pendingBadges, setPendingBadges] = useState<BadgeType[]>([]);
  const [finalRideStats, setFinalRideStats] = useState<{ duration: number; distance: number; maxSpeed: number; averageSpeed: number; maxLean?: number; maxGForce?: number; gForceSamples?: GForceSample[] } | null>(null);
  const [soloRescueSending, setSoloRescueSending] = useState(false);
  const [soloRescueSent, setSoloRescueSent] = useState(false);
  const { integration: discordIntegration } = useDiscordIntegration();
  const discordEnabled = !!discordIntegration?.webhook_url && discordIntegration.auto_announce !== false;
  const [crashPromptOpen, setCrashPromptOpen] = useState(false);
  // Locks the auto-rescue execution loop once a countdown has fully expired
  // and fired - a fresh mount (new/restarted ride) is the only way to clear
  // it, so a parked device or low-threshold false alarm can't keep firing
  // duplicate rescue webhooks every countdown cycle. Read directly in the
  // useCrashDetection `enabled` check below (a ref, not state, since it only
  // ever needs to be read at render time alongside other state changes).
  const autoRescueFiredRef = useRef(false);

  const membersRef = useRef<ConvoyMemberInfo[]>([]);
  const controlChannelRef = useRef<any>(null); // Control channel for ride commands from leader
  const rideStateRef = useRef(rideState); // Keep fresh ref for broadcast handler
  
  // Update ref on each render to avoid stale closures
  rideStateRef.current = rideState;

  // Save pending badges once savedRideId becomes available
  useEffect(() => {
    if (savedRideId && pendingBadges.length > 0) {
      console.log('[ActiveRide] Saving pending badges:', pendingBadges, 'to ride:', savedRideId);
      updateRideBadges(savedRideId, pendingBadges);
      setPendingBadges([]); // Clear after saving
    }
  }, [savedRideId, pendingBadges, updateRideBadges]);




  // Save pending overlay blob once savedRideId becomes available
  useEffect(() => {
    if (savedRideId && pendingOverlayBlob) {
      (async () => {
        try {
          console.log('[ActiveRide] Saving pending overlay to ride:', savedRideId);
          await saveRideOverlayBlob(savedRideId, pendingOverlayBlob);
          setRideOverlayAvailable(savedRideId, true);
        } catch (error) {
          console.error('[ActiveRide] Failed to persist overlay blob:', error);
          toast.error('Failed to save overlay');
        } finally {
          setPendingOverlayBlob(null);
        }
      })();
    }
  }, [savedRideId, pendingOverlayBlob, setRideOverlayAvailable]);

  // Keep screen awake during active ride
  useEffect(() => {
    if (rideState.isActive) {
      wakeLock.request();
    }
    return () => {
      wakeLock.release();
    };
  }, [rideState.isActive]);

  // Inactivity checkout guard: once useActiveRide flags 15 stationary minutes,
  // drop the convoy Realtime channel and release the wake lock so an
  // unattended phone doesn't keep broadcasting (and burning Realtime usage)
  // overnight. Resuming the ride (rideState.inactivityTimedOut -> false)
  // reconnects the channel and re-requests the wake lock.
  useEffect(() => {
    if (rideState.inactivityTimedOut) {
      setConvoyRealtimeSuspended(true);
      wakeLock.release();
    } else {
      setConvoyRealtimeSuspended(false);
      if (rideState.isActive) {
        wakeLock.request();
      }
    }
  }, [rideState.inactivityTimedOut, rideState.isActive]);

  // Request lean angle permission when ride starts (iOS requires user gesture)
  useEffect(() => {
    if (rideState.isActive && settings.leanAngleEnabled && !leanAngle.permissionGranted) {
      leanAngle.requestPermission();
    }
  }, [rideState.isActive, settings.leanAngleEnabled, leanAngle.permissionGranted, leanAngle.requestPermission]);

  // Sync lean angle to ride state for recording
  useEffect(() => {
    if (rideState.isActive && settings.leanAngleEnabled && leanAngle.isSupported) {
      updateLeanAngle(leanAngle.currentLean, leanAngle.maxLeanLeft, leanAngle.maxLeanRight);
    }
  }, [rideState.isActive, settings.leanAngleEnabled, leanAngle.isSupported, leanAngle.currentLean, leanAngle.maxLeanLeft, leanAngle.maxLeanRight, updateLeanAngle]);

  // Request G-force sensor permission when needed (iOS requires user gesture; falls
  // back to a request here if the Settings-time prompt was skipped/denied/reloaded)
  useEffect(() => {
    if (rideState.isActive && (settings.gForceEnabled || settings.autoRescueEnabled) && !gForce.permissionGranted) {
      gForce.requestPermission();
    }
  }, [rideState.isActive, settings.gForceEnabled, settings.autoRescueEnabled, gForce.permissionGranted, gForce.requestPermission]);

  // Persist max G-force to ride state for recording (only when the gauge feature is enabled)
  useEffect(() => {
    if (rideState.isActive && settings.gForceEnabled && gForce.isSupported) {
      updateGForce(gForce.currentG, gForce.maxG);
    }
  }, [rideState.isActive, settings.gForceEnabled, gForce.isSupported, gForce.currentG, gForce.maxG, updateGForce]);

  // Start overlay recording when ride starts
  const overlayStartedRef = useRef(false);
  useEffect(() => {
    if (rideState.isActive && !rideState.isPaused && !overlayStartedRef.current) {
      console.log('[ActiveRide] Starting overlay recording');
      overlayRecorderRef.current.startRecording();
      overlayStartedRef.current = true;
    }
  }, [rideState.isActive, rideState.isPaused]);

  // Update overlay stats during ride
  useEffect(() => {
    if (rideState.isActive && !rideState.isPaused && overlayStartedRef.current) {
      // Latest GPS fix + bearing from the last two points so the mini-map
      // can rotate to the direction of travel. Falls back to null when
      // stationary or before the second point arrives.
      const pts = rideState.gpsPoints;
      const last = pts.length > 0 ? pts[pts.length - 1] : null;
      let heading: number | null = null;
      if (pts.length >= 2) {
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const lat1 = a.lat * Math.PI / 180;
        const lat2 = b.lat * Math.PI / 180;
        const yh = Math.sin(dLng) * Math.cos(lat2);
        const xh = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        heading = ((Math.atan2(yh, xh) * 180) / Math.PI + 360) % 360;
      }
      overlayRecorderRef.current.updateStats({
        speed: rideState.currentSpeed,
        maxSpeed: rideState.maxSpeed,
        distance: rideState.distance,
        duration: rideState.duration,
        leanAngle: rideState.currentLean,
        maxLean: Math.max(rideState.maxLeanLeft, rideState.maxLeanRight),
        gForce: gForce.currentG,
        maxGForce: rideState.maxGForce,
        lat: last?.lat ?? null,
        lng: last?.lng ?? null,
        heading,
        members: convoy.members
          .filter((m) => m.userId !== user?.id && m.currentLat != null && m.currentLng != null)
          .map((m) => ({
            lat: m.currentLat as number,
            lng: m.currentLng as number,
            name: m.name,
            color: m.accentColor,
          })),
      });
    }
  }, [rideState.isActive, rideState.isPaused, rideState.currentSpeed, rideState.maxSpeed, rideState.distance, rideState.duration, rideState.currentLean, rideState.maxLeanLeft, rideState.maxLeanRight, gForce.currentG, rideState.maxGForce, rideState.gpsPoints, convoy.members, user?.id]);

  // Track convoy members
  useEffect(() => {
    if (convoy.members.length > 0) {
      membersRef.current = convoy.members;
    }
  }, [convoy.members]);

  // Cleanup voice channel on unmount (no auto-connect - users must explicitly join)
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [isConnected, disconnect]);

  // Redirect if no active ride (but don't interrupt the explicit "end ride" flow / summary)
  useEffect(() => {
    if (!rideState.isActive && !showSummary && !endingFlow) {
      navigate('/');
    }
  }, [rideState.isActive, showSummary, endingFlow, navigate]);

  // Refs for stable access in callbacks (avoid stale closures)
  const voiceChannelRef = useRef({ isConnected, disconnect });
  voiceChannelRef.current = { isConnected, disconnect };
  const endingFlowRef = useRef(endingFlow);
  endingFlowRef.current = endingFlow;
  const convoyMembersRef = useRef(convoy.members);
  convoyMembersRef.current = convoy.members;

  // Helper function to handle ride end (reusable for both broadcast and realtime)
  const handleRideEndedByLeader = useCallback(async () => {
    if (endingFlowRef.current) return; // Already ending
    console.log('[ActiveRide] Ride ended by leader');
    toast.info('Leader ended the ride');
    
    // Stop overlay recording and get the blob
    const overlayBlob = await overlayRecorderRef.current.stopRecording();
    overlayStartedRef.current = false;
    if (overlayBlob) {
      setPendingOverlayBlob(overlayBlob);
    }
    
    // Use flushSync to ensure state updates are applied BEFORE endRide() triggers external store re-render
    flushSync(() => {
      setEndingFlow(true);
      
      // Capture final ride stats before ending (use ref for fresh state)
      const currentRideState = rideStateRef.current;
      const avgSpeed = currentRideState.duration > 0 ? (currentRideState.distance / (currentRideState.duration / 3600)) : 0;
      setFinalRideStats({
        duration: currentRideState.duration,
        distance: currentRideState.distance,
        maxSpeed: currentRideState.maxSpeed,
        averageSpeed: avgSpeed,
        maxLean: Math.max(currentRideState.maxLeanLeft || 0, currentRideState.maxLeanRight || 0),
        maxGForce: currentRideState.maxGForce || undefined,
        gForceSamples: currentRideState.gForceSamples,
      });
      
      // Capture final members for badge summary - use membersRef first, fallback to current convoy.members
      const members = membersRef.current.length > 0 ? membersRef.current : convoyMembersRef.current;
      if (members.length > 0) {
        setFinalMembers(members);
      }
      
      // Show summary immediately
      setShowSummary(true);
    });
    
    // Disconnect voice (use ref for fresh values)
    if (voiceChannelRef.current.isConnected) {
      voiceChannelRef.current.disconnect();
    }
    
    // Run cleanup in background (non-blocking)
    (async () => {
      const rideId = await endRide();
      clearMapDestination();
      clearSoloRoute();
      closeBlacktopMap();

      if (rideId) {
        setSavedRideId(rideId);
      } else {
        setShowSummary(false);
        navigate('/');
      }
      resetNavigationStatus().catch(err => console.warn('[ActiveRide] Cleanup error:', err));
    })();
  }, [endRide, resetNavigationStatus, navigate]);

  // Subscribe to convoy control channel for broadcasts AND realtime convoy changes
  useEffect(() => {
    if (!convoy.id || !rideState.isConvoyMode) return;

    // Control channel for broadcasts (pause/resume/end-ride)
    const controlChannel = supabase.channel(`convoy-control:${convoy.id}`, {
      config: { broadcast: { self: false } },
    });

    controlChannel.on('broadcast', { event: 'end-ride' }, () => {
      handleRideEndedByLeader();
    });

    controlChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[ActiveRide] Subscribed to convoy control channel');
      }
    });

    controlChannelRef.current = controlChannel;

    // DURABLE: Also subscribe to realtime convoy changes to detect ride_ended_at
    // This ensures non-leaders end their ride even if they missed the broadcast
    const realtimeChannel = supabase
      .channel(`convoy-realtime:${convoy.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'convoys',
          filter: `id=eq.${convoy.id}`,
        },
        (payload) => {
          const newConvoy = payload.new as any;
          // If ride_ended_at is set and we're not the leader, end our ride
          if (newConvoy.ride_ended_at && !convoy.isLeader) {
            console.log('[ActiveRide] Detected ride_ended_at via realtime');
            handleRideEndedByLeader();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(controlChannel);
      supabase.removeChannel(realtimeChannel);
      controlChannelRef.current = null;
    };
  }, [convoy.id, convoy.isLeader, rideState.isConvoyMode, handleRideEndedByLeader]);

  const handleEndRide = async () => {
    // Stop overlay recording and get the blob first
    const overlayBlob = await overlayRecorderRef.current.stopRecording();
    overlayStartedRef.current = false;
    if (overlayBlob) {
      setPendingOverlayBlob(overlayBlob);
    }

    // Use flushSync to ensure state updates are applied BEFORE endRide() triggers external store re-render
    flushSync(() => {
      setEndingFlow(true);
    });

    // Disconnect voice immediately (non-blocking)
    if (isConnected) {
      disconnect();
    }

    const wasConvoyMode = rideState.isConvoyMode;
    const wasLeader = convoy.isLeader;
    const convoyId = convoy.id;

    // Capture final ride stats before ending
    const avgSpeed = rideState.duration > 0 ? (rideState.distance / (rideState.duration / 3600)) : 0;
    
    // Use flushSync to ensure state is applied before endRide
    flushSync(() => {
      setFinalRideStats({
        duration: rideState.duration,
        distance: rideState.distance,
        maxSpeed: rideState.maxSpeed,
        averageSpeed: avgSpeed,
        maxLean: Math.max(rideState.maxLeanLeft || 0, rideState.maxLeanRight || 0),
        maxGForce: rideState.maxGForce || undefined,
        gForceSamples: rideState.gForceSamples,
      });

      // Capture final members before ending for badge summary
      if (wasConvoyMode && membersRef.current.length > 0) {
        setFinalMembers(membersRef.current);
      }
    });

    // CRITICAL: If leader in convoy mode, set ride_ended_at AND broadcast 'end-ride'
    if (wasConvoyMode && wasLeader && convoyId) {
      console.log('[ActiveRide] Leader ending ride for all members');
      
      // Set ride_ended_at in database (durable - survives missed broadcasts)
      await supabase
        .from('convoys')
        .update({ ride_ended_at: new Date().toISOString() })
        .eq('id', convoyId);
      
      // Also broadcast for immediate notification (best effort)
      try {
        const broadcastChannel = supabase.channel(`convoy-control:${convoyId}`, {
          config: { broadcast: { self: false } },
        });

        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              supabase.removeChannel(broadcastChannel);
              resolve();
            }
          };

          const timeout = setTimeout(done, 1500);

          broadcastChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              try {
                await broadcastChannel.send({
                  type: 'broadcast',
                  event: 'end-ride',
                  payload: { at: Date.now() },
                });
                console.log('[ActiveRide] End-ride broadcast sent');
              } catch (err) {
                console.error('[ActiveRide] Broadcast error:', err);
              }
              clearTimeout(timeout);
              setTimeout(done, 100);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout);
              done();
            }
          });
        });
      } catch (err) {
        console.error('[ActiveRide] Broadcast failed:', err);
      }
    }

    // End the ride first so we know whether it was valid before flipping any
    // UI state. Invalid (too-short) rides return null and must not show a
    // receipt — that also keeps us from churning local storage on rapid
    // start/stop loops.
    const rideId = await endRide();
    clearMapDestination();
    clearSoloRoute();
    closeBlacktopMap();

    if (rideId) {
      flushSync(() => {
        setShowSummary(true);
      });
      setSavedRideId(rideId);
    } else {
      toast.info('Ride too short — not saved');
      navigate('/');
    }

    // Cleanup convoy state in background
    const cleanupPromises: Promise<any>[] = [];
    if (wasConvoyMode) {
      if (wasLeader) {
        cleanupPromises.push(endConvoyRide());
      } else {
        cleanupPromises.push(resetNavigationStatus());
      }
    }

    // Wait for cleanup but don't block UI
    Promise.all(cleanupPromises).catch(err => {
      console.warn('[ActiveRide] Cleanup error:', err);
    });
  };

  const handleBadgesEarned = useCallback((badges: BadgeType[]) => {
    // Only save badges for convoy rides with 2+ members - solo rides never earn badges
    // RideSummary already gates this callback - it only calls when members.length >= 2
    // Use finalMembers (captured at ride end) since convoy.members may be empty by now
    if (badges.length > 0 && rideState.isConvoyMode && finalMembers.length >= 2) {
      console.log('[ActiveRide] Badges earned:', badges);
      // Store badges - they'll be saved when savedRideId becomes available
      setPendingBadges(badges);
    }
  }, [rideState.isConvoyMode, finalMembers.length]);

  const handleCloseSummary = () => {
    setShowSummary(false);
    // Finished convoy lobbies are burned, so never route back into the lobby.
    navigate('/');
  };

  const handleRescue = async () => {
    // Get current location from ride state or request fresh position
    const gpsPoints = rideState.gpsPoints;
    if (gpsPoints.length > 0) {
      const lastPoint = gpsPoints[gpsPoints.length - 1];
      await sendRescueRequest(lastPoint.lat, lastPoint.lng);
    } else {
      // Try to get current position
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await sendRescueRequest(position.coords.latitude, position.coords.longitude);
        },
        () => {
          toast.error('Unable to get your location');
        }
      );
    }
  };

  // ---- Auto-rescue (crash detection) ----
  const fireAutoRescue = useCallback(async () => {
    const gpsPoints = rideState.gpsPoints;
    const fire = async (lat: number, lng: number) => {
      if (rideState.isConvoyMode) {
        // Convoy: broadcast to leader (already pings Discord via useRescue)
        await sendRescueRequest(lat, lng);
      } else {
        // Solo: Discord-only
        const res = await announceSoloRescueToDiscord({
          riderName: profile.name || 'Rider',
          lat,
          lng,
        });
        if (res.skipped) {
          toast.warning('Auto-rescue: no Discord webhook configured');
        } else if (res.ok) {
          toast.success('Auto-rescue ping sent to Discord');
        } else {
          toast.error('Auto-rescue failed to send');
        }
      }
    };

    if (gpsPoints.length > 0) {
      const last = gpsPoints[gpsPoints.length - 1];
      await fire(last.lat, last.lng);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => fire(pos.coords.latitude, pos.coords.longitude),
        () => fire(0, 0),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [rideState.gpsPoints, rideState.isConvoyMode, sendRescueRequest, profile.name]);

  useCrashDetection({
    enabled: settings.autoRescueEnabled && rideState.isActive && !rideState.isPaused && !crashPromptOpen && !autoRescueFiredRef.current,
    currentSpeed: rideState.currentSpeed,
    currentG: gForce.currentG,
    gThreshold: settings.autoRescueGThreshold,
    stopWindowSec: settings.autoRescueStopWindowSec,
    onPossibleCrash: useCallback(() => {
      console.log('[ActiveRide] Possible crash detected');
      setCrashPromptOpen(true);
    }, []),
  });



  const handleAddRescueWaypoint = async (request: typeof rescueRequests[0]) => {
    console.log('[ActiveRide] Adding rescue waypoint for', request.userName);
    const success = await addWaypoint({
      name: `Rescue: ${request.userName}`,
      address: `Lat: ${request.lat.toFixed(4)}, Lng: ${request.lng.toFixed(4)}`,
      lat: request.lat,
      lng: request.lng,
    });
    
    if (success) {
      // Pass riderName for toast confirmation to both leader and rescuee
      await acknowledgeRescue(request.id, request.userId, request.userName);
    } else {
      console.error('[ActiveRide] Failed to add rescue waypoint');
      toast.error('Failed to add rescue waypoint');
    }
  };

  // Show summary after convoy ride ends - show if we have stats even if no members (solo ride)
  if (showSummary) {
    return (
      <RideSummary 
        members={finalMembers} 
        currentUserId={user?.id}
        rideStats={finalRideStats || undefined}
        bikeName={activeBike?.name ?? null}
        bikePhoto={activeBike?.photos?.hero ?? null}
        gForceSamples={finalRideStats?.gForceSamples}
        onBadgesEarned={handleBadgesEarned}
        onClose={handleCloseSummary} 
      />
    );
  }

  if (!rideState.isActive && !endingFlow) return null;

  // Sort members by top speed (highest first) if rankings enabled, otherwise by join time
  const sortedMembers = settings.showSpeedRankings 
    ? [...convoy.members].sort((a, b) => (b.topSpeed || 0) - (a.topSpeed || 0))
    : convoy.members;

  const endRideButton = (
    <div className="flex justify-center">
      {!showEndConfirm ? (
        <Button
          onClick={() => setShowEndConfirm(true)}
          variant="outline"
          size="sm"
          className="h-9 md:h-10 px-4 text-sm font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <Square className="w-3.5 h-3.5 mr-1.5" />
          {rideState.isConvoyMode && convoy.isLeader ? 'END CONVOY' : 'END RIDE'}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={handleEndRide}
            size="sm"
            className="h-9 md:h-10 px-4 text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            END RIDE
          </Button>
          <Button
            onClick={() => setShowEndConfirm(false)}
            variant="ghost"
            size="sm"
            className="h-9 md:h-10"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-dvh max-h-dvh overflow-y-auto flex flex-col bg-background p-3 safe-top safe-bottom md:p-4 lg:p-6 transition-all duration-300">
      {/* Rescue Alerts (Leader only) */}
      {convoy.isLeader && (
        <RescueAlert
          requests={rescueRequests}
          onAddWaypoint={handleAddRescueWaypoint}
          onDismiss={dismissRescue}
        />
      )}

      {/* Auto-rescue crash check */}
      {crashPromptOpen && (
        <CrashCheckPrompt
          timeoutSec={AUTO_RESCUE_ACK_TIMEOUT_SEC}
          onImFine={() => {
            setCrashPromptOpen(false);
            toast.success('Glad you’re okay. Ride on.');
          }}
          onSendNow={async () => {
            setCrashPromptOpen(false);
            await fireAutoRescue();
          }}
          onTimeout={async () => {
            // Lock first - the rider didn't respond, so this is the one
            // notification this incident gets. Closing the ride below stops
            // crash detection naturally, but this ref closes the gap before
            // that takes effect.
            if (autoRescueFiredRef.current) return;
            autoRescueFiredRef.current = true;
            setCrashPromptOpen(false);
            await fireAutoRescue();
            toast.error('Auto-rescue sent - ending ride', {
              description: 'No response detected, so a rescue alert was sent and your ride was ended.',
            });
            await handleEndRide();
          }}
        />
      )}

      {/* Main content area - vertical in portrait, horizontal in landscape */}
      <div className={cn(
        "flex-1 flex flex-col landscape:flex-row gap-3 md:gap-4 landscape:gap-6 min-h-0 overflow-y-auto landscape:overflow-visible landscape:items-center landscape:justify-center",
        // Center content in landscape when solo or when convoy members panel is collapsed
        (!rideState.isConvoyMode || !showMembers) && "landscape:justify-center"
      )}>
        {/* Landscape Left: Big Stats List */}
        <div className="hidden landscape:flex flex-col justify-center items-start gap-7 w-[18%] min-w-[130px]">
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">Distance</p>
            <p className="font-mono text-4xl lg:text-5xl font-bold truncate">
              {formatDistance(rideState.distance, settings.distanceUnit)}
              <span className="text-lg text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">Time</p>
            <p className="font-mono text-4xl lg:text-5xl font-bold truncate">{formatDuration(rideState.duration)}</p>
          </div>
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">Max</p>
            <p className="font-mono text-4xl lg:text-5xl font-bold truncate">
              {formatSpeed(rideState.maxSpeed, settings.speedUnit)}
              <span className="text-lg text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>
            </p>
          </div>
        </div>

        {/* Speed and Stats */}
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center animate-fade-in min-w-0",
          // Raise the speed/lean cluster slightly in landscape so it clears the End Ride button
          "landscape:-translate-y-2",
          // In landscape, don't let it grow beyond content when centered
          (!rideState.isConvoyMode || !showMembers) && "landscape:flex-none"
        )}>
          {/* Header - compact */}
          <div className="flex items-center gap-2 mb-2 landscape:mb-1 md:mb-4">
            {rideState.isConvoyMode && (
              <span className="flex items-center gap-1 text-accent text-xs font-medium px-2 py-0.5 bg-accent/10 rounded">
                <Users className="w-3 h-3" />
                {convoy.isLeader ? 'LEADER' : 'CONVOY'}
              </span>
            )}
            {rideState.isPaused && (
              <span className="flex items-center gap-1 text-warning text-xs font-medium px-2 py-0.5 bg-warning/10 rounded animate-pulse">
                <Pause className="w-3 h-3" />
                PAUSED
              </span>
            )}
            <GpsIndicator gpsStatus={rideState.gpsStatus} />
          </div>

          {/* Speed Display - large and prominent */}
          <div className="text-center">
            <div className={cn(
              "font-mono font-black transition-all leading-none",
              "text-[8rem] [@media(max-height:820px)]:text-[6rem] [@media(max-height:700px)]:text-[5rem] md:text-[11rem] lg:text-[14rem] landscape:text-[7.5rem] landscape:[@media(max-height:500px)]:text-[5.5rem] landscape:[@media(max-height:420px)]:text-[4.5rem]",
              rideState.currentSpeed >= settings.redSpeedThreshold && "text-destructive animate-speed-glow-red",
              rideState.currentSpeed >= settings.amberSpeedThreshold &&
              rideState.currentSpeed < settings.redSpeedThreshold && "text-warning animate-speed-glow"
            )}>
              {formatSpeed(rideState.currentSpeed, settings.speedUnit)}
            </div>
            <p className="text-muted-foreground text-base landscape:text-sm -mt-3">{getSpeedLabel(settings.speedUnit)}</p>
            
            {/* Lean Angle Bar + G-Force Gauge - portrait only */}
            <div className="landscape:hidden">
              {(settings.leanAngleEnabled || (settings.gForceEnabled && gForce.isSupported)) && (
                <div className="mt-2 flex flex-col">
                  {settings.leanAngleEnabled && (
                    <div>
                      <LeanAngleBar 
                        currentLean={leanAngle.currentLean}
                        maxLean={leanAngle.maxLean}
                        threshold={settings.leanAngleThreshold}
                        onReset={() => {
                          leanAngle.calibrate();
                          toast.success('Lean sensor zeroed', { duration: 1500 });
                        }}
                      />
                      {leanAngle.isCalibrated && (
                        <p className="text-[10px] text-muted-foreground/60 text-center mt-0.5">zeroed</p>
                      )}
                    </div>
                  )}

                  {settings.gForceEnabled && gForce.isSupported && (
                    <div className="mt-2 flex justify-center">
                      <GForceGauge currentG={gForce.currentG} maxG={rideState.maxGForce} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lean Angle Bar - landscape only, centred below live speed */}
          {settings.leanAngleEnabled && (
            <div className="hidden landscape:flex flex-col items-center mt-1 scale-125 origin-top">
              <LeanAngleBar
                vertical
                currentLean={leanAngle.currentLean}
                maxLean={leanAngle.maxLean}
                threshold={settings.leanAngleThreshold}
                onReset={() => {
                  leanAngle.calibrate();
                  toast.success('Lean sensor zeroed', { duration: 1500 });
                }}
              />
              {leanAngle.isCalibrated && (
                <p className="text-[10px] text-muted-foreground/60 text-center mt-0.5">zeroed</p>
              )}
            </div>
          )}

          {/* Stats Row - portrait only */}
          <div className="flex landscape:hidden gap-8 [@media(max-height:820px)]:gap-5 [@media(max-height:820px)]:mt-2 md:gap-14 mt-3 md:mt-5">
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">
                {formatDistance(rideState.distance, settings.distanceUnit)}
                <span className="text-sm text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
              </p>
            </div>
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Time</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">{formatDuration(rideState.duration)}</p>
            </div>
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">
                {formatSpeed(rideState.maxSpeed, settings.speedUnit)}
                <span className="text-sm text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>
              </p>
            </div>
          </div>

          {/* End Ride Button - landscape only, below live speed */}
          <div className="hidden landscape:flex mt-3 justify-center animate-slide-up">
            {endRideButton}
          </div>
        </div>

        {/* Landscape: G-Force between speed and buttons */}
        {settings.gForceEnabled && gForce.isSupported && (
          <div className="hidden landscape:flex flex-col items-center justify-center w-[14%] min-w-[110px]">
            <GForceGauge currentG={gForce.currentG} maxG={rideState.maxGForce} />
          </div>
        )}

        {/* Controls - row in portrait, column in landscape */}
        <div className="flex landscape:flex-col items-center justify-center gap-4 landscape:gap-4 px-2 landscape:w-[18%] landscape:min-w-[120px] landscape:max-h-full landscape:overflow-y-auto landscape:py-1">
          {/* Pause/Resume button (individual - all members) - circular icon-only */}
          <button
            onClick={() => {
              const nextPaused = !rideState.isPaused;
              setRidePaused(nextPaused);
              toast.info(nextPaused ? 'Ride paused' : 'Ride resumed');
            }}
            className={cn(
              "h-14 w-14 landscape:h-16 landscape:w-16 rounded-full flex items-center justify-center transition-all touch-target",
              rideState.isPaused
                ? "bg-accent/20 text-accent"
                : "bg-secondary hover:bg-muted text-muted-foreground"
            )}
            title={rideState.isPaused ? "Resume ride" : "Pause ride"}
          >
            {rideState.isPaused ? (
              <Play className="w-7 h-7 landscape:w-8 landscape:h-8" />
            ) : (
              <Pause className="w-7 h-7 landscape:w-8 landscape:h-8" />
            )}
          </button>

          {/* Rescue button - circular icon-only.
              Convoy: non-leaders ping the leader.
              Solo: pings user's Discord webhook when enabled.
              Kept in the controls row (not next to End Ride) to avoid
              accidental presses. */}
          {rideState.isConvoyMode && !convoy.isLeader && (
            <button
              onClick={hasPendingRescue ? cancelRescueRequest : handleRescue}
              className={cn(
                "h-14 w-14 landscape:h-16 landscape:w-16 rounded-full flex items-center justify-center transition-all touch-target",
                hasPendingRescue 
                  ? "bg-warning/20 text-warning animate-pulse" 
                  : "bg-secondary hover:bg-warning/20 text-warning"
              )}
              title={hasPendingRescue ? "Cancel rescue request" : "Request rescue"}
            >
              <AlertTriangle className="w-7 h-7 landscape:w-8 landscape:h-8" />
            </button>
          )}
          {!rideState.isConvoyMode && discordEnabled && (
            <button
              onClick={async () => {
                if (soloRescueSending || soloRescueSent) return;
                setSoloRescueSending(true);
                try {
                  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                      enableHighAccuracy: true,
                      timeout: 8000,
                      maximumAge: 5000,
                    });
                  });
                  const result = await announceSoloRescueToDiscord({
                    riderName: profile.name || 'Driver',
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                  });
                  if (result.skipped) {
                    toast.error('Connect Discord in Settings to use rescue ping');
                  } else if (result.ok) {
                    toast.success('Rescue ping sent to Discord');
                    setSoloRescueSent(true);
                    setTimeout(() => setSoloRescueSent(false), 30000);
                  } else {
                    toast.error('Failed to send rescue ping');
                  }
                } catch (err) {
                  console.error('[SoloRescue]', err);
                  toast.error('Could not get your location');
                } finally {
                  setSoloRescueSending(false);
                }
              }}
              disabled={soloRescueSending || soloRescueSent}
              className={cn(
                "h-14 w-14 landscape:h-16 landscape:w-16 rounded-full flex items-center justify-center transition-all touch-target disabled:opacity-60",
                soloRescueSent
                  ? "bg-warning/20 text-warning animate-pulse"
                  : "bg-secondary hover:bg-warning/20 text-warning"
              )}
              title={soloRescueSent ? 'Rescue ping sent' : soloRescueSending ? 'Sending…' : 'Send rescue ping to Discord'}
            >
              <AlertTriangle className="w-7 h-7 landscape:w-8 landscape:h-8" />
            </button>
          )}

          {/* Map button — opens Blacktop map overlay with destination + route */}
          <Button
            variant="ghost"
            onClick={() => {
              if (rideState.isConvoyMode) {
                const dest = nextWaypoint
                  ? { lat: nextWaypoint.lat, lng: nextWaypoint.lng, name: nextWaypoint.name }
                  : convoy.destination
                    ? { lat: convoy.destination.lat, lng: convoy.destination.lng, name: convoy.destination.name }
                    : undefined;
                openBlacktopMap(dest);
              } else if (soloRoute.destination) {
                openBlacktopMap({
                  lat: soloRoute.destination.lat,
                  lng: soloRoute.destination.lng,
                  name: soloRoute.destination.name,
                  address: soloRoute.destination.address,
                });
              } else {
                openBlacktopMap();
              }
            }}

            className="h-14 w-14 landscape:h-16 landscape:w-16 rounded-full bg-secondary hover:bg-muted touch-target"
            title="Open map with route"
          >
            <Navigation className="w-7 h-7 landscape:w-8 landscape:h-8" />
          </Button>

          {/* Voice Controls (Convoy Mode) */}
          {rideState.isConvoyMode && (
            <div className="flex items-center gap-2">
              {/* Voice disconnect/connect button */}
              <button
                onClick={async () => {
                  try {
                    // CRITICAL: Unlock iOS audio immediately on user gesture (fire-and-forget, never blocks)
                    unlockIOSAudio();

                    if (isConnected) {
                      disconnect();
                      toast.success('Left voice channel', { description: 'Saving battery' });
                    } else {
                      const result = await connect();
                      if (result.success) {
                        toast.success('Joined voice channel', { description: 'Tap mic to unmute' });
                      } else {
                        toast.error('Failed to join voice channel', { description: result.error || 'Check microphone permissions' });
                      }
                    }
                  } catch (e) {
                    console.error('[Voice] Button error', e);
                    toast.error('Voice action failed');
                  }
                }}
                className={cn(
                  "w-12 h-12 landscape:w-16 landscape:h-16 rounded-full flex items-center justify-center transition-all touch-target",
                  isConnected
                    ? "bg-destructive/20 hover:bg-destructive/30 text-destructive"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                )}
                title={isConnected ? "Leave voice channel (saves battery)" : "Join voice channel"}
              >
                {isConnected ? (
                  <PhoneOff className="w-5 h-5 landscape:w-7 landscape:h-7" />
                ) : (
                  <Phone className="w-5 h-5 landscape:w-7 landscape:h-7" />
                )}
              </button>

              {/* Mute toggle button - only show when connected */}
              {isConnected && (
                <button
                  onClick={() => {
                    // User gesture - try to unlock audio on iOS
                    const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQsMR6LR1cloBA8KZaLe0sdaAAsHWZ/hzq9MAAAIA1if4M6vTAAACQNPkt3Jp0kA');
                    silentAudio.volume = 0.01;
                    silentAudio.play().catch(() => {});
                    toggleMute();
                  }}
                  className={cn(
                    "w-16 h-16 landscape:w-20 landscape:h-20 rounded-full flex items-center justify-center transition-all touch-target",
                    !isMuted
                      ? "bg-ptt-active scale-105 animate-ptt-pulse shadow-glow"
                      : "bg-ptt-inactive hover:bg-muted"
                  )}
                >
                  {isMuted ? (
                    <MicOff className="w-7 h-7 landscape:w-8 landscape:h-8 text-foreground" />
                  ) : (
                    <Mic className="w-7 h-7 landscape:w-8 landscape:h-8 text-background" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* Toggle members panel button */}
          {rideState.isConvoyMode && (
            <Button
              variant="ghost"
              onClick={() => setShowMembers(!showMembers)}
              className={cn(
                "h-14 w-14 landscape:h-16 landscape:w-16 rounded-full touch-target",
                showMembers ? "bg-accent/20 text-accent" : "bg-secondary hover:bg-muted"
              )}
            >
              <Users className="w-7 h-7 landscape:w-8 landscape:h-8" />
            </Button>
          )}
        </div>

        {/* Convoy Members Panel - bottom in portrait, right side in landscape */}
        {rideState.isConvoyMode && showMembers && (
          <div className="landscape:w-56 md:landscape:w-64 animate-slide-up flex-shrink-0 max-h-[30vh] landscape:max-h-none overflow-hidden">
            <div className="bg-card border border-border rounded-xl p-2 md:p-3 h-full flex flex-col">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Convoy ({convoy.members.length})
              </h3>
              
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {sortedMembers.map((member, index) => {
                  const colorStyles = getMemberStyles(member);
                  const isSpeaking = speakingUsers.has(member.userId);
                  
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 p-1.5 rounded-lg border transition-all",
                        isSpeaking ? "ring-1 border-transparent" : "border-border/50"
                      )}
                      style={{
                        backgroundColor: colorStyles.bg,
                        ...(isSpeaking ? { '--tw-ring-color': colorStyles.ring } as React.CSSProperties : {})
                      }}
                    >
                      {/* Avatar with speaking glow */}
                      <div 
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                          isSpeaking && "scale-105"
                        )}
                        style={{
                          backgroundColor: colorStyles.bg,
                          boxShadow: isSpeaking ? colorStyles.glow : undefined
                        }}
                      >
                        {member.isLeader ? (
                          <Crown className="w-3.5 h-3.5" style={{ color: colorStyles.text }} />
                        ) : (
                          <User className="w-3.5 h-3.5" style={{ color: colorStyles.text }} />
                        )}
                      </div>
                      
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate" style={{ color: colorStyles.text }}>
                          {member.name}
                          {isSpeaking && <span className="ml-1 text-[10px] opacity-75">🎤</span>}
                        </p>
                        {settings.showSpeedRankings && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatSpeed(member.currentSpeed || 0, settings.speedUnit)} {getSpeedLabel(settings.speedUnit)}
                          </p>
                        )}
                      </div>
                      
                      {/* Top speed badge - compact */}
                      {settings.showSpeedRankings && (
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-xs font-bold" style={{ color: colorStyles.text }}>
                            {formatSpeed(member.topSpeed || 0, settings.speedUnit)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Solo rescue moved into the controls row (next to Map/Pause) so it's
          not adjacent to End Ride — riders were tapping it accidentally. */}



      {/* End Ride Button - portrait only, landscape version sits below live speed */}
      <div className="mt-2 md:mt-3 flex justify-center animate-slide-up landscape:hidden">
        {endRideButton}
      </div>


    </div>
  );
}
