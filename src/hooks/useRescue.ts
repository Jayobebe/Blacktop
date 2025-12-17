import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
        const { requestId, byLeader, riderUserId } = payload.payload as { requestId: string; byLeader: boolean; riderUserId?: string };
        
        if (!isLeader && riderUserId === userId) {
          // Non-leader: their rescue was acknowledged
          setHasPendingRescue(false);
          if (byLeader) {
            toast.success('Help is on the way! Leader added your location as a waypoint.');
          }
        } else if (isLeader) {
          // Leader: remove from list
          setRescueRequests(prev => prev.filter(r => r.id !== requestId));
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
    return true;
  }, [convoyId, userId, userName]);

  const acknowledgeRescue = useCallback(async (requestId: string, riderUserId?: string) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'rescue_acknowledged',
      payload: { requestId, byLeader: true, riderUserId },
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
