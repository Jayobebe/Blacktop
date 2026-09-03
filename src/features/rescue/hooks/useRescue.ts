import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { announceRescueToDiscord } from '@/features/integrations/discord';
import { setRescueTarget, clearRescueTarget, registerRescueControls, clearRescueControls } from '../lib/rescueBridge';

export interface RescueRequest {
  id: string;
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  timestamp: number;
}

// Minimum gap between rescue requests from the same device. Prevents a member
// from hammering the leader's alert panel and Discord webhook by repeatedly
// tapping the rescue button or via a script.
const RESCUE_COOLDOWN_MS = 30_000; // 30 seconds

export function useRescue(convoyId: string | null, isLeader: boolean, userId: string | null, userName: string | null) {
  const [rescueRequests, setRescueRequests] = useState<RescueRequest[]>([]);
  const [hasPendingRescue, setHasPendingRescue] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastRescueSentAtRef = useRef<number>(0);

  useEffect(() => {
    if (!convoyId) return;

    const channel = supabase.channel(`rescue-${convoyId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'rescue_request' }, async (payload) => {
        const request = payload.payload as RescueRequest;

        // Everyone in the convoy gets the rescue location so the Blacktop map
        // can draw a secondary (glowing orange) rescue route on top of the
        // existing route/waypoints.
        setRescueTarget({
          userId: request.userId,
          userName: request.userName,
          lat: request.lat,
          lng: request.lng,
        });

        if (isLeader) {
          // Verify sender is actually in this convoy before surfacing the alert.
          // Realtime broadcast channels are open to any authenticated user who knows
          // the channel name, so we must check membership server-side.
          const { data: member } = await supabase
            .from('convoy_members')
            .select('user_id')
            .eq('convoy_id', convoyId)
            .eq('user_id', request.userId)
            .maybeSingle();
          if (!member) return;

          setRescueRequests(prev => {
            // Avoid duplicates
            if (prev.some(r => r.userId === request.userId)) {
              return prev.map(r => r.userId === request.userId ? request : r);
            }
            return [...prev, request];
          });
          toast.warning(`${request.userName} needs rescue!`, {
            duration: 10000,
          });
        }
      })
      .on('broadcast', { event: 'rescue_acknowledged' }, (payload) => {
        const { requestId, byLeader, riderUserId, riderName } = payload.payload as { requestId: string; byLeader: boolean; riderUserId?: string; riderName?: string };
        clearRescueTarget(riderUserId);
        
        if (!isLeader && riderUserId === userId) {
          // Non-leader: their rescue was acknowledged
          setHasPendingRescue(false);
          if (byLeader) {
            toast.success('Help is on the way! Leader added your location as a waypoint.');
          }
        }
        
        if (isLeader) {
          // Leader: remove from list and show confirmation
          setRescueRequests(prev => prev.filter(r => r.id !== requestId));
          if (riderName) {
            toast.success(`Rescue waypoint added for ${riderName}`);
          }
        }
      })
      .on('broadcast', { event: 'rescue_dismissed' }, (payload) => {
        const { requestId } = payload.payload as { requestId: string };
        clearRescueTarget();
        
        if (!isLeader) {
          setHasPendingRescue(false);
        } else {
          setRescueRequests(prev => prev.filter(r => r.id !== requestId));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearRescueTarget();
    };
  }, [convoyId, isLeader]);

  const sendRescueRequest = useCallback(async (lat: number, lng: number) => {
    if (!convoyId || !userId || !userName || !channelRef.current) return false;

    const now = Date.now();
    if (now - lastRescueSentAtRef.current < RESCUE_COOLDOWN_MS) {
      const remaining = Math.ceil((RESCUE_COOLDOWN_MS - (now - lastRescueSentAtRef.current)) / 1000);
      toast.error(`Please wait ${remaining}s before sending another rescue request`);
      return false;
    }
    lastRescueSentAtRef.current = now;

    const request: RescueRequest = {
      id: crypto.randomUUID(),
      userId,
      userName,
      lat,
      lng,
      timestamp: Date.now(),
    };

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_request',
      payload: request,
    });

    setHasPendingRescue(true);
    setRescueTarget({ userId, userName, lat, lng });
    toast.info('Rescue request sent to leader');

    // Fire-and-forget Discord ping to leader's server if configured
    announceRescueToDiscord({ convoyId, riderName: userName, lat, lng });

    return true;
  }, [convoyId, userId, userName]);

  // Convenience wrapper used by the map overlay: grabs a fresh GPS fix itself.
  const sendRescueRequestFromGps = useCallback(async () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { void sendRescueRequest(pos.coords.latitude, pos.coords.longitude); },
      () => toast.error('Unable to get your location'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  }, [sendRescueRequest]);

  const acknowledgeRescue = useCallback(async (requestId: string, riderUserId?: string, riderName?: string) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_acknowledged',
      payload: { requestId, byLeader: true, riderUserId, riderName },
    });

    setRescueRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const dismissRescue = useCallback(async (requestId: string) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_dismissed',
      payload: { requestId },
    });

    setRescueRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const cancelRescueRequest = useCallback(async () => {
    if (!channelRef.current || !userId) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_dismissed',
      payload: { requestId: userId },
    });

    setHasPendingRescue(false);
    clearRescueTarget(userId);
  }, [userId]);

  // Expose the rescue action to the Blacktop map overlay (which renders above
  // ActiveRide) so members can request/cancel rescue without leaving the map.
  useEffect(() => {
    registerRescueControls({
      hasPending: hasPendingRescue,
      canRequest: !!convoyId && !isLeader,
      send: sendRescueRequestFromGps,
      cancel: cancelRescueRequest,
    });
    return () => clearRescueControls();
  }, [convoyId, isLeader, hasPendingRescue, sendRescueRequestFromGps, cancelRescueRequest]);

  return {
    rescueRequests,
    hasPendingRescue,
    sendRescueRequest,
    acknowledgeRescue,
    dismissRescue,
    cancelRescueRequest,
  };
}
