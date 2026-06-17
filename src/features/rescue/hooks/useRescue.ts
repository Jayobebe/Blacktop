import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { announceRescueToDiscord } from '@/features/integrations/discord';

export interface RescueRequest {
  id: string;
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export function useRescue(convoyId: string | null, isLeader: boolean, userId: string | null, userName: string | null) {
  const [rescueRequests, setRescueRequests] = useState<RescueRequest[]>([]);
  const [hasPendingRescue, setHasPendingRescue] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!convoyId) return;

    const channel = supabase.channel(`rescue-${convoyId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'rescue_request' }, (payload) => {
        const request = payload.payload as RescueRequest;
        
        if (isLeader) {
          // Leader receives rescue requests
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
    };
  }, [convoyId, isLeader]);

  const sendRescueRequest = useCallback(async (lat: number, lng: number) => {
    if (!convoyId || !userId || !userName || !channelRef.current) return false;

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
    toast.info('Rescue request sent to leader');

    // Fire-and-forget Discord ping to leader's server if configured
    announceRescueToDiscord({ convoyId, riderName: userName, lat, lng });

    return true;
  }, [convoyId, userId, userName]);

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
  }, [userId]);

  return {
    rescueRequests,
    hasPendingRescue,
    sendRescueRequest,
    acknowledgeRescue,
    dismissRescue,
    cancelRescueRequest,
  };
}
