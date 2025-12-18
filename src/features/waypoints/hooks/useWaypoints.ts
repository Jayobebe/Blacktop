import { useCallback, useEffect, useState } from 'react';
import { ConvoyWaypoint } from '@/types/convoy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useWaypoints(convoyId: string | null, isLeader: boolean) {
  const [waypoints, setWaypoints] = useState<ConvoyWaypoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Broadcast waypoint update to all members
  const broadcastWaypointUpdate = useCallback(async () => {
    if (!convoyId) return;
    
    const channel = supabase.channel(`convoy-control:${convoyId}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'waypoints-updated',
      payload: {},
    });
    // Give time for broadcast to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    supabase.removeChannel(channel);
  }, [convoyId]);

  // Fetch waypoints
  const fetchWaypoints = useCallback(async () => {
    if (!convoyId) {
      setWaypoints([]);
      return;
    }

    const { data, error } = await supabase
      .from('convoy_waypoints')
      .select('*')
      .eq('convoy_id', convoyId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Failed to fetch waypoints:', error);
      return;
    }

    const mapped: ConvoyWaypoint[] = (data || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      address: w.address,
      lat: Number(w.lat),
      lng: Number(w.lng),
      orderIndex: w.order_index,
      isCompleted: w.is_completed,
      completedAt: w.completed_at,
    }));

    setWaypoints(mapped);
  }, [convoyId]);

  // Subscribe to realtime updates and broadcast events
  useEffect(() => {
    if (!convoyId) return;

    fetchWaypoints();

    // Database realtime subscription
    const dbChannel = supabase
      .channel(`waypoints-${convoyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'convoy_waypoints',
          filter: `convoy_id=eq.${convoyId}`,
        },
        () => {
          fetchWaypoints();
        }
      )
      .subscribe();

    // Broadcast channel for immediate updates
    const controlChannel = supabase.channel(`convoy-control:${convoyId}`, {
      config: { broadcast: { self: false } },
    });

    controlChannel.on('broadcast', { event: 'waypoints-updated' }, () => {
      console.log('[Waypoints] Received waypoints-updated broadcast');
      fetchWaypoints();
    });

    controlChannel.subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(controlChannel);
    };
  }, [convoyId, fetchWaypoints]);

  // Add a waypoint (leader only, but works during active ride)
  const addWaypoint = useCallback(async (waypoint: Omit<ConvoyWaypoint, 'id' | 'orderIndex' | 'isCompleted' | 'completedAt'>) => {
    if (!convoyId) {
      console.error('[Waypoints] No convoy ID');
      return false;
    }
    
    if (!isLeader) {
      console.error('[Waypoints] Only leader can add waypoints');
      toast.error('Only the leader can add waypoints');
      return false;
    }

    setIsLoading(true);

    // Get next order index
    const nextIndex = waypoints.length;

    const { error } = await supabase
      .from('convoy_waypoints')
      .insert({
        convoy_id: convoyId,
        name: waypoint.name,
        address: waypoint.address || null,
        lat: waypoint.lat,
        lng: waypoint.lng,
        order_index: nextIndex,
      });

    setIsLoading(false);

    if (error) {
      toast.error('Failed to add waypoint');
      console.error('Failed to add waypoint:', error);
      return false;
    }

    console.log('[Waypoints] Added waypoint:', waypoint.name);
    
    // Broadcast to all members
    await broadcastWaypointUpdate();
    
    return true;
  }, [convoyId, isLeader, waypoints.length, broadcastWaypointUpdate]);

  // Remove a waypoint
  const removeWaypoint = useCallback(async (waypointId: string) => {
    if (!convoyId || !isLeader) return;

    setIsLoading(true);

    const { error } = await supabase
      .from('convoy_waypoints')
      .delete()
      .eq('id', waypointId);

    setIsLoading(false);

    if (error) {
      toast.error('Failed to remove waypoint');
      return false;
    }

    // Reorder remaining waypoints
    const remaining = waypoints.filter(w => w.id !== waypointId);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].orderIndex !== i) {
        await supabase
          .from('convoy_waypoints')
          .update({ order_index: i })
          .eq('id', remaining[i].id);
      }
    }

    // Broadcast to all members
    await broadcastWaypointUpdate();

    return true;
  }, [convoyId, isLeader, waypoints, broadcastWaypointUpdate]);

  // Mark waypoint as completed
  const completeWaypoint = useCallback(async (waypointId: string) => {
    if (!convoyId || !isLeader) return;

    const { error } = await supabase
      .from('convoy_waypoints')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', waypointId);

    if (error) {
      toast.error('Failed to complete waypoint');
      return false;
    }

    // Broadcast to all members
    await broadcastWaypointUpdate();

    return true;
  }, [convoyId, isLeader, broadcastWaypointUpdate]);

  // Clear all waypoints
  const clearAllWaypoints = useCallback(async () => {
    if (!convoyId || !isLeader) return;

    setIsLoading(true);

    const { error } = await supabase
      .from('convoy_waypoints')
      .delete()
      .eq('convoy_id', convoyId);

    setIsLoading(false);

    if (error) {
      toast.error('Failed to clear waypoints');
      return false;
    }

    // Broadcast to all members
    await broadcastWaypointUpdate();

    return true;
  }, [convoyId, isLeader, broadcastWaypointUpdate]);

  // Reorder waypoints
  const reorderWaypoints = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!convoyId || !isLeader) return;

    const newOrder = [...waypoints];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    // Optimistic update
    setWaypoints(newOrder.map((w, i) => ({ ...w, orderIndex: i })));

    // Update in database
    for (let i = 0; i < newOrder.length; i++) {
      await supabase
        .from('convoy_waypoints')
        .update({ order_index: i })
        .eq('id', newOrder[i].id);
    }

    // Broadcast to all members
    await broadcastWaypointUpdate();
  }, [convoyId, isLeader, waypoints, broadcastWaypointUpdate]);

  // Get next incomplete waypoint
  const nextWaypoint = waypoints.find(w => !w.isCompleted);
  const completedCount = waypoints.filter(w => w.isCompleted).length;

  return {
    waypoints,
    isLoading,
    addWaypoint,
    removeWaypoint,
    completeWaypoint,
    clearAllWaypoints,
    reorderWaypoints,
    nextWaypoint,
    completedCount,
    totalCount: waypoints.length,
  };
}
