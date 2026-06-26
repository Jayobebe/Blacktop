import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState, MAX_CONVOY_MEMBERS } from '@/features/convoy';
import { useActiveRide } from '@/features/ride';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';
import { AudioDeviceSelector } from '@/features/voice/components/AudioDeviceSelector';
import { LobbyChat } from '@/features/convoy/components/LobbyChat';
import { useWaypoints, WaypointList, DestinationSearch } from '@/features/waypoints';
import { useNavigation } from '@/hooks/useNavigation';
import { openBlacktopMap } from '@/features/map';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Copy, Check, LogOut, Mic, MicOff, Crown, User, Navigation, ArrowRightLeft, Play, MapPin, X, Plus, QrCode, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getMemberColorStyles } from '@/lib/memberColors';
import { ConvoyDestination } from '@/types/convoy';
import { QRCodeSVG } from 'qrcode.react';

interface UserLocation {
  lat: number;
  lng: number;
}

export default function Lobby() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy, setDestination, clearDestination, markAsNavigated, transferLeadership, allMembersNavigated, refreshConvoyState } = useConvoyState();
  const { startRide } = useActiveRide(convoy.id);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id);
  const { waypoints, addWaypoint, removeWaypoint, completeWaypoint, reorderWaypoints, nextWaypoint, completedCount, totalCount } = useWaypoints(convoy.id, convoy.isLeader);
  const { openNavigation } = useNavigation();
  const { settings } = useSettings();
  const { profile, user } = useProfile();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLeaderSelect, setShowLeaderSelect] = useState(false); // For leader leaving with other members
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [showAddWaypoint, setShowAddWaypoint] = useState(false);
  const [showAudioDevices, setShowAudioDevices] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const hasStartedRide = useRef(false);
  const prevReadyToStart = useRef<boolean | null>(null);
  const controlChannelRef = useRef<any>(null);
  const controlChannelSubscribed = useRef(false);
  const controlChannelReady = useRef<Promise<boolean> | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  // Keep latest callbacks stable for realtime subscriptions (prevents teardown/recreate on re-renders)
  const startRideRef = useRef(startRide);
  const navigateRef = useRef(navigate);
  const refreshConvoyStateRef = useRef(refreshConvoyState);

  useEffect(() => {
    startRideRef.current = startRide;
  }, [startRide]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    refreshConvoyStateRef.current = refreshConvoyState;
  }, [refreshConvoyState]);

  // Fetch user location on mount (available for all members, not just leaders)
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          // Get country code for better search results
          try {
            const { data } = await supabase.functions.invoke('place-search', {
              body: { kind: 'reverse', lat: loc.lat, lon: loc.lng, zoom: 3 },
            });
            if (data?.address?.country_code) {
              setCountryCode(data.address.country_code.toUpperCase());
            }
          } catch {
            // Ignore errors
          }
        },
        (error) => {
          console.warn('[Lobby] Could not get location:', error.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  // Reset ride started flag ONLY when destination is cleared (new ride cycle)
  useEffect(() => {
    if (!convoy.destination) {
      hasStartedRide.current = false;
    }
  }, [convoy.destination]);

  // Cleanup voice channel when leaving lobby (no auto-connect - users must explicitly join)
  useEffect(() => {
    if (!convoy.id) return;
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [convoy.id, isConnected, disconnect]);

  // Convoy control channel (e.g., leader start-for-all)
  useEffect(() => {
    if (!convoy.id) return;

    // One-time promise we can await before sending broadcasts (prevents "send before subscribed")
    let settled = false;
    let resolveReady: (ready: boolean) => void = () => {};
    controlChannelReady.current = new Promise<boolean>((resolve) => {
      resolveReady = resolve;
    });
    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      resolveReady(ready);
    };

    const channel = supabase.channel(`convoy-control:${convoy.id}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'start-ride' }, async () => {
      if (hasStartedRide.current) return;
      // Verify against DB that the ride actually started — prevents a rogue member
      // from forcing followers into ride mode via a spoofed broadcast.
      const { data } = await supabase
        .from('convoys')
        .select('ride_started_at')
        .eq('id', convoy.id)
        .single();
      if (!data?.ride_started_at) return;
      const age = Date.now() - new Date(data.ride_started_at).getTime();
      if (age > 30000) return;
      hasStartedRide.current = true;
      console.log('[Lobby] Received start-ride broadcast');
      toast.success('Leader started the ride');
      const success = startRideRef.current(true, convoy.id);
      if (success) {
        navigateRef.current('/ride');
      }
    });

    // Listen for leadership change broadcast
    channel.on('broadcast', { event: 'leadership-changed' }, async (payload: any) => {
      console.log('[Lobby] Leadership changed:', payload);
      await refreshConvoyStateRef.current();
      toast.info('Leadership has been transferred');
    });

    channel.subscribe((status) => {
      console.log('[Lobby] Control channel status:', status);

      if (status === 'SUBSCRIBED') {
        controlChannelSubscribed.current = true;
        settle(true);
        console.log('[Lobby] Subscribed to convoy control channel');
        return;
      }

      // Treat terminal states as not-ready
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        controlChannelSubscribed.current = false;
        settle(false);
        return;
      }

      controlChannelSubscribed.current = false;
    });

    controlChannelRef.current = channel;

    return () => {
      controlChannelSubscribed.current = false;
      settle(false);
      controlChannelReady.current = null;
      supabase.removeChannel(channel);
      controlChannelRef.current = null;
    };
  }, [convoy.id]);

  // Database fallback: listen for ride_started_at changes on the convoy (backup for broadcast)
  useEffect(() => {
    if (!convoy.id || convoy.isLeader) return; // Only followers need this fallback

    const channel = supabase
      .channel(`convoy-start-fallback:${convoy.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'convoys',
          filter: `id=eq.${convoy.id}`,
        },
        (payload: any) => {
          const newRow = payload.new;
          // If ride_started_at is set and we haven't started, start now
          if (newRow?.ride_started_at && !hasStartedRide.current) {
            // Check recency to avoid stale triggers (must be within last 30 seconds)
            const startedAt = new Date(newRow.ride_started_at).getTime();
            const now = Date.now();
            if (now - startedAt > 30000) {
              console.log('[Lobby] Ignoring stale ride_started_at:', newRow.ride_started_at);
              return;
            }
            console.log('[Lobby] Detected ride_started_at via DB fallback');
            hasStartedRide.current = true;
            toast.success('Leader started the ride');
            const success = startRideRef.current(true, convoy.id);
            if (success) {
              navigateRef.current('/ride');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convoy.id, convoy.isLeader]);

  // Redirect if not in a convoy
  useEffect(() => {
    if (!convoy.isRestoring && !convoy.isActive) {
      navigate('/');
    }
  }, [convoy.isActive, convoy.isRestoring, navigate]);

  // Auto-hide QR overlay after 15 seconds
  useEffect(() => {
    if (!showQR) return;
    const timer = setTimeout(() => setShowQR(false), 15000);
    return () => clearTimeout(timer);
  }, [showQR]);

  // Auto-start ride when the "ready to start" state flips from false -> true
  useEffect(() => {
    const readyToStart = Boolean(convoy.destination) && allMembersNavigated;

    console.log('[Lobby] Checking auto-start:', {
      allMembersNavigated,
      hasDestination: !!convoy.destination,
      readyToStart,
      prevReadyToStart: prevReadyToStart.current,
      hasStarted: hasStartedRide.current,
      members: convoy.members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated }))
    });

    // Don't auto-start from the initial lobby render; only when state changes to ready.
    if (prevReadyToStart.current === null) {
      prevReadyToStart.current = readyToStart;
      return;
    }

    // Only start on the rising edge (prevents immediate re-trigger when returning to lobby)
    if (readyToStart && !prevReadyToStart.current && !hasStartedRide.current) {
      hasStartedRide.current = true;
      console.log('[Lobby] All members ready, starting ride!');
      toast.success('All members ready - starting ride!');
      const success = startRide(true, convoy.id);
      if (success) {
        navigate('/ride');
      }
    }

    prevReadyToStart.current = readyToStart;
  }, [allMembersNavigated, convoy.destination, convoy.members, startRide, navigate, convoy.id]);

  const waitForControlChannel = async (timeoutMs = 1500) => {
    if (controlChannelSubscribed.current) return true;
    const p = controlChannelReady.current;
    if (!p) return false;

    return await Promise.race([
      p,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  };

  const sendStartRideBroadcast = async () => {
    // Database fallback: set ride_started_at so followers detect it even if broadcast is missed
    if (convoy.id) {
      const { error } = await supabase
        .from('convoys')
        .update({ ride_started_at: new Date().toISOString() })
        .eq('id', convoy.id);
      if (error) {
        console.warn('[Lobby] Failed to set ride_started_at:', error.message);
      } else {
        console.log('[Lobby] Set ride_started_at in database');
      }
    }

    const sendTwice = async (ch: any) => {
      const at = Date.now();
      const result1 = await ch.send({
        type: 'broadcast',
        event: 'start-ride',
        payload: { at },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const result2 = await ch.send({
        type: 'broadcast',
        event: 'start-ride',
        payload: { at, retry: true },
      });
      console.log('[Lobby] start-ride broadcast results:', { result1, result2 });
    };

    // First try: existing channel
    try {
      const ready = await waitForControlChannel();
      if (controlChannelRef.current && ready) {
        await sendTwice(controlChannelRef.current);
        return true;
      }
    } catch (e) {
      console.warn('[Lobby] start-ride send via existing channel failed, trying fallback', e);
    }

    // Fallback: temporary sender channel on the same topic (survives Lobby unmount timing)
    if (!convoy.id) return false;

    const temp = supabase.channel(`convoy-control:${convoy.id}`, {
      config: { broadcast: { self: true } },
    });

    const tempReady = await new Promise<boolean>((resolve) => {
      const t = window.setTimeout(() => resolve(false), 1500);
      temp.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(t);
          resolve(true);
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          window.clearTimeout(t);
          resolve(false);
        }
      });
    });

    try {
      if (tempReady) {
        await sendTwice(temp);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      supabase.removeChannel(temp);
    }

    return true; // DB fallback was set regardless of broadcast success
  };

  const handleCopyCode = async () => {
    if (!convoy.code) return;
    try {
      await navigator.clipboard.writeText(convoy.code);
      setCopied(true);
      toast.success('Code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleLeave = async () => {
    // If leader with other members, handle leadership transfer
    if (convoy.isLeader && convoy.members.length > 1) {
      // If exactly 2 members, auto-transfer to the other member
      if (convoy.members.length === 2) {
        const otherMember = convoy.members.find(m => !m.isLeader);
        if (otherMember) {
          await handleTransferAndLeave(otherMember.userId);
          return;
        }
      }
      // More than 2 members - show selection UI
      setShowLeaderSelect(true);
      setShowLeaveConfirm(false);
      return;
    }
    
    if (isConnected) {
      disconnect();
    }
    await leaveConvoy();
    navigate('/');
  };

  // Transfer leadership and then leave
  const handleTransferAndLeave = async (newLeaderUserId: string) => {
    const success = await transferLeadership(newLeaderUserId);
    if (success) {
      setShowLeaderSelect(false);
      if (isConnected) {
        disconnect();
      }
      // Pass true to skip deactivation since we just transferred leadership
      await leaveConvoy(true);
      navigate('/');
    }
  };

  const handleTransferLeadership = async (userId: string) => {
    const success = await transferLeadership(userId);
    if (success) {
      setTransferTarget(null);
    }
  };

  // Sort members: leader first, then by join time
  const sortedMembers = [...convoy.members].sort((a, b) => {
    if (a.isLeader) return -1;
    if (b.isLeader) return 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  // Get color styles for a member based on their accent color
  const getMemberStyles = (member: typeof sortedMembers[0]) => {
    return getMemberColorStyles(member.accentColor);
  };

  if (convoy.isRestoring || !convoy.isActive) return null;

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
      {/* Header with Code */}
      <header className="mb-3 landscape:mb-2 md:mb-4 animate-fade-in flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 landscape:hidden">Convoy Code</p>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-3 bg-card/50 border border-border/30 rounded-2xl px-4 py-2 hover:bg-secondary transition-colors"
            >
              <span className="font-mono text-2xl landscape:text-xl md:text-3xl font-bold tracking-[0.15em]">{convoy.code}</span>
              {copied ? (
                <Check className="w-5 h-5 text-accent" />
              ) : (
                <Copy className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </div>
          {/* QR Code Button - tap to show for 15s */}
          <button
            onClick={() => setShowQR(true)}
            className="p-2 bg-card/50 border border-border/30 rounded-xl hover:bg-secondary transition-colors select-none"
          >
            <QrCode className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>
        
        {/* Voice Toggle + Audio Device Picker */}
        <div className="flex items-center gap-2">
          {/* Audio Device Picker Button */}
          <button
            onClick={() => setShowAudioDevices(true)}
            className="p-2 bg-card/50 border border-border/30 rounded-xl hover:bg-secondary transition-colors"
            title="Select audio device"
          >
            <Headphones className="w-5 h-5 text-muted-foreground" />
          </button>
          
          {/* Voice Toggle */}
          <button
            onClick={async () => {
              try {
                // CRITICAL: Unlock iOS audio immediately on user gesture (fire-and-forget, never blocks)
                unlockIOSAudio();

                if (!isConnected) {
                  const result = await connect();
                  if (!result.success) {
                    toast.error('Failed to join voice', { description: result.error || 'Check microphone permission' });
                    return;
                  }
                  toast.success('Joined voice channel', { description: 'Tap again to unmute' });
                  return;
                }
                toggleMute();
              } catch (e) {
                console.error('[Lobby] Voice toggle error', e);
                toast.error('Voice action failed');
              }
            }}
            className={cn(
              "w-12 h-12 landscape:w-10 landscape:h-10 md:w-14 md:h-14 rounded-2xl flex items-center justify-center transition-all touch-target",
              !isMuted
                ? "bg-ptt-active shadow-glow"
                : isConnected
                  ? "bg-accent/20 border border-accent/50 hover:bg-accent/30"
                  : "bg-card/50 border border-border/30 hover:bg-secondary"
            )}
          >
            {!isConnected ? (
              <MicOff className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
            ) : isMuted ? (
              <MicOff className="w-4 h-4 md:w-5 md:h-5 text-accent" />
            ) : (
              <Mic className="w-4 h-4 md:w-5 md:h-5 text-background" />
            )}
          </button>
        </div>
      </header>

      {/* Audio Device Selector Overlay */}
      {showAudioDevices && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setShowAudioDevices(false)}
        >
          <div 
            className="bg-card border border-border/50 rounded-2xl p-4 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">Voice Chat Audio</h3>
              </div>
              <button
                onClick={() => setShowAudioDevices(false)}
                className="p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <AudioDeviceSelector compact />
            <Button
              onClick={() => setShowAudioDevices(false)}
              className="w-full mt-4"
              size="sm"
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* QR Code Overlay - tap to dismiss or auto-hide after 15s */}
      {showQR && convoy.code && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowQR(false)}
        >
          <div className="bg-white p-6 rounded-3xl shadow-2xl">
            <QRCodeSVG
              value={convoy.code}
              size={220}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col landscape:flex-row gap-3 md:gap-4 min-h-0 overflow-hidden">
        {/* Destination & Waypoints */}
        <div className="flex-1 flex flex-col animate-slide-up relative z-50 min-w-0 overflow-hidden">
          {/* Waypoints List */}
          <WaypointList
            waypoints={waypoints}
            isLeader={convoy.isLeader}
            onComplete={completeWaypoint}
            onRemove={removeWaypoint}
            onReorder={reorderWaypoints}
            completedCount={completedCount}
            totalCount={totalCount}
          />

          {/* Add Waypoint / Current Destination */}
          {showAddWaypoint ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Add Stop</p>
                <button
                  onClick={() => setShowAddWaypoint(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <DestinationSearch
                destination={null}
                onSetDestination={async (dest: ConvoyDestination) => {
                  await addWaypoint({
                    name: dest.name,
                    address: dest.address,
                    lat: dest.lat,
                    lng: dest.lng,
                  });
                  setShowAddWaypoint(false);
                }}
                onClearDestination={() => {}}
                onNavigate={() => {}}
                isLeader={convoy.isLeader}
                userLocation={userLocation}
                countryCode={countryCode}
                distanceUnit={settings.distanceUnit}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {nextWaypoint ? 'Next Stop' : 'Destination'}
                </p>
                {convoy.isLeader && (
                  <button
                    onClick={() => setShowAddWaypoint(true)}
                    className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80"
                  >
                    <Plus className="w-3 h-3" />
                    Add Stop
                  </button>
                )}
              </div>
              
              {nextWaypoint ? (
                <div className="bg-card/50 border border-accent/30 rounded-2xl p-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{nextWaypoint.name}</p>
                      {nextWaypoint.address && (
                        <p className="text-xs text-muted-foreground truncate">{nextWaypoint.address}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      openNavigation(nextWaypoint.lat, nextWaypoint.lng, nextWaypoint.name);
                      markAsNavigated();
                      // Start the ride, route to /ride so the active-ride
                      // screen is mounted underneath, then (next microtask)
                      // surface the map overlay on top. Closing the overlay
                      // drops the rider straight onto /ride.
                      if (!hasStartedRide.current) {
                        hasStartedRide.current = true;
                        const success = startRide(true, convoy.id);
                        if (success) navigate('/ride');
                      }
                      queueMicrotask(() => {
                        openBlacktopMap({
                          lat: nextWaypoint.lat,
                          lng: nextWaypoint.lng,
                          name: nextWaypoint.name,
                          address: nextWaypoint.address,
                        });
                      });
                    }}
                    className="w-full mt-3 h-11 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl font-semibold"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Navigate
                  </Button>
                </div>
              ) : (
                <DestinationSearch
                  destination={convoy.destination}
                  onSetDestination={setDestination}
                  onClearDestination={clearDestination}
                  onNavigate={() => {
                    markAsNavigated();
                    if (!hasStartedRide.current) {
                      hasStartedRide.current = true;
                      const success = startRide(true, convoy.id);
                      if (success) navigate('/ride');
                    }
                    queueMicrotask(() => {
                      if (convoy.destination) {
                        openBlacktopMap({
                          lat: convoy.destination.lat,
                          lng: convoy.destination.lng,
                          name: convoy.destination.name,
                          address: convoy.destination.address,
                        });
                      } else {
                        openBlacktopMap();
                      }
                    });
                  }}
                  isLeader={convoy.isLeader}
                  userLocation={userLocation}
                  countryCode={countryCode}
                  distanceUnit={settings.distanceUnit}
                />
              )}
            </div>
          )}
          
          {/* Status message */}
          {(convoy.destination || nextWaypoint) && (
            <div className="mt-2 animate-fade-in">
              <p className="text-xs text-muted-foreground">
                {allMembersNavigated 
                  ? 'All members ready!'
                  : `Waiting (${convoy.members.filter(m => m.hasNavigated).length}/${convoy.members.length})`
                }
              </p>
            </div>
          )}
        </div>

        {/* Lobby Chat */}
        {convoy.id && user?.id && (
          <div className="flex-1 min-h-[120px] max-h-[200px] landscape:max-h-none animate-slide-up delay-75">
            <LobbyChat
              convoyId={convoy.id}
              userId={user.id}
              userName={profile.name || 'Driver'}
              members={convoy.members.map(m => ({ userId: m.userId, accentColor: m.accentColor }))}
            />
          </div>
        )}

        {/* Members List */}
        <div className="landscape:w-52 md:landscape:w-60 animate-slide-up delay-100 relative z-0 flex flex-col min-h-0 max-h-[35vh] landscape:max-h-none">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Members ({convoy.members.length}/{MAX_CONVOY_MEMBERS})
            </h2>
          </div>
          
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1">
            {sortedMembers.map((member, index) => {
              const colorStyles = getMemberStyles(member);
              const isTransferring = transferTarget === member.userId;
              const isSpeaking = speakingUsers.has(member.userId);
              
              return (
                <div
                  key={member.id}
                  className={cn(
                    "flex items-center gap-2 bg-card border rounded-lg p-1.5 animate-slide-up transition-all",
                    isSpeaking && "ring-1 ring-offset-1 ring-offset-background"
                  )}
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    borderColor: colorStyles.border,
                    ...(isSpeaking ? { '--tw-ring-color': colorStyles.ring } as React.CSSProperties : {})
                  }}
                >
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
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs truncate" style={{ color: colorStyles.text }}>{member.name}</p>
                  </div>
                  
                  {/* Transfer leadership button */}
                  {convoy.isLeader && !member.isLeader && sortedMembers.length > 1 && !isTransferring && (
                    <button
                      onClick={() => setTransferTarget(member.userId)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}

                  {isTransferring && (
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => handleTransferLeadership(member.userId)}>
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground" onClick={() => setTransferTarget(null)}>
                        ✕
                      </Button>
                    </div>
                  )}
                  
                  {/* Navigation status */}
                  {!isTransferring && (
                    member.hasNavigated ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        <Navigation className="w-2.5 h-2.5" />
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                        Wait
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons - compact */}
      <div className="mt-2 md:mt-3 animate-slide-up delay-300 flex items-center justify-between">
        {/* Leave button / Leader selection */}
        {showLeaderSelect ? (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <p className="text-xs text-muted-foreground">Select new leader before leaving:</p>
            <div className="flex flex-wrap gap-2">
              {convoy.members.filter(m => !m.isLeader).map(member => {
                const colorStyles = getMemberColorStyles(member.accentColor);
                return (
                  <Button
                    key={member.userId}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    style={{ borderColor: colorStyles.border, color: colorStyles.text }}
                    onClick={() => handleTransferAndLeave(member.userId)}
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    {member.name}
                  </Button>
                );
              })}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs text-muted-foreground"
                onClick={() => setShowLeaderSelect(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : !showLeaveConfirm ? (
          <Button
            onClick={() => setShowLeaveConfirm(true)}
            variant="outline"
            size="sm"
            className="h-9 px-4 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Leave
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleLeave}
              size="sm"
              className="h-9 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Confirm
            </Button>
            <Button
              onClick={() => setShowLeaveConfirm(false)}
              variant="ghost"
              size="sm"
              className="h-9"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Start Ride button - tap for individual start, long-press (leader only) for all */}
        {!showLeaveConfirm && (
          <Button
            onClick={() => {
              // If a long-press fired, ignore the subsequent click
              if (didLongPressRef.current) {
                didLongPressRef.current = false;
                return;
              }

              // Individual start - just this member
              hasStartedRide.current = true;
              const success = startRide(true, convoy.id);
              if (success) {
                navigate('/ride');
              }
            }}
            onContextMenu={async (e) => {
              e.preventDefault();
              // Desktop long-press (right-click) - leader starts for all
              if (!convoy.isLeader) return;

              hasStartedRide.current = true;
              const success = startRide(true, convoy.id);
              if (success) {
                toast.success('Starting ride for all members');

                const sent = await sendStartRideBroadcast();
                if (!sent) {
                  toast.error('Could not signal other members', { description: 'They can still tap Start Ride.' });
                }

                // Give followers a moment to receive before we leave the lobby
                await new Promise((resolve) => setTimeout(resolve, 600));
                navigate('/ride');
              }
            }}
            onTouchStart={() => {
              didLongPressRef.current = false;

              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
              }

              longPressTimerRef.current = window.setTimeout(async () => {
                if (!convoy.isLeader) return;

                didLongPressRef.current = true;
                hasStartedRide.current = true;

                const success = startRide(true, convoy.id);
                if (success) {
                  toast.success('Starting ride for all members');

                  const sent = await sendStartRideBroadcast();
                  if (!sent) {
                    toast.error('Could not signal other members', { description: 'They can still tap Start Ride.' });
                  }

                  // Give followers a moment to receive before we leave the lobby
                  await new Promise((resolve) => setTimeout(resolve, 600));
                  navigate('/ride');
                }
              }, 500);
            }}
            onTouchEnd={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onTouchMove={() => {
              // Cancel long press if finger moves
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            size="sm"
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            title={convoy.isLeader ? 'Tap to start your ride, hold to start for all' : 'Start your ride'}
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Start Ride
          </Button>
        )}
      </div>
    </div>
  );
}
