import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useActiveRide, useRideHistory, useSoloRoute, clearSoloRoute, flyReceipt } from '@/features/ride';
import { RideWrapUp } from '@/features/ride/components/RideWrapUp';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';
import { useConvoyState, useRegroupListener, getConvoySnapshot, ConvoyQrButton } from '@/features/convoy';
import { useProximity, useConvoyMergeSync, announceMergeToConvoy, type ConvoyActions } from '@/features/proximity';
import { attachRideToConvoy, subscribeRawFixes } from '@/features/ride';
import { armTripForRide, trackTripFix, lastTripLeg, type RideTripLeg } from '@/features/ride/lib/trips';
import { notify } from '@/lib/inbox';
import { useReactionsListener } from '@/features/pillion';
import { openBlacktopMap, clearMapDestination, closeBlacktopMap } from '@/features/map';
import { isTwistyLeg } from '@/features/map/lib/routeStyle';
import { useNextWaypoint } from '@/features/waypoints';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';
import { useProfile } from '@/features/profile';
import { RadioButton } from '@/features/radio';
import { useRescue, RescueAlert, CrashCheckPrompt, EmergencyTextButton, emergencyTextAction, cleanPhone, sendSoloRescue as sendSoloRescueCall, HoldRescueButton, MedicalIdButton } from '@/features/rescue';
import { useCrashDetection, usePeaksHidden, PEAK_HIDDEN, RideDial } from '@/features/ride';
import { autoNameRide, storedRide } from '@/features/ride/lib/rideNames';
import { useRideUpdates } from '@/features/ride/hooks/useRideUpdates';
import { resetRadio } from '@/features/radio/hooks/useRadioPlayer';
import { useRideOrientationLock } from '@/features/ride/hooks/useRideOrientationLock';
import { useSpectateBroadcast } from '@/features/spectate';
import { clearParkedSpot } from '@/lib/parkedSpot';
import { useBatterySaver } from '@/features/ride/hooks/useBatterySaver';
import { AUTO_RESCUE_ACK_TIMEOUT_SEC } from '@/features/settings/hooks/useSettings';
import { useWaypoints } from '@/features/waypoints';

import { useDiscordIntegration } from '@/features/integrations/discord';
import { useGarage, FillUpPrompt } from '@/features/garage';
import { SpeedLimitSign } from '@/components/SpeedLimitSign';
import { speedBands, useSpeedLimit } from '@/lib/speedLimit';
import { useOrientationLock } from '@/hooks/useOrientationLock';
import { useLeanAngle } from '@/hooks/useLeanAngle';
import { useGForce } from '@/hooks/useGForce';
import { useLiveOverlayRecorder } from '@/hooks/useLiveOverlayRecorder';
import { saveRideOverlayBlob } from '@/lib/overlayStore';
import { warmPilotVoice } from '@/lib/pilotVoice';

import { LeanAngleBar } from '@/components/LeanAngleBar';
import { GForceCircle } from '@/components/GForceCircle';
import { AlarmButton, setRescuePosition, startRescueSiren } from '@/features/alarm';
import { W3WAddress } from '@/components/W3WAddress';
import { supabase } from '@/integrations/supabase/client';
import { convoyChannel } from '@/lib/convoyChannel';
import { ConvoyMemberInfo, BadgeType } from '@/types/convoy';
import { GpsStatus, GForceSample } from '@/types/blacktop';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, PhoneOff, Phone, Map as MapIcon, Users, Crown, User, Signal, SignalLow, SignalMedium, SignalHigh, Pause, Play, VolumeX, Eye } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getMemberColorStyles } from '@/lib/memberColors';
import { useExperience, getExperience, termsFor } from '@/features/experience';
import { tr } from '@/lib/i18n';
import { metresText } from '@/lib/units';
import { ScreenOnGuard } from '@/features/ride/components/ScreenOnGuard';
import { PageTips } from '@/features/guide';

// Read at call time inside realtime handlers so wording never forces a resubscribe.
const liveTerms = () => termsFor(getExperience().vehicles);

// GPS Signal Indicator Component
/** A rider's sound as it arrives (or this phone's mic as it goes out): a bar that moves with a voice. */
function SoundBar({ level, label }: { level: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title={label}>
      <span className="sr-only">{label}</span>
      <span className="relative h-1 w-12 rounded-full bg-border/60 overflow-hidden" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-green-500 transition-[width] duration-300" style={{ width: `${Math.round(Math.max(0.04, level) * 100)}%` }} />
      </span>
    </span>
  );
}

function GpsIndicator({ gpsStatus }: { gpsStatus: GpsStatus }) {
  const timeSinceUpdate = gpsStatus.lastUpdate 
    ? Math.floor((Date.now() - gpsStatus.lastUpdate) / 1000)
    : null;
  
  const isStale = timeSinceUpdate !== null && timeSinceUpdate > 5;
  const accuracy = gpsStatus.accuracy;
  
  // Determine signal quality
  let SignalIcon = Signal;
  let signalColor = 'text-muted-foreground/50';
  let title = tr("Waiting for GPS...");
  
  if (gpsStatus.source !== 'none' && !isStale) {
    if (accuracy !== null && accuracy <= 10) {
      SignalIcon = SignalHigh;
      signalColor = 'text-emerald-400';
      title = tr("GPS: Excellent (±{0})", [metresText(accuracy)]);
    } else if (accuracy !== null && accuracy <= 30) {
      SignalIcon = SignalMedium;
      signalColor = 'text-accent';
      title = tr("GPS: Good (±{0})", [metresText(accuracy)]);
    } else if (accuracy !== null && accuracy <= 100) {
      SignalIcon = SignalLow;
      signalColor = 'text-yellow-400';
      title = tr("GPS: Fair (±{0})", [metresText(accuracy)]);
    } else {
      SignalIcon = SignalLow;
      signalColor = 'text-orange-400';
      title = accuracy ? tr("GPS: Weak (±{0})", [metresText(accuracy)]) : tr("GPS: Active");
    }
  } else if (isStale) {
    signalColor = 'text-destructive/70';
    title = tr("GPS signal lost");
  }
  
  return (
    <div className="flex items-center gap-1" title={title}>
      <SignalIcon className={cn("w-3.5 h-3.5 transition-colors", signalColor)} />
    </div>
  );
}

/**
 * A ride with no position records nothing, and the signal bars alone don't
 * say so. After a few seconds without a first fix, or once a fix has gone
 * stale, this says it in words (the screen redraws every second with the clock).
 */
function GpsNotice({ gpsStatus, startedAt }: { gpsStatus: GpsStatus; startedAt: string | null }) {
  const now = Date.now();
  const never = gpsStatus.lastUpdate === null;
  const sinceStart = startedAt ? (now - new Date(startedAt).getTime()) / 1000 : 0;
  const sinceFix = gpsStatus.lastUpdate ? (now - gpsStatus.lastUpdate) / 1000 : 0;
  if (never ? sinceStart < 8 : sinceFix < 20) return null;
  return (
    <p role="status" className="mx-auto mb-2 max-w-xs rounded-xl border border-destructive/50 bg-destructive/15 px-3 py-2 text-center text-xs font-medium leading-snug text-foreground">
      {never ? tr("No GPS yet. Speed and distance won't record until Blacktop can see your location: check it's allowed for this app.") : tr("GPS signal lost. Speed and distance are on hold until it comes back.")}
    </p>
  );
}

// Get color styles for a member based on their accent color
const getMemberStyles = (member: ConvoyMemberInfo) => {
  return getMemberColorStyles(member.accentColor);
};


/** Public Road Privacy: the G circle shows only the live dot. */
const NO_G_ENVELOPE: number[] = [];
const NO_G_MAX = { left: 0, right: 0, brake: 0, accel: 0 };
export default function ActiveRide() {
  const peaksHidden = usePeaksHidden();
  const navigate = useNavigate();
  const { rideState, endRide, setRidePaused, updateLeanAngle, updateGForce } = useActiveRide();
  // The radio plays across the whole app during a ride and stops when the ride ends, however
  // it ends (the floating button goes with it: lib resetRadio clears the loaded station).
  const stopRadio = resetRadio;
  const { convoy, resetNavigationStatus, endConvoyRide, setConvoyRealtimeSuspended, createConvoy, joinConvoy, leaveConvoy, setDestination: setConvoyDestination } = useConvoyState();
  // Only use voice channel for convoy rides with other members
  const voiceChannel = useVoiceChannel(rideState.isConvoyMode ? convoy.id ?? undefined : undefined, { priority: convoy.isLeader });
  const { isConnected, isMuted, speakingUsers, peerLinks, mutedUsers, peerSound, micSound, playBlocked, connect, disconnect, toggleMute, getAudioStreams } = voiceChannel;
  const { settings } = useSettings();
  const { terms, canLean, showGroup } = useExperience();
  // Riders who said they don't care about speed get distance as the hero number.
  const speedHero = settings.speedFocusEnabled;
  // The road's limit (lib/speedLimit): its sign by the speed, and the amber / red it sets when the rider has that on.
  const speedLimit = useSpeedLimit();
  const bands = speedBands(settings, speedLimit);
  // Lean angle only exists for vehicles that lean into corners.
  const leanOn = settings.leanAngleEnabled && canLean;
  const { activeBike } = useGarage();
  const { addRideRecording, setRideOverlayAvailable } = useRideHistory();
  const { user, profile } = useProfile();
  // Regroup calls from the convoy status bar (sent by the leader from the map).
  useRegroupListener(rideState.isConvoyMode ? convoy.id : null, user?.id ?? null);
  // Waves / emoji reactions from pillions (and anyone else in the convoy).
  useReactionsListener(rideState.isConvoyMode ? convoy.id : null, user?.id ?? null);

  // Nearby riders (opt-in, Blacktop map): pair up with riders close by, merge
  // convoys between leaders. Merge sync runs for every convoy rider so members
  // follow their leader through a merge/unmerge even if they haven't opted in.
  const proximityActions: ConvoyActions = {
    createConvoy,
    joinConvoy,
    leaveConvoy,
    attachRide: attachRideToConvoy,
    getConvoyId: () => getConvoySnapshot().id,
    announceMerge: (record, hostCode) => announceMergeToConvoy(record, hostCode, user?.id ?? ''),
  };
  const lastGps = rideState.gpsPoints.length > 0 ? rideState.gpsPoints[rideState.gpsPoints.length - 1] : null;
  const lastLat = lastGps?.lat;
  const lastLng = lastGps?.lng;
  const proximityPosition = useMemo(
    () => (lastLat != null && lastLng != null ? { lat: lastLat, lng: lastLng } : null),
    [lastLat, lastLng],
  );
  useProximity({
    enabled:
      settings.proximityEnabled &&
      profile.preferredNavApp === 'blacktop' &&
      rideState.isActive &&
      !!user?.id,
    userId: user?.id ?? null,
    name: profile.name,
    position: proximityPosition,
    speedMph: rideState.currentSpeed,
    convoy,
    actions: proximityActions,
  });
  useConvoyMergeSync({ convoy, userId: user?.id ?? null, actions: proximityActions });
  const wakeLock = useWakeLock();
  // Hazard and camera calls go out in the pilot voice; start it with the ride.
  useEffect(() => warmPilotVoice(), []);
  const { addWaypoint } = useWaypoints(convoy.id, convoy.isLeader);
  const nextWaypoint = useNextWaypoint();
  const soloRoute = useSoloRoute();

  const { 
    rescueRequests, 
    hasPendingRescue, 
    responders: rescueResponders,
    respondToRescue,
    sendRescueRequest, 
    acknowledgeRescue, 
    dismissRescue,
    cancelRescueRequest 
  } = useRescue(convoy.id, convoy.isLeader, user?.id || null, profile.name || null);
  // Where a rescue call went from, fixed when it's sent (for its what3words on the banner).
  const [rescueSpot, setRescueSpot] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!hasPendingRescue) {
      setRescueSpot(null);
      return;
    }
    const last = rideState.gpsPoints[rideState.gpsPoints.length - 1];
    if (last) setRescueSpot((s) => s ?? { lat: last.lat, lng: last.lng });
    // Only when a call goes out or ends, not on every fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingRescue]);

  // Keep audio session alive in background only when in convoy with other members
  useBackgroundAudio(rideState.isConvoyMode && isConnected && convoy.members.length > 1);
  
  // Lean angle sensor
  // 10Hz is enough for the gauge and matches the 10Hz lean recording; each update re-renders this screen.
  // Also runs for the G meter on bikes (cornering G comes from the lean), even with the lean gauge off.
  const leanSensorOn = canLean && (settings.leanAngleEnabled || settings.gForceEnabled);
  const leanAngle = useLeanAngle(leanSensorOn && rideState.isActive, 100);
  const leanForGRef = useRef<number | null>(null);
  leanForGRef.current = canLean && leanAngle.isSupported && leanAngle.permissionGranted ? leanAngle.currentLean : null;

  // G-force sensor - shared by the live gauge AND auto-rescue crash detection,
  // so there's a single devicemotion listener regardless of which feature(s) need it.
  // React state only updates while the G gauge is on (≈10Hz is plenty for a gauge); crash
  // detection reads each sample directly, so with only auto-rescue on the sensor never re-renders the screen.
  const crashSampleRef = useRef<(g: number) => void>(() => {});
  // Ground speed in m/s for the meter's cornering G (the ride's speed is in mph).
  const speedForGRef = useRef<number | null>(null);
  speedForGRef.current = rideState.isActive ? rideState.currentSpeed * 0.44704 : null;
  const gForce = useGForce(rideState.isActive && (settings.gForceEnabled || settings.autoRescueEnabled), {
    display: settings.gForceEnabled,
    displayIntervalMs: 100,
    leanRef: leanForGRef,
    speedRef: speedForGRef,
    initialVector: rideState.gEnvelope && rideState.gMax ? { envelope: rideState.gEnvelope, max: rideState.gMax } : undefined,
    initialMaxG: rideState.maxGForce,
    onSample: useCallback((g: number) => crashSampleRef.current(g), []),
  });

  // Check if ride has lean / G-force data for overlay
  const hasLeanData = leanOn && leanAngle.isSupported;
  const hasGForceData = settings.gForceEnabled && gForce.isSupported;

  // MapLibre-style problem: canvas color parsing can't resolve `hsl(var(--accent))`,
  // so resolve the literal HSL for the selected accent up front (see BlacktopMap.tsx).
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;
  const gaugeOn = settings.gForceEnabled && gForce.isSupported;
  // Low battery mid-ride: Thermal mode on until plugged in or the ride ends.
  useBatterySaver(rideState.isActive);
  // Opt-in: the radio voice reads out distance, time and average every few miles / km.
  useRideUpdates(rideState);
  // At speed the screen holds the way it is, so leaning the bike can't turn it.
  useRideOrientationLock(rideState.isActive, rideState.isPaused, rideState.currentSpeed);
  // Crew members can spectate an unlocked ride: every rider's phone sends theirs while someone watches.
  const spectators = useSpectateBroadcast(convoy.id ?? null, rideState.isActive, convoy.isLeader, () => {
    const pts = rideState.gpsPoints;
    const here = pts[pts.length - 1];
    if (!here) return null;
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    let heading: number | null = null;
    if (prev && rideState.currentSpeed > 3) {
      const r = Math.PI / 180;
      const y = Math.sin((here.lng - prev.lng) * r) * Math.cos(here.lat * r);
      const x = Math.cos(prev.lat * r) * Math.sin(here.lat * r) - Math.sin(prev.lat * r) * Math.cos(here.lat * r) * Math.cos((here.lng - prev.lng) * r);
      heading = (Math.atan2(y, x) / r + 360) % 360;
    }
    const leanLive = leanOn && leanAngle.isSupported;
    const gm = rideState.gMax ?? gForce.gMax;
    return {
      name: profile.name || '',
      vehicle: getExperience().vehicles[0] ?? 'motorcycle',
      lat: here.lat,
      lng: here.lng,
      heading,
      speed: rideState.currentSpeed,
      maxSpeed: peaksHidden ? null : rideState.maxSpeed,
      distance: rideState.distance,
      duration: rideState.duration,
      paused: rideState.isPaused,
      lean: leanLive ? Math.round(leanAngle.currentLean) : null,
      maxLean: leanLive && !peaksHidden ? Math.round(Math.max(rideState.maxLeanLeft, rideState.maxLeanRight)) : null,
      g: gaugeOn ? { lat: +gForce.lateralG.toFixed(2), lng: +gForce.longitudinalG.toFixed(2) } : null,
      maxG: gaugeOn && !peaksHidden && gm ? +Math.max(gm.left, gm.right, gm.brake, gm.accel).toFixed(2) : null,
      destination: rideTarget()?.name.split(',')[0].trim() ?? null,
      riders: Math.max(1, convoy.members.length),
      at: Date.now(),
      color: settings.accentColor,
    };
  });
  // Read when the ride has ended, from callbacks that may hold an older render.
  const endRef = useRef({ settings, riderName: profile.name || '' });
  endRef.current = { settings, riderName: profile.name || '' };
  // Where the ride was headed (for the safe-arrival text), where it ended (the parking question),
  // and the wrap-up card finished with.
  const [endTarget, setEndTarget] = useState<{ name: string } | null>(null);
  const [endSpot, setEndSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  // A new ride: the last parked spot is behind us.
  useEffect(() => {
    if (rideState.isActive) clearParkedSpot();
  }, [rideState.isActive]);

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
    shape: settings.overlayShape,
    background: settings.overlayBackdrop,
    // Convoy-only: mix the live voice channel into the recorded overlay audio.
    getVoiceStreams: rideState.isConvoyMode && settings.voiceRecordingEnabled ? getAudioStreams : undefined,
  });
  const overlayRecorderRef = useRef(overlayRecorder);
  overlayRecorderRef.current = overlayRecorder;
  
  // Pending overlay blob to save after ride ID is available
  const [pendingOverlayBlob, setPendingOverlayBlob] = useState<Blob | null>(null);
  
  // Orientation tracking (respects system rotation lock)
  const { orientation } = useOrientationLock();
  
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // The ride was paused for the first-time tips (not by the rider).
  const tipPaused = useRef(false);
  const tipTimer = useRef(0);
  const [tipsShelved, setTipsShelved] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [endingFlow, setEndingFlow] = useState(false);
  const [finalMembers, setFinalMembers] = useState<ConvoyMemberInfo[]>([]);
  const [savedRideId, setSavedRideId] = useState<string | null>(null);
  const [finalRideStats, setFinalRideStats] = useState<{ duration: number; distance: number; maxSpeed: number; averageSpeed: number; maxLean?: number; maxGForce?: number; gForceSamples?: GForceSample[]; gEnvelope?: number[]; gMax?: { left: number; right: number; brake: number; accel: number } } | null>(null);
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
  /** What the ride that just ended was (for its receipt's paper): a convoy ride, a trip's legs. */
  const wasConvoyRideRef = useRef(false);
  const savedLegRef = useRef<RideTripLeg | null>(null);
  const controlChannelRef = useRef<any>(null); // Control channel for ride commands from leader
  const rideStateRef = useRef(rideState); // Keep fresh ref for broadcast handler
  
  // Update ref on each render to avoid stale closures
  rideStateRef.current = rideState;

  // Trips (ride/lib/trips): setting off, the ride joins the trip picked for it (a saved route), or starts one
  // from a plan with stops on the way (the solo route's stops, or the convoy's waypoints still to do); each
  // leg is counted as the ride's own GPS reaches its end, said on screen and kept in Console's notifications.
  useEffect(() => {
    if (!rideState.isActive || !rideState.startedAt) return;
    const convoyPlan = rideState.isConvoyMode && convoy.destination;
    const stops = convoyPlan
      ? convoy.waypoints.filter((w) => !w.isCompleted).sort((a, b) => a.orderIndex - b.orderIndex).map((w) => ({ lat: w.lat, lng: w.lng, name: w.name, address: w.address }))
      : soloRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name ?? '', address: s.address }));
    // A twisty pick's bends only shape the way: never a leg of their own.
    const legStops = stops.filter((s) => !isTwistyLeg(s.name));
    const dest = convoyPlan ? convoy.destination : soloRoute.destination;
    const plan = dest
      ? {
          name: tr("Trip to {0}", [dest.name || tr("destination")]),
          points: [{ lat: NaN, lng: NaN, name: tr("Start") }, ...legStops, { lat: dest.lat, lng: dest.lng, name: dest.name ?? '', address: dest.address }],
          convoy: !!convoyPlan,
        }
      : null;
    const first = rideState.gpsPoints[0];
    armTripForRide(rideState.startedAt, plan, first ? { lat: first.lat, lng: first.lng } : null);
    return subscribeRawFixes((fix) => {
      const done = trackTripFix(fix.lat, fix.lng, fix.accuracy);
      if (!done) return;
      const title = done.finished ? tr("Trip finished") : tr("Leg {0} of {1} done", [done.leg, done.total]);
      toast.success(title, { description: done.name });
      notify({ kind: 'general', title, body: done.name });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideState.isActive, rideState.startedAt]);

  // The QR on a solo ride: a convoy of one, started now, told the ride is under way and where it's going, so
  // whoever scans it gets the route; the effect below makes it a convoy ride when they join.
  const openSoloRideToConvoy = useCallback(async (): Promise<string | null> => {
    if (convoy.isActive && convoy.code) return convoy.code;
    const made = await createConvoy();
    if (!made) return null;
    void supabase.from('convoys').update({ ride_started_at: new Date().toISOString() }).eq('id', made.id);
    const d = soloRoute.destination;
    if (d) void setConvoyDestination({ name: d.name ?? '', address: d.address ?? '', lat: d.lat, lng: d.lng });
    return made.code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoy.isActive, convoy.code, createConvoy, soloRoute.destination]);

  // A ride that set off alone from an unlocked lobby becomes a convoy ride the moment someone joins it: until
  // this, the leader's phone stayed a solo ride, so the member list, voice and the shared route never came on
  // and they couldn't see that anyone had joined.
  const others = convoy.members.length - 1;
  useEffect(() => {
    if (!rideState.isActive || rideState.isConvoyMode || !convoy.isActive || !convoy.id || others < 1) return;
    attachRideToConvoy(convoy.id);
    const joined = convoy.members.find((m) => m.userId !== user?.id);
    toast.success(joined?.name ? tr("{0} joined your ride", [joined.name]) : tr("A rider joined your ride"), {
      description: tr("You're riding as a convoy now: voice, the member list and the route are shared."),
    });
    // The members are read when the count changes; the list itself changes every few seconds with their positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideState.isActive, rideState.isConvoyMode, convoy.isActive, convoy.id, others]);

  // Backing out of Active Ride during a convoy returns the rider to the lobby
  // (not Home), so they can rejoin the running ride from there.
  useEffect(() => {
    if (!rideState.isConvoyMode || !convoy.isActive) return;
    window.history.pushState({ btRideGuard: true }, '');
    const onPop = () => {
      navigate('/lobby', { replace: true });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [rideState.isConvoyMode, convoy.isActive, navigate]);






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
          toast.error(tr("Failed to save overlay"));
        } finally {
          setPendingOverlayBlob(null);
        }
      })();
    }
  }, [savedRideId, pendingOverlayBlob, setRideOverlayAvailable]);

  // The ride is saved: show the wrap-up card when there's something on it, else go Home.
  const wrapUpText = settings.safeArrivalText && !!cleanPhone(settings.emergencyContactPhone ?? '');
  const wrapUpPark = settings.parkedSpotEnabled && !!endSpot;
  const showWrapUp = showSummary && !finishing && (wrapUpText || wrapUpPark);
  useEffect(() => {
    if (showSummary && savedRideId && !wrapUpText && !wrapUpPark) setFinishing(true);
  }, [showSummary, savedRideId, wrapUpText, wrapUpPark]);
  // Home once the overlay video (if any) is stored: the receipt flies into History there.
  useEffect(() => {
    if (!finishing || !savedRideId || pendingOverlayBlob) return;
    flyReceipt({
      rideId: savedRideId,
      members: finalMembers,
      currentUserId: user?.id,
      rideStats: finalRideStats || undefined,
      bikeName: activeBike?.name ?? null,
      bikePhoto: activeBike?.photos?.hero ?? null,
      gForceSamples: finalRideStats?.gForceSamples,
      convoy: !!wasConvoyRideRef.current,
      leg: savedLegRef.current,
    });
    setShowSummary(false);
    // Finished convoy lobbies are burned, so never route back into the lobby.
    navigate('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing, savedRideId, pendingOverlayBlob]);

  // Keep screen awake during active ride
  useEffect(() => {
    if (rideState.isActive) {
      wakeLock.request();
    }
    return () => {
      wakeLock.release();
    };
    // useWakeLock returns a new object each render; depending on it would release and re-take the lock every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // As above for wakeLock; setConvoyRealtimeSuspended is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideState.inactivityTimedOut, rideState.isActive]);

  // Request lean angle permission when ride starts (iOS requires user gesture)
  useEffect(() => {
    if (rideState.isActive && leanSensorOn && !leanAngle.permissionGranted) {
      leanAngle.requestPermission();
    }
    // Lists the fields it reads; the hook's return object is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideState.isActive, leanSensorOn, leanAngle.permissionGranted, leanAngle.requestPermission]);

  // Sync lean angle to ride state for recording
  useEffect(() => {
    if (rideState.isActive && leanOn && leanAngle.isSupported) {
      updateLeanAngle(leanAngle.currentLean);
    }
  }, [rideState.isActive, leanOn, leanAngle.isSupported, leanAngle.currentLean, leanAngle.maxLeanLeft, leanAngle.maxLeanRight, updateLeanAngle]);

  // Request G-force sensor permission when needed (iOS requires user gesture; falls
  // back to a request here if the Settings-time prompt was skipped/denied/reloaded)
  useEffect(() => {
    if (rideState.isActive && (settings.gForceEnabled || settings.autoRescueEnabled) && !gForce.permissionGranted) {
      gForce.requestPermission();
    }
    // Lists the fields it reads; the hook's return object is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideState.isActive, settings.gForceEnabled, settings.autoRescueEnabled, gForce.permissionGranted, gForce.requestPermission]);

  // Persist max G-force to ride state for recording (only when the gauge feature is enabled)
  useEffect(() => {
    if (rideState.isActive && settings.gForceEnabled && gForce.isSupported) {
      updateGForce(gForce.currentG, gForce.maxG, { envelope: gForce.envelope, max: gForce.gMax });
    }
    // Vector peaks can change while total G is unchanged (e.g. a steady turn).
    // Persist those snapshots too, so covering the ride with the map never
    // leaves the retained trace behind the live sensor.
  }, [rideState.isActive, settings.gForceEnabled, gForce.isSupported, gForce.currentG, gForce.maxG, gForce.envelope, gForce.gMax, updateGForce]);

  // Start overlay recording when ride starts, only when the rider uses overlay videos
  // (Settings / "Film & share"): it draws and encodes 1080p video for the whole ride,
  // and used to run on every ride even though nothing could download it.
  const overlayStartedRef = useRef(false);
  useEffect(() => {
    if (settings.rideOverlayEnabled && rideState.isActive && !rideState.isPaused && !overlayStartedRef.current) {
      console.log('[ActiveRide] Starting overlay recording');
      overlayRecorderRef.current.startRecording();
      overlayStartedRef.current = true;
    }
  }, [settings.rideOverlayEnabled, rideState.isActive, rideState.isPaused]);

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
        // Public Road Privacy: the video carries no maxima either ("--").
        maxSpeed: peaksHidden ? null : rideState.maxSpeed,
        distance: rideState.distance,
        duration: rideState.duration,
        leanAngle: rideState.currentLean,
        maxLean: peaksHidden ? null : Math.max(rideState.maxLeanLeft, rideState.maxLeanRight),
        gForce: gForce.currentG,
        gVector: settings.gForceEnabled
          ? { lateral: gForce.lateralG, longitudinal: gForce.longitudinalG, envelope: peaksHidden ? NO_G_ENVELOPE : rideState.gEnvelope ?? gForce.envelope, max: peaksHidden ? NO_G_MAX : rideState.gMax ?? gForce.gMax, hidePeaks: peaksHidden }
          : undefined,
        maxGForce: peaksHidden ? null : rideState.maxGForce,
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
  }, [rideState.isActive, rideState.isPaused, rideState.currentSpeed, rideState.maxSpeed, rideState.distance, rideState.duration, rideState.currentLean, rideState.maxLeanLeft, rideState.maxLeanRight, gForce.currentG, gForce.lateralG, gForce.longitudinalG, gForce.envelope, gForce.gMax, rideState.gEnvelope, rideState.gMax, settings.gForceEnabled, peaksHidden, rideState.maxGForce, rideState.gpsPoints, convoy.members, user?.id]);

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
    stopRadio();
    toast.info(tr("Leader ended the {0}", [liveTerms().ride]));
    
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
        gEnvelope: currentRideState.gEnvelope,
        gMax: currentRideState.gMax,
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
    const target = rideTarget();
    (async () => {
      wasConvoyRideRef.current = rideState.isConvoyMode;
      wasConvoyRideRef.current = rideState.isConvoyMode;
    const rideId = await endRide();
    savedLegRef.current = lastTripLeg() ?? null;
      savedLegRef.current = lastTripLeg() ?? null;
      if (rideId) afterRideSaved(rideId, target);
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
    const convoyIdNow = convoy.id;

    // Control channel for broadcasts (pause/resume/end-ride)
    const controlChannel = convoyChannel(`convoy-control:${convoy.id}`, { broadcast: { self: false } });

    controlChannel.on('broadcast', { event: 'end-ride' }, async () => {
      // Only when the ride really has ended: the leader writes ride_ended_at before saying so,
      // so a spoofed "end-ride" can't stop everyone's ride (and crash check with it).
      if (!convoyIdNow) return;
      const { data } = await supabase.from('convoys').select('ride_ended_at').eq('id', convoyIdNow).single();
      if (!data?.ride_ended_at) return;
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
    // Kill any radio playback the moment the rider ends the ride
    stopRadio();

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
        gEnvelope: rideState.gEnvelope,
        gMax: rideState.gMax,
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
        const broadcastChannel = convoyChannel(`convoy-control:${convoyId}`, { broadcast: { self: false } });

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
    const target = rideTarget();
    wasConvoyRideRef.current = rideState.isConvoyMode;
    const rideId = await endRide();
    savedLegRef.current = lastTripLeg() ?? null;
    if (rideId) afterRideSaved(rideId, target);
    clearMapDestination();
    clearSoloRoute();
    closeBlacktopMap();

    if (rideId) {
      flushSync(() => {
        setShowSummary(true);
      });
      setSavedRideId(rideId);
    } else {
      toast.info(tr("{0} too short, not saved", [terms.Ride]));
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
    } else if (convoyId && wasLeader && convoy.isActive) {
      // A ride that set off from an unlocked solo lobby and nobody joined: take it off the crew's list
      // and close it, or it would sit there open with nobody riding.
      cleanupPromises.push(
        Promise.resolve(supabase.from('convoys').update({ is_listed: false } as any).eq('id', convoyId)).then(() => leaveConvoy()),
      );
    }

    // Wait for cleanup but don't block UI
    Promise.all(cleanupPromises).catch(err => {
      console.warn('[ActiveRide] Cleanup error:', err);
    });
  };

  /** The rescue button was pressed: what to send if the rider answers No to "Are you okay?". */
  const [rescueAsk, setRescueAsk] = useState<null | (() => void | Promise<void>)>(null);
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
          toast.error(tr("Unable to get your location"));
        }
      );
    }
  };

  // Solo rescue call: Discord (when connected) plus a push to the rider's crew.
  // Returns who was told.
  const sendSoloRescue = useCallback(
    (lat: number, lng: number, auto = false): Promise<string[]> =>
      sendSoloRescueCall({ settings, discordEnabled, riderName: profile.name || '', lat, lng, auto }),
    [discordEnabled, profile.name, settings],
  );

  // ---- Auto-rescue (crash detection) ----
  const fireAutoRescue = useCallback(async () => {
    const gpsPoints = rideState.gpsPoints;
    const fire = async (lat: number, lng: number) => {
      // The crash screen shows this spot's what3words (when Blacktop has what3words).
      setRescuePosition({ lat, lng });
      if (rideState.isConvoyMode) {
        // Convoy: broadcast to every member (useRescue also pings Discord and pushes to the crew)
        await sendRescueRequest(lat, lng, { auto: true });
      } else {
        // Solo: Discord (if connected) and a push to the rider's crew
        const told = await sendSoloRescue(lat, lng, true);
        if (told.length) toast.success(tr("Auto-rescue sent to {0}", [told.join(' and ')]));
        else toast.warning(tr("Auto-rescue: nobody to alert"), { description: tr("Connect Discord in Settings, or ask your crew to turn on notifications.") });
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
  }, [rideState.gpsPoints, rideState.isConvoyMode, sendRescueRequest, sendSoloRescue]);

  crashSampleRef.current = useCrashDetection({
    enabled: settings.autoRescueEnabled && rideState.isActive && !rideState.isPaused && !crashPromptOpen && !autoRescueFiredRef.current,
    currentSpeed: rideState.currentSpeed,
    fixStamp: rideState.gpsStatus.lastUpdate,
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
      toast.error(tr("Failed to add rescue waypoint"));
    }
  };

  // After the ride: the wrap-up card (safe-arrival text, parked spot), then Home, where the receipt flies into History.
  if (showSummary) {
    if (!showWrapUp) return <div className="fixed inset-0 z-50 bg-background/95" />;
    return (
      <RideWrapUp
        riderName={profile.name || ''}
        distance={finalRideStats?.distance ?? 0}
        duration={finalRideStats?.duration ?? 0}
        targetName={endTarget?.name ?? null}
        endSpot={wrapUpPark ? endSpot : null}
        onContinue={() => setFinishing(true)}
      />
    );
  }

  if (!rideState.isActive && !endingFlow) return null;

  // The clock doesn't run while the rider is reading tips: paused for them, and set going again after (unless they'd paused it themselves).
  const onRideTipsShowing = (showing: boolean) => {
    window.clearTimeout(tipTimer.current);
    if (showing) {
      tipPaused.current = !rideState.isPaused;
      if (tipPaused.current) setRidePaused(true);
      // Left unread (the rider has set off with them up): put them away so the ride isn't left paused. They come back next ride.
      tipTimer.current = window.setTimeout(() => setTipsShelved(true), 45_000);
    } else if (tipPaused.current) {
      tipPaused.current = false;
      setRidePaused(false);
    }
  };

  // The rescue button: convoy members ping the convoy, solo riders their crew and Discord;
  // a convoy's leader has none. Beside the speed in landscape, its own row in portrait.
  const hasRescueButton = !rideState.isConvoyMode || !convoy.isLeader;
  const rescueButton = (
    <>
            {/* Rescue button - circular icon-only.
                Convoy: non-leaders ping the leader.
                Solo: pings user's Discord webhook when enabled.
                Kept in the controls row (not next to End Ride) to avoid
                accidental presses. */}
            {rideState.isConvoyMode && !convoy.isLeader && (
              <HoldRescueButton
                onHeld={() => {
                  if (!hasPendingRescue) setRescueAsk(() => handleRescue);
                }}
                onTap={hasPendingRescue ? () => void cancelRescueRequest() : undefined}
                dataTip="rescue"
                className={cn(
                  "h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl flex items-center justify-center transition-all touch-target bg-[hsl(var(--burn))] text-white hover:brightness-110 disabled:opacity-100",
                  hasPendingRescue && "animate-pulse ring-4 ring-[hsl(var(--burn)/0.4)]"
                )}
                title={hasPendingRescue ? tr("Cancel rescue request") : tr("Request rescue")}
              >
                <span aria-hidden className="text-2xl landscape:text-3xl font-black leading-none">R</span>
              </HoldRescueButton>
            )}
            {!rideState.isConvoyMode && (
              <HoldRescueButton
                onHeld={() => {
                  if (soloRescueSending || soloRescueSent) return;
                  // Asked first ("Are you okay?"); this is what a No sends.
                  setRescueAsk(() => async () => {
                  setSoloRescueSending(true);
                  try {
                    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                      navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 8000,
                        maximumAge: 5000,
                      });
                    });
                    const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    const told = await sendSoloRescue(at.lat, at.lng);
                    // The emergency contact by plain SMS, offered whatever the server managed.
                    const text = emergencyTextAction(settings, profile.name || '', at);
                    if (told.length) {
                      toast.success(tr("Rescue call sent to {0}", [told.join(' and ')]), { action: text, duration: text ? 15000 : undefined });
                      setSoloRescueSent(true);
                      setTimeout(() => setSoloRescueSent(false), 30000);
                    } else {
                      toast.error(tr("Nobody to alert yet"), {
                        description: tr("Connect Discord in Settings, or ask your crew to turn on notifications."),
                        action: text,
                        duration: text ? 15000 : undefined,
                      });
                    }
                  } catch (err) {
                    console.error('[SoloRescue]', err);
                    const text = emergencyTextAction(settings, profile.name || '', null);
                    toast.error(tr("Could not get your location"), { action: text, duration: text ? 15000 : undefined });
                  } finally {
                    setSoloRescueSending(false);
                  }
                  });
                }}
                disabled={soloRescueSending || soloRescueSent}
                dataTip="rescue"
                className={cn(
                  "h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl flex items-center justify-center transition-all touch-target bg-[hsl(var(--burn))] text-white hover:brightness-110 disabled:opacity-100",
                  soloRescueSent && "animate-pulse ring-4 ring-[hsl(var(--burn)/0.4)]"
                )}
                title={soloRescueSent ? tr("Rescue call sent") : soloRescueSending ? tr("Sending…") : tr("Call for rescue (your crew and Discord)")}
              >
                <span aria-hidden className="text-2xl landscape:text-3xl font-black leading-none">R</span>
              </HoldRescueButton>
            )}

    </>
  );

  // Sort members by top speed (highest first) if rankings enabled, otherwise by join time
  const sortedMembers = (settings.showSpeedRankings && settings.speedFocusEnabled) 
    ? [...convoy.members].sort((a, b) => (b.topSpeed ?? -1) - (a.topSpeed ?? -1)) // private (null) last
    : convoy.members;

  /**
   * Once a ride is saved: name it, and keep where it was going and where it
   * ended for the wrap-up card (the safe-arrival text and the parking question).
   */
  const afterRideSaved = (rideId: string, target: { name: string } | null) => {
    void autoNameRide(rideId, target);
    setEndTarget(target);
    const ride = storedRide(rideId);
    const last = ride?.gpsPoints?.[ride.gpsPoints.length - 1];
    if (endRef.current.settings.parkedSpotEnabled && last) setEndSpot({ lat: last.lat, lng: last.lng });
  };

  /** Where the ride was headed, if a route was set: names the ride ("To Brighton"). */
  const rideTarget = () => {
    const name = rideState.isConvoyMode ? convoy.destination?.name : soloRoute.destination?.name;
    return name ? { name } : null;
  };

  // The round dial: the G meter (when on), turning over to the mini map with a tap; the mini map alone without it.
  const rideDial = (
    <RideDial
      gauge={gaugeOn ? <GForceCircle lateral={gForce.lateralG} longitudinal={gForce.longitudinalG} envelope={peaksHidden ? NO_G_ENVELOPE : rideState.gEnvelope ?? gForce.envelope} max={peaksHidden ? NO_G_MAX : rideState.gMax ?? gForce.gMax} hidePeaks={peaksHidden} className="w-full" /> : null}
      position={lastGps ? { lat: lastGps.lat, lng: lastGps.lng } : null}
      members={convoy.members
        .filter((m) => m.userId !== user?.id && Number.isFinite(m.currentLat) && Number.isFinite(m.currentLng))
        .map((m) => ({ userId: m.userId, name: m.name, accentColor: m.accentColor, lat: m.currentLat as number, lng: m.currentLng as number }))}
      accent={accentColor}
      distanceUnit={settings.distanceUnit}
      rescueAt={rescueRequests.find((r) => r.userId !== user?.id) ?? null}
      convoyId={convoy.id}
      className="w-40 landscape:w-36"
    />
  );

  const endRideButton = (
    <div data-tip="end-ride" className="flex justify-center items-center min-h-[2.25rem] md:min-h-[2.5rem] min-w-[230px]">
      {!showEndConfirm ? (
        <Button
          onClick={() => setShowEndConfirm(true)}
          variant="outline"
          size="sm"
          className="h-12 px-5 text-sm font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <Square className="w-3.5 h-3.5 mr-1.5" />
          {rideState.isConvoyMode && convoy.isLeader ? tr("END CONVOY") : tr("END {0}", [terms.Ride.toUpperCase()])}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={handleEndRide}
            size="sm"
            className="h-12 px-5 text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {tr("END {0}", [terms.Ride.toUpperCase()])}
          </Button>
          <Button
            onClick={() => setShowEndConfirm(false)}
            variant="ghost"
            size="sm"
            className="h-12 px-5"
          >
            {tr("Cancel")}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn(
      "h-dvh max-h-dvh overflow-y-auto flex flex-col p-3 safe-top safe-bottom md:p-4 lg:p-6 transition-all duration-300",
      settings.carDisplayEnabled && orientation === 'landscape' && "car-display"
    )}>
      {/* Rescue Alerts (every convoy member) */}
      <RescueAlert
        requests={rescueRequests}
        isLeader={convoy.isLeader}
        onAddWaypoint={handleAddRescueWaypoint}
        onRespond={(request) => {
          // Tell the rider (and convoy) we're coming, then show the rescue route.
          void respondToRescue(request);
          openBlacktopMap();
        }}
        onDismiss={dismissRescue}
      />

      {/* Paused at a mapped fuel or charging station: its price, for the map's fuel prices. */}
      <FillUpPrompt
        paused={rideState.isPaused}
        rideMi={rideState.distance}
        at={rideState.gpsPoints.length ? { lat: rideState.gpsPoints[rideState.gpsPoints.length - 1].lat, lng: rideState.gpsPoints[rideState.gpsPoints.length - 1].lng } : null}
      />
      {/* Rider in distress: who's coming. Stays up until the rescue is closed. */}
      {hasPendingRescue && rideState.isConvoyMode && (
        <div className="fixed top-[calc(0.75rem+var(--safe-top))] left-1/2 -translate-x-1/2 z-40 w-[min(22rem,calc(100%-1.5rem))] rounded-2xl border border-[hsl(var(--burn))]/60 bg-[hsl(var(--burn))]/15 backdrop-blur-xl px-4 py-3 shadow-2xl animate-slide-down">
          <p className="text-sm font-semibold text-[hsl(var(--burn))]">{tr("Rescue request sent")}</p>
          <p className="text-xs text-foreground/85 mt-0.5">
            {rescueResponders.length === 0
              ? tr("Waiting for your convoy to respond…")
              : rescueResponders.length === 1 ? tr("{0} is on the way", [rescueResponders[0]]) : tr("{0} are on the way", [rescueResponders.join(', ')])}
          </p>
          {/* Where the call went from, in three words, to read out if you call the emergency services. */}
          {rescueSpot && <W3WAddress lat={rescueSpot.lat} lng={rescueSpot.lng} className="mt-1.5 text-sm items-start text-left" />}
          <EmergencyTextButton at={rescueSpot} className="mt-2 w-full" />
          <MedicalIdButton className="mt-2 w-full" />
        </div>
      )}

      {/* The rescue button asks first: it gets pressed by accident mid-ride. The same card as the crash check; no answer sends nothing. */}
      {rescueAsk && !crashPromptOpen && (
        <CrashCheckPrompt
          manual
          timeoutSec={20}
          onImFine={() => setRescueAsk(null)}
          onTimeout={() => setRescueAsk(null)}
          onSendNow={() => {
            const send = rescueAsk;
            setRescueAsk(null);
            void send();
          }}
        />
      )}

      {/* Auto-rescue crash check */}
      {crashPromptOpen && (
        <CrashCheckPrompt
          timeoutSec={AUTO_RESCUE_ACK_TIMEOUT_SEC}
          onImFine={() => {
            setCrashPromptOpen(false);
            toast.success(tr("Glad you’re okay. {0} on.", [terms.Ride]));
          }}
          onSendNow={async () => {
            setCrashPromptOpen(false);
            // Auto-rescue (never the manual rescue button) sounds the siren so people nearby notice.
            startRescueSiren();
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
            startRescueSiren();
            await fireAutoRescue();
            toast.error(tr("Auto-rescue sent - ending ride"), {
              description: tr("No response detected, so a rescue alert was sent and your ride was ended."),
            });
            await handleEndRide();
          }}
        />
      )}

      {/* Main content area - vertical in portrait, horizontal in landscape.
          Landscape: equal flex-1 flanks (stats left / g-force+buttons right) so the
          speed cluster sits dead-centre. */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-3 md:gap-4 landscape:gap-6 min-h-0 overflow-y-auto landscape:overflow-visible landscape:items-center">
        {/* Landscape Left: Big Stats List, then the dial (G meter / mini map) beside the live speed
            (mirroring the anti-theft alarm on the right). */}
        <div className="hidden landscape:flex flex-row items-center gap-4 flex-1 min-w-0 pl-2">
        <div className="flex flex-col justify-center items-start gap-7 min-w-0">
          {speedHero && (
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">{tr("Distance")}</p>
            <p data-ride-stat-value className="font-mono text-4xl lg:text-5xl font-bold truncate">
              {formatDistance(rideState.distance, settings.distanceUnit)}
              <span className="text-lg text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
            </p>
          </div>
          )}
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">{tr("Time")}</p>
            <p data-ride-stat-value className="font-mono text-4xl lg:text-5xl font-bold truncate">{formatDuration(rideState.duration)}</p>
          </div>
          {settings.speedFocusEnabled && (
          <div className="text-left">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-1">{tr("Max")}</p>
            <p data-ride-stat-value className="font-mono text-4xl lg:text-5xl font-bold truncate">
              {peaksHidden ? PEAK_HIDDEN : formatSpeed(rideState.maxSpeed, settings.speedUnit)}
              {!peaksHidden && <span className="text-lg text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>}
            </p>
          </div>
          )}
        </div>
        {/* Centred in the space between the stats and the speed: the space reaches on into
            the gap before the speed column (-mr-12), or on a phone the dial is wider than its
            share and sat over the stats, too far left. */}
        <div className="flex-1 min-w-0 -mr-12 flex flex-col items-center justify-center">{rideDial}</div>
        </div>

        {/* Speed and Stats - centre column in landscape (auto width, centred by equal flanks) */}
        <div className="flex-1 landscape:flex-none flex flex-col items-center justify-center animate-fade-in min-w-0 landscape:-translate-y-2">
          {/* Header - compact */}
          <div className="flex items-center gap-2 mb-2 landscape:mb-1 md:mb-4">
            {rideState.isConvoyMode && (
              <span className="flex items-center gap-1 text-accent text-xs font-medium px-2 py-0.5 bg-accent/10 rounded">
                <Users className="w-3 h-3" />
                {convoy.isLeader ? tr("LEADER") : tr("CONVOY")}
              </span>
            )}
            {/* The convoy's QR for everyone riding, beside the pill (above the number it ran into it). On a solo
                ride it makes the convoy first, and the ride turns into a convoy ride when someone joins. */}
            {(rideState.isConvoyMode ? !!convoy.code : showGroup) && (
              <ConvoyQrButton code={convoy.isActive ? convoy.code : null} getCode={rideState.isConvoyMode ? undefined : openSoloRideToConvoy} />
            )}
            {rideState.isPaused && (
              <span className="flex items-center gap-1 text-warning text-xs font-medium px-2 py-0.5 bg-warning/10 rounded animate-pulse">
                <Pause className="w-3 h-3" />
                {tr("PAUSED")}
              </span>
            )}
            {spectators.length > 0 && (
              <span className="flex items-center gap-1 text-accent text-xs font-medium px-2 py-0.5 bg-accent/10 rounded" title={tr("Crew members watching this ride")}>
                <Eye className="w-3 h-3" />
                {spectators.length}
              </span>
            )}
            <GpsIndicator gpsStatus={rideState.gpsStatus} />
          </div>
          {!rideState.isPaused && <GpsNotice gpsStatus={rideState.gpsStatus} startedAt={rideState.startedAt} />}
          <ScreenOnGuard active={rideState.isActive} paused={rideState.isPaused} lastFix={rideState.gpsStatus.lastUpdate} />
          {/* First-time tips, only at a standstill: they're put away the moment the rider moves. */}
          <PageTips
            page="ride"
            when={rideState.isActive && rideState.currentSpeed < 3 && !crashPromptOpen && !rescueAsk && !showEndConfirm && !tipsShelved}
            // The clock doesn't run while the rider is reading: paused for the tips, and set going again after (unless they'd paused it themselves).
            onShowing={onRideTipsShowing}
            tips={[
              { target: '[data-tip="rescue"]', text: tr("R calls for rescue. It sends your location to the people you chose in Settings: your convoy, your crew, Discord, riders nearby.") },
              { target: '[data-tip="alarm"]', text: tr("Stopping for fuel? This locks up with the anti-theft alarm. It pauses your ride until you unlock and press play.") },
              {
                target: '[data-tip="end-ride"]',
                text:
                  settings.distanceUnit === 'km'
                    ? tr("Ending takes two taps, so a glove can't do it by accident. Anything under a minute or under 150 metres isn't saved.")
                    : tr("Ending takes two taps, so a glove can't do it by accident. Anything under a minute or under 0.1 miles isn't saved."),
              },
            ]}
          />
          {/* The speed limit sign: its own set, once a sign is up. */}
          {speedHero && speedLimit && (
            <PageTips
              page="ride-speedlimit"
              onShowing={onRideTipsShowing}
              when={rideState.isActive && rideState.currentSpeed < 3 && !crashPromptOpen && !rescueAsk && !showEndConfirm && !tipsShelved}
              tips={[{ target: '[data-tip="speed-limit"]', text: settings.speedLimitColours !== false ? tr("The road's speed limit, from OpenStreetMap. Your speed turns amber over it and red at 10 % over. It can be out of date, so the signs on the road come first.") : tr("The road's speed limit, from OpenStreetMap. It can be out of date, so the signs on the road come first.") }]}
            />
          )}
          {/* Things a rider wouldn't find by themselves: a set of its own, so riders who saw the first one get these too. */}
          <PageTips
            page="ride-more"
            onShowing={onRideTipsShowing}
            when={rideState.isActive && rideState.currentSpeed < 3 && !crashPromptOpen && !rescueAsk && !showEndConfirm && !tipsShelved}
            tips={[
              {
                target: '[data-tip="ride-dial"]',
                text: gaugeOn
                  ? tr("Tap the dial to turn it between the G meter and a mini map. It stays on the one you leave showing.")
                  : tr("Your mini map. + and − zoom it, and the pill between them shows what's coming up."),
              },
              { target: '[data-tip="radio"]', text: tr("Tap the radio to play or pause. Hold it to pick a station.") },
            ]}
          />

          {/* Hero number - live speed for speed-focused riders, distance for everyone else */}
          <div className="text-center">
            <div className="inline-block relative">
            {/* The road's limit, like a sign beside the speed. */}
            {speedHero && speedLimit && (
              <SpeedLimitSign limit={speedLimit} unit={settings.speedUnit} size={52} className="absolute top-1 left-full ml-2 landscape:[@media(max-height:500px)]:scale-75 origin-top-left" />
            )}
            <div data-ride-speed className={cn(
              "font-mono font-black transition-all leading-none",
              speedHero
                ? "text-[8rem] [@media(max-height:820px)]:text-[6rem] [@media(max-height:700px)]:text-[5rem] md:text-[11rem] lg:text-[14rem] landscape:text-[7.5rem] landscape:[@media(max-height:500px)]:text-[5.5rem] landscape:[@media(max-height:420px)]:text-[4.5rem]"
                : "text-[6.5rem] [@media(max-height:820px)]:text-[5rem] [@media(max-height:700px)]:text-[4rem] md:text-[9rem] lg:text-[11rem] landscape:text-[6rem] landscape:[@media(max-height:500px)]:text-[4.5rem] landscape:[@media(max-height:420px)]:text-[3.75rem]",
              speedHero && rideState.currentSpeed >= bands.red && "text-destructive animate-speed-glow-red",
              speedHero && rideState.currentSpeed >= bands.amber &&
              rideState.currentSpeed < bands.red && "text-warning animate-speed-glow"
            )}>
              {speedHero ? formatSpeed(rideState.currentSpeed, settings.speedUnit) : formatDistance(rideState.distance, settings.distanceUnit)}
            </div>
            </div>
            <p className="text-muted-foreground text-base landscape:text-sm -mt-3">
              {speedHero ? getSpeedLabel(settings.speedUnit) : getDistanceLabel(settings.distanceUnit)}
            </p>
            
            {/* Lean Angle Bar + the dial (G meter / mini map) - portrait only */}
            <div className="landscape:hidden">
              {(
                <div className="mt-2 flex flex-col">
                  {leanOn && (
                    <div>
                      <LeanAngleBar 
                        currentLean={leanAngle.currentLean}
                        maxLean={Math.max(rideState.maxLeanLeft, rideState.maxLeanRight)}
                        hideMax={peaksHidden}
                        threshold={settings.leanAngleThreshold}
                        onReset={() => {
                          leanAngle.calibrate();
                          toast.success(tr("Lean sensor zeroed"), { duration: 1500 });
                        }}
                      />
                      {leanAngle.isCalibrated && (
                        <p className="text-[10px] text-muted-foreground/60 text-center mt-0.5">{tr("zeroed")}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex justify-center">{rideDial}</div>
                </div>
              )}
            </div>
          </div>

          {/* Lean Angle Bar - landscape only, centred below live speed */}
          {leanOn && (
            <div className="hidden landscape:flex flex-col items-center mt-1 scale-125 origin-top">
              <LeanAngleBar
                vertical
                currentLean={leanAngle.currentLean}
                maxLean={Math.max(rideState.maxLeanLeft, rideState.maxLeanRight)}
                        hideMax={peaksHidden}
                threshold={settings.leanAngleThreshold}
                onReset={() => {
                  leanAngle.calibrate();
                  toast.success(tr("Lean sensor zeroed"), { duration: 1500 });
                }}
              />
              {leanAngle.isCalibrated && (
                <p className="text-[10px] text-muted-foreground/60 text-center mt-0.5">{tr("zeroed")}</p>
              )}
            </div>
          )}

          {/* Stats Row - portrait only */}
          <div className="flex landscape:hidden gap-8 [@media(max-height:820px)]:gap-5 [@media(max-height:820px)]:mt-2 md:gap-14 mt-3 md:mt-5">
            {speedHero && (
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tr("Distance")}</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">
                {formatDistance(rideState.distance, settings.distanceUnit)}
                <span className="text-sm text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
              </p>
            </div>
            )}
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tr("Time")}</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">{formatDuration(rideState.duration)}</p>
            </div>
            {settings.speedFocusEnabled && (
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tr("Max")}</p>
              <p className="font-mono text-2xl [@media(max-height:820px)]:text-lg md:text-4xl font-bold truncate">
                {peaksHidden ? PEAK_HIDDEN : formatSpeed(rideState.maxSpeed, settings.speedUnit)}
                {!peaksHidden && <span className="text-sm text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>}
              </p>
            </div>
            )}
          </div>

          {/* End Ride Button - landscape only, pushed lower below the speed/lean cluster */}
          <div className="hidden landscape:flex mt-8 justify-center animate-slide-up">
            {endRideButton}
          </div>
        </div>

        {/* Right flank in landscape: the rescue button + buttons, pushed to the right edge.
            `contents` in portrait so children join the vertical flow unchanged. */}
        <div className="contents landscape:flex landscape:flex-row landscape:items-center landscape:justify-end landscape:gap-4 landscape:flex-1 landscape:min-w-0 landscape:max-h-full landscape:pr-2">
        {/* Landscape: the rescue button between speed and buttons, centred in that space. */}
        <div className="hidden landscape:flex flex-1 min-w-0 flex-col items-center justify-center">
          {rescueButton}
        </div>

        {/* Portrait: the rescue button on its own row, below the stats and just above
            the control buttons (landscape has it right of the live speed). */}
        {hasRescueButton && (
          <div className="flex landscape:hidden justify-center mt-4 [@media(max-height:820px)]:mt-2">
            {rescueButton}
          </div>
        )}

        {/* Controls - row in portrait, column in landscape */}
        <div className="flex flex-wrap landscape:flex-col landscape:flex-wrap-reverse items-center justify-center content-center gap-6 landscape:gap-3 [@media(max-height:420px)]:gap-2 px-2 mt-4 mb-4 landscape:mt-0 landscape:mb-0 landscape:max-h-full landscape:py-1">
          {/* Pause/Resume button (individual - all members) - circular icon-only */}
          <button
            onClick={() => {
              const nextPaused = !rideState.isPaused;
              setRidePaused(nextPaused);
              toast.info(nextPaused ? tr("{0} paused", [terms.Ride]) : tr("{0} resumed", [terms.Ride]));
            }}
            className={cn(
              "h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl flex items-center justify-center transition-all touch-target",
              rideState.isPaused
                ? "bg-accent/20 text-accent"
                : "bg-secondary hover:bg-muted text-muted-foreground"
            )}
            title={rideState.isPaused ? tr("Resume {0}", [terms.ride]) : tr("Pause {0}", [terms.ride])}
          >
            {rideState.isPaused ? (
              <Play className="w-7 h-7 landscape:w-8 landscape:h-8" />
            ) : (
              <Pause className="w-7 h-7 landscape:w-8 landscape:h-8" />
            )}
          </button>

          {/* The anti-theft alarm, in the row with the other controls (the rescue button has
              its own place beside the speed in landscape and its own row in portrait). */}
          <AlarmButton variant="ride" />

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

            className="h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl bg-secondary hover:bg-muted touch-target"
            title={tr("Open map with route")}
          >
            {/* The Button's own [&_svg]:size-4 would shrink it below its neighbours' icons. */}
            <MapIcon className="!w-7 !h-7 landscape:!w-8 landscape:!h-8" />
          </Button>

          {/* Blacktop Radio — tap to play/pause, hold for the station dial */}
          <RadioButton variant="ride" />


          {/* Voice Controls (Convoy Mode) */}
          {rideState.isConvoyMode && (
            <div className="flex landscape:flex-col items-center gap-2">
              {/* Voice disconnect/connect button */}
              <button
                onClick={async () => {
                  try {
                    // CRITICAL: Unlock iOS audio immediately on user gesture (fire-and-forget, never blocks)
                    unlockIOSAudio();

                    if (isConnected) {
                      disconnect();
                      toast.success(tr("Left voice channel"), { description: tr("Saving battery") });
                    } else {
                      const result = await connect();
                      if (result.success) {
                        toast.success(tr("Joined voice channel"), { description: tr("You're live. Tap the mic to mute.") });
                      } else {
                        toast.error(tr("Failed to join voice channel"), { description: result.error || tr("Check microphone permissions") });
                      }
                    }
                  } catch (e) {
                    console.error('[Voice] Button error', e);
                    toast.error(tr("Voice action failed"));
                  }
                }}
                className={cn(
                  "w-12 h-12 landscape:w-16 landscape:h-16 [@media(max-height:420px)]:w-12 [@media(max-height:420px)]:h-12 rounded-2xl flex items-center justify-center transition-all touch-target",
                  isConnected
                    ? "bg-destructive/20 hover:bg-destructive/30 text-destructive"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                )}
                title={isConnected ? tr("Leave voice channel (saves battery)") : tr("Join voice channel")}
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
                    "w-16 h-16 landscape:w-20 landscape:h-20 [@media(max-height:420px)]:w-14 [@media(max-height:420px)]:h-14 rounded-2xl flex items-center justify-center transition-all touch-target",
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
                "h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl touch-target",
                showMembers ? "bg-accent/20 text-accent" : "bg-secondary hover:bg-muted"
              )}
            >
              <Users className="w-7 h-7 landscape:w-8 landscape:h-8" />
            </Button>
          )}
        </div>
        </div>{/* end landscape right flank (G-Force + controls) */}

        {/* Convoy Members Panel — floating overlay so toggling it never
            shifts the control buttons (portrait: bottom sheet, landscape: right panel) */}
        {rideState.isConvoyMode && showMembers && (
          <>
            <div
              className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
              onClick={() => setShowMembers(false)}
              aria-hidden
            />
            <div className="fixed z-50 animate-slide-up left-3 right-3 bottom-3 max-h-[45dvh] safe-bottom landscape:left-auto landscape:right-[calc(0.75rem+var(--safe-right))] landscape:top-[calc(0.75rem+var(--safe-top))] landscape:bottom-3 landscape:w-56 md:landscape:w-64 landscape:max-h-none">
            <div className="bg-card border border-border rounded-xl p-2 md:p-3 h-full max-h-full flex flex-col shadow-lg">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {tr("Convoy (")}{convoy.members.length})
                <button
                  onClick={() => setShowMembers(false)}
                  className="glove-hit ml-auto text-muted-foreground hover:text-foreground px-1"
                  aria-label={tr("Close convoy members")}
                >
                  ✕
                </button>
              </h3>

              
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {sortedMembers.map((member, index) => {
                  const colorStyles = getMemberStyles(member);
                  const isSpeaking = speakingUsers.has(member.userId);
                  // Only say someone is audible when there's a real audio link to them.
                  const audioLink = isConnected && member.userId !== user?.id ? peerLinks[member.userId] : undefined;
                  
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
                        {isConnected && member.userId !== user?.id && audioLink !== 'connected' && (
                          <p className={cn('text-[10px] flex items-center gap-1', audioLink === 'failed' || !audioLink ? 'text-warning' : 'text-muted-foreground')}>
                            <VolumeX className="w-2.5 h-2.5" />
                            {audioLink === 'connecting' ? tr("Connecting audio…") : tr("No audio link")}
                          </p>
                        )}
                        {/* The sound check (useVoiceChannel): what's really arriving from them, and their mic state. */}
                        {isConnected && member.userId !== user?.id && audioLink === 'connected' && (
                          mutedUsers.has(member.userId) ? (
                            <p className="text-[10px] flex items-center gap-1 text-muted-foreground">
                              <MicOff className="w-2.5 h-2.5" />
                              {tr("Muted")}
                            </p>
                          ) : peerSound[member.userId]?.blocked ? (
                            <button type="button" onClick={playBlocked} className="text-[10px] flex items-center gap-1 text-warning underline">
                              <VolumeX className="w-2.5 h-2.5" />
                              {tr("Tap to hear them")}
                            </button>
                          ) : peerSound[member.userId] && !peerSound[member.userId].arriving ? (
                            <p className="text-[10px] flex items-center gap-1 text-warning">
                              <VolumeX className="w-2.5 h-2.5" />
                              {tr("No sound arriving")}
                            </p>
                          ) : peerSound[member.userId] ? (
                            <SoundBar level={peerSound[member.userId].level} label={tr("Their sound")} />
                          ) : null
                        )}
                        {isConnected && member.userId === user?.id && !isMuted && micSound && (
                          micSound.sending ? (
                            <SoundBar level={micSound.level} label={tr("Your mic")} />
                          ) : (
                            <p className="text-[10px] flex items-center gap-1 text-warning">
                              <MicOff className="w-2.5 h-2.5" />
                              {tr("Your mic isn't sending")}
                            </p>
                          )
                        )}
                        {(settings.showSpeedRankings && settings.speedFocusEnabled) && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatSpeed(member.currentSpeed || 0, settings.speedUnit)} {getSpeedLabel(settings.speedUnit)}
                          </p>
                        )}
                      </div>
                      
                      {/* Top speed badge - compact */}
                      {(settings.showSpeedRankings && settings.speedFocusEnabled) && (
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-xs font-bold" style={{ color: colorStyles.text }}>
                            {member.topSpeed == null ? PEAK_HIDDEN : formatSpeed(member.topSpeed, settings.speedUnit)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Crew members watching an unlocked ride: listed, never counted as riders. */}
                {spectators.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 p-1.5 rounded-lg border border-dashed border-border/50">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-accent/10">
                      <Eye className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{tr("Spectator")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </>
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
