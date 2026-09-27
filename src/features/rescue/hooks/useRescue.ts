import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { announceRescueToDiscord } from '@/features/integrations/discord';
import { notifyRescue, notifyRescueCancel } from '@/features/notifications';
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
// from hammering the convoy's alert panels and Discord webhook by repeatedly
// tapping the rescue button or via a script.
const RESCUE_COOLDOWN_MS = 30_000; // 30 seconds

export function useRescue(convoyId: string | null, isLeader: boolean, userId: string | null, userName: string | null) {
  const [rescueRequests, setRescueRequests] = useState<RescueRequest[]>([]);
  const [hasPendingRescue, setHasPendingRescue] = useState(false);
  // For the rider in distress: names of convoy members who've said they're coming.
  const [responders, setResponders] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastRescueSentAtRef = useRef<number>(0);

  useEffect(() => {
    if (!convoyId) return;

    const channel = supabase.channel(`rescue-${convoyId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'rescue_request' }, async (payload) => {
        const request = payload.payload as RescueRequest;
        if (request.userId === userId) return;

        // Verify sender is actually in this convoy before surfacing anything.
        // Realtime broadcast channels are open to any authenticated user who knows
        // the channel name, so we must check membership server-side.
        const { data: member } = await supabase
          .from('convoy_members')
          .select('user_id')
          .eq('convoy_id', convoyId)
          .eq('user_id', request.userId)
          .maybeSingle();
        if (!member) return;

        // Everyone in the convoy gets the rescue location so the Blacktop map
        // can draw a secondary (glowing orange) rescue route on top of the
        // existing route/waypoints.
        setRescueTarget({
          userId: request.userId,
          userName: request.userName,
          lat: request.lat,
          lng: request.lng,
        });

        // Every member is alerted, not just the leader — whoever is closest
        // can turn back.
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
      })
      // Any member (not just the leader) can answer a rescue card. The rider in
      // distress is told who's coming; everyone else sees who's already on it,
      // and the rescue route stays up so more riders can still turn back.
      .on('broadcast', { event: 'rescue_responding' }, (payload) => {
        const { riderUserId, riderName, responderId, responderName } = payload.payload as {
          riderUserId: string;
          riderName: string;
          responderId: string;
          responderName: string;
        };
        if (responderId === userId) return;
        if (riderUserId === userId) {
          setResponders((prev) => (prev.includes(responderName) ? prev : [...prev, responderName]));
          toast.success(`${responderName} is on the way to you`, { duration: 15000 });
          return;
        }
        toast(`${responderName} is heading to ${riderName}`, { duration: 6000 });
      })
      .on('broadcast', { event: 'rescue_acknowledged' }, (payload) => {
        const { requestId, riderUserId, riderName, responderName } = payload.payload as {
          requestId: string;
          byLeader: boolean;
          riderUserId?: string;
          riderName?: string;
          responderName?: string;
        };
        clearRescueTarget(riderUserId);
        
        if (riderUserId === userId) {
          // The rider in trouble: their rescue was acknowledged
          setHasPendingRescue(false);
          setResponders([]);
          toast.success(`Help is on the way! ${responderName ?? 'Your leader'} added your location as a waypoint.`, { duration: 15000 });
          return;
        }

        // Everyone else: the leader has it in hand, so drop the alert
        setRescueRequests(prev => prev.filter(r => r.id !== requestId && r.userId !== riderUserId));
        if (riderName) {
          toast.success(`Rescue waypoint added for ${riderName}`);
        }
      })
      .on('broadcast', { event: 'rescue_dismissed' }, (payload) => {
        const { requestId, riderUserId } = payload.payload as { requestId: string; riderUserId?: string };
        clearRescueTarget(riderUserId);

        if (riderUserId === userId) {
          setHasPendingRescue(false);
          setResponders([]);
        }
        setRescueRequests(prev => prev.filter(r => r.id !== requestId && (!riderUserId || r.userId !== riderUserId)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearRescueTarget();
    };
  }, [convoyId, userId]);

  const sendRescueRequest = useCallback(async (lat: number, lng: number, opts?: { auto?: boolean }) => {
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
    setResponders([]);
    setRescueTarget({ userId, userName, lat, lng });
    toast.info('Rescue request sent to your convoy');

    // Fire-and-forget Discord ping to the convoy's server if configured
    announceRescueToDiscord({ convoyId, riderName: userName, lat, lng });
    // Push notification to the convoy and the rider's crew, even if their app is closed.
    void notifyRescue({ convoyId, lat, lng, auto: opts?.auto });

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
      payload: { requestId, byLeader: true, riderUserId, riderName, responderName: userName ?? undefined },
    });

    setRescueRequests(prev => prev.filter(r => r.id !== requestId));
  }, [userName]);

  /**
   * "I'm on my way" from any convoy member: tells the rider in distress (and the
   * rest of the convoy) who's coming. The rescue route stays on everyone's map.
   */
  const respondToRescue = useCallback(async (request: RescueRequest) => {
    setRescueRequests(prev => prev.filter(r => r.id !== request.id));
    if (!channelRef.current || !userId) return;
    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_responding',
      payload: {
        requestId: request.id,
        riderUserId: request.userId,
        riderName: request.userName,
        responderId: userId,
        responderName: userName ?? 'A convoy member',
      },
    });
    toast.success(`${request.userName} knows you're on the way`);
  }, [userId, userName]);

  // Leader dismissal closes the request for the whole convoy; a member
  // dismissing only hides the alert on their own screen.
  const dismissRescue = useCallback(async (requestId: string) => {
    const request = rescueRequests.find(r => r.id === requestId);
    setRescueRequests(prev => prev.filter(r => r.id !== requestId));
    if (!isLeader || !channelRef.current) return;

    clearRescueTarget(request?.userId);
    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_dismissed',
      payload: { requestId, riderUserId: request?.userId },
    });
  }, [isLeader, rescueRequests]);

  const cancelRescueRequest = useCallback(async () => {
    if (!channelRef.current || !userId) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_dismissed',
      payload: { requestId: userId, riderUserId: userId },
    });
    void notifyRescueCancel({ convoyId });

    setHasPendingRescue(false);
    setResponders([]);
    clearRescueTarget(userId);
  }, [userId, convoyId]);

  // Expose the rescue action to the Blacktop map overlay (which renders above
  // ActiveRide) so members can request/cancel rescue without leaving the map.
  useEffect(() => {
    registerRescueControls({
      hasPending: hasPendingRescue,
      canRequest: !!convoyId,
      send: sendRescueRequestFromGps,
      cancel: cancelRescueRequest,
    });
    return () => clearRescueControls();
  }, [convoyId, hasPendingRescue, sendRescueRequestFromGps, cancelRescueRequest]);

  return {
    rescueRequests,
    hasPendingRescue,
    responders,
    sendRescueRequest,
    acknowledgeRescue,
    respondToRescue,
    dismissRescue,
    cancelRescueRequest,
  };
}
