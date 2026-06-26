import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ConvoyWaypoint, RouteStop } from '@/types/convoy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Module-level singleton store (mirrors useConvoyState/useActiveRide) so the
// map overlay can read live route stops via useWaypointRouteStops() without
// mounting a second postgres_changes subscription alongside whatever page
// (Lobby/ActiveRide) is already running the full useWaypoints() hook.
type Listener = () => void;
const listeners = new Set<Listener>();

interface WaypointsStoreState {
  waypoints: ConvoyWaypoint[];
  isLoading: boolean;
  // Incomplete-stop coordinates for the active route line. Updated instantly
  // from the broadcast payload (no DB round trip) and reconciled by the next
  // fetchWaypoints() DB read.
  routeStops: RouteStop[];
}

let storeState: WaypointsStoreState = { waypoints: [], isLoading: false, routeStops: [] };
let waypointRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let waypointRealtimeChannelId: string | null = null;
let waypointRealtimeRefCount = 0;
let waypointRealtimeTopicSeq = 0;

function getSnapshot(): WaypointsStoreState {
  return storeState;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach(l => l());
}

function setStoreState(updater: (prev: WaypointsStoreState) => WaypointsStoreState) {
  storeState = updater(storeState);
  emitChange();
}

function routeStopsFrom(waypoints: ConvoyWaypoint[]): RouteStop[] {
  return waypoints.filter(w => !w.isCompleted).map(w => ({ lat: w.lat, lng: w.lng }));
}

async function fetchWaypointsForConvoy(convoyId: string | null) {
  if (!convoyId) {
    setStoreState(() => ({ waypoints: [], isLoading: false, routeStops: [] }));
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

  setStoreState(prev => ({ ...prev, waypoints: mapped, routeStops: routeStopsFrom(mapped) }));
}

function acquireWaypointRealtimeSubscription(convoyId: string) {
  if (!waypointRealtimeChannel || waypointRealtimeChannelId !== convoyId) {
    if (waypointRealtimeChannel) {
      supabase.removeChannel(waypointRealtimeChannel);
    }

    // Supabase reuses channels by topic. Multiple mounted useWaypoints callers
    // (Lobby + map overlay + active ride) must share one local subscription, and
    // each channel lifetime gets a unique topic so stale subscribed channels are
    // never reused for new postgres_changes callbacks.
    waypointRealtimeChannel = supabase
      .channel(`waypoints-${convoyId}:${++waypointRealtimeTopicSeq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'convoy_waypoints',
          filter: `convoy_id=eq.${convoyId}`,
        },
        () => {
          fetchWaypointsForConvoy(convoyId);
        }
      )
      .subscribe((status, error) => {
        if (error) console.warn('[Waypoints] Realtime subscription error:', error.message);
      });

    waypointRealtimeChannelId = convoyId;
    waypointRealtimeRefCount = 0;
  }

  waypointRealtimeRefCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    waypointRealtimeRefCount = Math.max(0, waypointRealtimeRefCount - 1);

    if (waypointRealtimeRefCount === 0 && waypointRealtimeChannelId === convoyId && waypointRealtimeChannel) {
      const channel = waypointRealtimeChannel;
      waypointRealtimeChannel = null;
      waypointRealtimeChannelId = null;
      supabase.removeChannel(channel);
    }
  };
}

// Lightweight, read-only selector for the active route's stop coordinates -
// safe to call from any number of components (e.g. the map overlay) since it
// has no side effects of its own.
export function useWaypointRouteStops(): RouteStop[] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return state.routeStops;
}

// Returns the first incomplete waypoint, or null if all complete / none exist.
export function useNextWaypoint(): ConvoyWaypoint | null {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return state.waypoints.find(w => !w.isCompleted) ?? null;
}

export function useWaypoints(convoyId: string | null, isLeader: boolean) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { waypoints, isLoading } = state;

  // Fetch waypoints
  const fetchWaypoints = useCallback(async () => {
    await fetchWaypointsForConvoy(convoyId);
  }, [convoyId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!convoyId) {
      fetchWaypointsForConvoy(null);
      return;
    }

    fetchWaypointsForConvoy(convoyId);
    return acquireWaypointRealtimeSubscription(convoyId);
  }, [convoyId]);

  const MAX_WAYPOINTS = 5;

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

    const incompleteCount = waypoints.filter(w => !w.isCompleted).length;
    if (incompleteCount >= MAX_WAYPOINTS) {
      toast.error(`Maximum ${MAX_WAYPOINTS} stops allowed. Complete or remove a stop first.`);
      return false;
    }

    setStoreState(prev => ({ ...prev, isLoading: true }));

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

    setStoreState(prev => ({ ...prev, isLoading: false }));

    if (error) {
      toast.error('Failed to add waypoint');
      console.error('Failed to add waypoint:', error);
      return false;
    }

    console.log('[Waypoints] Added waypoint:', waypoint.name);

    // Optimistically redraw the local route; other riders update from DB realtime.
    setStoreState(prev => ({ ...prev, routeStops: [
      ...routeStopsFrom(waypoints),
      { lat: waypoint.lat, lng: waypoint.lng },
    ] }));
    await fetchWaypointsForConvoy(convoyId);

    return true;
  }, [convoyId, isLeader, waypoints]);

  // Remove a waypoint
  const removeWaypoint = useCallback(async (waypointId: string) => {
    if (!convoyId || !isLeader) return;

    setStoreState(prev => ({ ...prev, isLoading: true }));

    const { error } = await supabase
      .from('convoy_waypoints')
      .delete()
      .eq('id', waypointId);

    setStoreState(prev => ({ ...prev, isLoading: false }));

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

    setStoreState(prev => ({ ...prev, waypoints: remaining, routeStops: routeStopsFrom(remaining) }));

    return true;
  }, [convoyId, isLeader, waypoints]);

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

    const remainingStops = routeStopsFrom(waypoints.filter(w => w.id !== waypointId));
    setStoreState(prev => ({
      ...prev,
      waypoints: prev.waypoints.map(w => w.id === waypointId ? { ...w, isCompleted: true, completedAt: new Date().toISOString() } : w),
      routeStops: remainingStops,
    }));

    return true;
  }, [convoyId, isLeader, waypoints]);

  // Clear all waypoints
  const clearAllWaypoints = useCallback(async () => {
    if (!convoyId || !isLeader) return;

    setStoreState(prev => ({ ...prev, isLoading: true }));

    const { error } = await supabase
      .from('convoy_waypoints')
      .delete()
      .eq('convoy_id', convoyId);

    setStoreState(prev => ({ ...prev, isLoading: false }));

    if (error) {
      toast.error('Failed to clear waypoints');
      return false;
    }

    setStoreState(prev => ({ ...prev, waypoints: [], routeStops: [] }));

    return true;
  }, [convoyId, isLeader]);

  // Reorder waypoints
  const reorderWaypoints = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!convoyId || !isLeader) return;

    const newOrder = [...waypoints];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    const reindexed = newOrder.map((w, i) => ({ ...w, orderIndex: i }));

    // Optimistic update
    setStoreState(prev => ({ ...prev, waypoints: reindexed, routeStops: routeStopsFrom(reindexed) }));

    // Update in database
    for (let i = 0; i < reindexed.length; i++) {
      await supabase
        .from('convoy_waypoints')
        .update({ order_index: i })
        .eq('id', reindexed[i].id);
    }

    setStoreState(prev => ({ ...prev, routeStops: routeStopsFrom(reindexed) }));
  }, [convoyId, isLeader, waypoints]);

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
