import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ConvoyState, ConvoyMemberInfo, ConvoyDestination } from '@/types/convoy';
import { useProfile } from '@/features/profile';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const MAX_CONVOY_MEMBERS = 8;
const ACTIVE_CONVOY_KEY = 'blacktop_active_convoy_id';

type Listener = () => void;
const listeners = new Set<Listener>();

let convoyState: ConvoyState = {
  id: null,
  code: null,
  isLeader: false,
  members: [],
  isActive: false,
  isRestoring: true,
  destination: null,
  waypoints: [],
  isPaused: false,
  realtimeSuspended: false,
};

let restoreInFlight = false;
let convoyRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let convoyRealtimeChannelId: string | null = null;
let convoyRealtimeRefCount = 0;
let convoyRealtimeTopicSeq = 0;

function rememberActiveConvoy(convoyId: string | null) {
  try {
    if (convoyId) {
      localStorage.setItem(ACTIVE_CONVOY_KEY, convoyId);
    } else {
      localStorage.removeItem(ACTIVE_CONVOY_KEY);
    }
  } catch {
    // Ignore storage failures in private browsing / restricted webviews.
  }
}

function getSnapshot(): ConvoyState {
  return convoyState;
}

function getServerSnapshot(): ConvoyState {
  return convoyState;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach(l => l());
}

function setConvoyState(updater: (prev: ConvoyState) => ConvoyState) {
  convoyState = updater(convoyState);
  emitChange();
}

function clearActiveConvoySession() {
  rememberActiveConvoy(null);
  setConvoyState(() => ({
    id: null,
    code: null,
    isLeader: false,
    members: [],
    isActive: false,
    isRestoring: false,
    destination: null,
    waypoints: [],
    isPaused: false,
    realtimeSuspended: false,
  }));
}

function acquireConvoyRealtimeSubscription(
  convoyId: string,
  refreshMembers: (convoyId: string) => Promise<void>,
) {
  if (!convoyRealtimeChannel || convoyRealtimeChannelId !== convoyId) {
    if (convoyRealtimeChannel) {
      supabase.removeChannel(convoyRealtimeChannel);
    }

    // Supabase reuses channels by topic. If a second mounted component calls
    // useConvoyState while the original channel is already subscribed, adding
    // another postgres_changes callback throws. Keep one local channel alive and
    // give each channel lifetime a unique topic so stale channels are never reused.
    const topic = `convoy-${convoyId}:${++convoyRealtimeTopicSeq}`;
    convoyRealtimeChannel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'convoys',
          filter: `id=eq.${convoyId}`,
        },
        async (payload) => {
          const convoy = payload.new as any;
          const oldConvoy = payload.old as any;

          if (convoy.is_active === false || convoy.ride_ended_at) {
            console.log('[Convoy] Convoy ended, clearing local session');
            clearActiveConvoySession();
            return;
          }

          if (oldConvoy && convoy.leader_id !== oldConvoy.leader_id) {
            console.log('[Convoy] Leadership changed via realtime, refreshing members');
            await refreshMembers(convoyId);
          }

          if (convoy.destination_name || convoy.destination_lat) {
            setConvoyState((prev) => ({
              ...prev,
              destination: convoy.destination_name ? {
                name: convoy.destination_name,
                address: convoy.destination_address || '',
                lat: convoy.destination_lat,
                lng: convoy.destination_lng,
              } : null,
              isPaused: convoy.is_paused || false,
            }));
          } else {
            setConvoyState((prev) => ({
              ...prev,
              destination: null,
              isPaused: convoy.is_paused || false,
            }));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'convoy_members',
          filter: `convoy_id=eq.${convoyId}`,
        },
        async () => {
          await refreshMembers(convoyId);
        }
      )
      .subscribe((status, error) => {
        if (error) console.warn('[Convoy] Realtime subscription error:', error.message);
        if (status === 'SUBSCRIBED') console.log('[Convoy] Realtime subscribed');
      });

    convoyRealtimeChannelId = convoyId;
    convoyRealtimeRefCount = 0;
  }

  convoyRealtimeRefCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    convoyRealtimeRefCount = Math.max(0, convoyRealtimeRefCount - 1);

    if (convoyRealtimeRefCount === 0 && convoyRealtimeChannelId === convoyId && convoyRealtimeChannel) {
      const channel = convoyRealtimeChannel;
      convoyRealtimeChannel = null;
      convoyRealtimeChannelId = null;
      supabase.removeChannel(channel);
    }
  };
}

// Lightweight selector for callers that only need the active convoy id (e.g.
// to gate a presence channel) without paying for useConvoyState's restore
// and realtime-subscription side effects on every mount.
export function useConvoyId(): string | null {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state.id;
}

// Lightweight selector for callers that only need the member list (e.g. the
// map overlay's convoy member markers). Critically, this does NOT run
// useConvoyState's realtime-subscription effect: that effect subscribes to a
// Supabase channel named `convoy-${id}`, and a second mounted instance of it
// (e.g. the map rendered on top of the page that's already using
// useConvoyState) throws "cannot add postgres_changes callbacks ... after
// subscribe()" since both instances race to subscribe the same channel name.
export function useConvoyMembers() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state.members;
}

export function useConvoyState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { profile } = useProfile();
  const { settings } = useSettings();

  // Restore convoy state from database on mount (handles page reload)
  useEffect(() => {
    // Skip if we already have an active convoy loaded
    if (state.isActive || restoreInFlight) return;

    const restoreConvoySession = async () => {
      restoreInFlight = true;
      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConvoyState((prev) => ({ ...prev, isRestoring: false }));
        return;
      }

      const rememberedConvoyId = (() => {
        try {
          return localStorage.getItem(ACTIVE_CONVOY_KEY);
        } catch {
          return null;
        }
      })();

      if (!rememberedConvoyId) {
        console.log('[Convoy] No locally active convoy to restore');
        setConvoyState((prev) => ({ ...prev, isRestoring: false }));
        return;
      }

      // Only restore the convoy this device explicitly remembers as active.
      const { data: memberships } = await supabase
        .from('convoy_members')
        .select(`
          convoy_id,
          joined_at,
          convoys!inner (
            id,
            code,
            name,
            leader_id,
            destination_name,
            destination_address,
            destination_lat,
            destination_lng,
            is_active,
            is_paused,
            ride_ended_at
          )
        `)
        .eq('user_id', user.id)
        .eq('convoy_id', rememberedConvoyId)
        .eq('convoys.is_active', true)
        .limit(1);

      const membership = memberships?.[0];
      if (!membership?.convoys) {
        console.log('[Convoy] No active convoy membership found');
        rememberActiveConvoy(null);
        setConvoyState((prev) => ({ ...prev, isRestoring: false }));
        return;
      }

      const convoy = membership.convoys as any;
      if (convoy.ride_ended_at) {
        console.log('[Convoy] Ignoring ended convoy membership:', convoy.code);
        await supabase
          .from('convoy_members')
          .delete()
          .eq('convoy_id', convoy.id)
          .eq('user_id', user.id);
        rememberActiveConvoy(null);
        setConvoyState((prev) => ({ ...prev, isRestoring: false }));
        return;
      }

      console.log('[Convoy] Restoring convoy session:', convoy.code);

      // Fetch all members
      const { data: membersData } = await supabase
        .from('convoy_members')
        .select(`
          id,
          user_id,
          joined_at,
          has_navigated,
          current_speed,
          top_speed,
          distance_driven,
          stationary_time,
          current_lat,
          current_lng,
          accent_color,
          profiles!convoy_members_user_id_fkey(display_name)
        `)
        .eq('convoy_id', convoy.id);

      const members: ConvoyMemberInfo[] = (membersData || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        name: m.profiles?.display_name || 'Unknown',
        isLeader: m.user_id === convoy.leader_id,
        isReady: true,
        hasNavigated: m.has_navigated || false,
        joinedAt: m.joined_at,
        accentColor: m.accent_color || 'orange',
        currentSpeed: m.current_speed || 0,
        topSpeed: m.top_speed || 0,
        distanceDriven: m.distance_driven || 0,
        stationaryTime: m.stationary_time || 0,
        currentLat: m.current_lat,
        currentLng: m.current_lng,
      }));

      // Parse destination if set
      const destination = convoy.destination_name ? {
        name: convoy.destination_name,
        address: convoy.destination_address || '',
        lat: convoy.destination_lat,
        lng: convoy.destination_lng,
      } : null;

      setConvoyState(() => ({
        id: convoy.id,
        code: convoy.code,
        isLeader: convoy.leader_id === user.id,
        members,
        isActive: true,
        isRestoring: false,
        destination,
        waypoints: [],
        isPaused: convoy.is_paused || false,
        realtimeSuspended: false,
      }));
      rememberActiveConvoy(convoy.id);

      toast.success('Convoy session restored');
      } finally {
        if (convoyState.isRestoring) {
          setConvoyState((prev) => ({ ...prev, isRestoring: false }));
        }
        restoreInFlight = false;
      }
    };

    restoreConvoySession();
  }, [state.isActive]);

  // Subscribe to realtime convoy updates. Skipped while realtimeSuspended
  // (e.g. the inactivity guard dropped the connection to stop running up
  // Realtime usage overnight) - local convoy state is untouched, only the
  // live channel goes away.
  useEffect(() => {
    if (!state.id || state.realtimeSuspended) return;

    // Catch up on anything missed while the channel was suspended.
    refreshMembers(state.id);

    return acquireConvoyRealtimeSubscription(state.id, refreshMembers);
  }, [state.id, state.realtimeSuspended]);

  const refreshMembers = async (convoyId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data: membersData } = await supabase
      .from('convoy_members')
      .select(`
        id,
        user_id,
        joined_at,
        has_navigated,
        current_speed,
        top_speed,
        distance_driven,
        stationary_time,
        current_lat,
        current_lng,
        accent_color,
        profiles!convoy_members_user_id_fkey(display_name)
      `)
      .eq('convoy_id', convoyId);

    const { data: convoyData } = await supabase
      .from('convoys')
      .select('leader_id')
      .eq('id', convoyId)
      .maybeSingle();

    if (membersData) {
      const members: ConvoyMemberInfo[] = membersData.map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        name: m.profiles?.display_name || 'Unknown',
        isLeader: m.user_id === convoyData?.leader_id,
        isReady: true,
        hasNavigated: m.has_navigated || false,
        joinedAt: m.joined_at,
        accentColor: m.accent_color || 'orange',
        currentSpeed: m.current_speed || 0,
        topSpeed: m.top_speed || 0,
        distanceDriven: m.distance_driven || 0,
        stationaryTime: m.stationary_time || 0,
        currentLat: m.current_lat,
        currentLng: m.current_lng,
      }));

      console.log('[Convoy] Refreshed members:', members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated })));

      // Auto-promote last remaining member to leader
      if (members.length === 1 && user && members[0].userId === user.id && !members[0].isLeader) {
        console.log('[Convoy] Auto-promoting last remaining member to leader');
        const { error } = await supabase
          .rpc('claim_convoy_leadership' as any, { _convoy_id: convoyId });

        if (!error) {
          toast.success('You are now the convoy leader');
          setConvoyState((prev) => ({
            ...prev,
            isLeader: true,
            members: members.map(m => ({ ...m, isLeader: m.userId === user.id })),
          }));
          return;
        }
      }

      setConvoyState((prev) => ({
        ...prev,
        members,
        // Update isLeader if current user's leadership status changed
        isLeader: user ? members.some(m => m.userId === user.id && m.isLeader) : prev.isLeader,
      }));
    }
  };

  const createConvoy = useCallback(async () => {
    // Block before ever touching Supabase if local state already shows this
    // user leading an open convoy - prevents a create-spam loop from ever
    // reaching the DB (the unconditional "deactivate stale convoys" cleanup
    // below would otherwise silently churn through real rows every call).
    if (convoyState.isLeader && convoyState.isActive && convoyState.id) {
      toast.error('You already have an active convoy', {
        description: 'End your current session before starting a new one.',
      });
      return null;
    }

    let { data: { user } } = await supabase.auth.getUser();

    // Auto sign in anonymously if not authenticated
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        toast.error('Failed to connect');
        return null;
      }
      user = data.user;
      
      // Create profile for new anonymous user
      if (user) {
        await supabase.from('profiles').upsert({
          id: user.id,
          display_name: profile.name || 'Anonymous',
        });
      }
    }

    if (!user) return null;

    // Deactivate any stale active convoys this user previously led
    await supabase
      .from('convoys')
      .update({ is_active: false })
      .eq('leader_id', user.id)
      .eq('is_active', true);

    // Generate code using database function
    const { data: codeData } = await supabase.rpc('generate_convoy_code');
    const code = codeData || generateLocalCode();

    // Create convoy in database
    const { data: convoy, error } = await supabase
      .from('convoys')
      .insert({
        code,
        name: `${profile.name}'s Convoy`,
        leader_id: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error || !convoy) {
      toast.error('Failed to create convoy');
      return null;
    }

    // Add self as member with accent color
    const { error: memberError } = await supabase
      .from('convoy_members')
      .insert({
        convoy_id: convoy.id,
        user_id: user.id,
        accent_color: settings.accentColor,
      });

    if (memberError) {
      console.error('Failed to add self as member:', memberError);
    }

    const member: ConvoyMemberInfo = {
      id: user.id,
      userId: user.id,
      name: profile.name,
      isLeader: true,
      isReady: true,
      hasNavigated: false,
      joinedAt: new Date().toISOString(),
      accentColor: settings.accentColor,
    };

    setConvoyState(() => ({
      id: convoy.id,
      code: convoy.code,
      isLeader: true,
      members: [member],
      isActive: true,
      isRestoring: false,
      destination: null,
      waypoints: [],
      isPaused: false,
      realtimeSuspended: false,
    }));
    rememberActiveConvoy(convoy.id);

    return { id: convoy.id, code: convoy.code };
  }, [profile.name]);

  const joinConvoy = useCallback(async (code: string) => {
    let { data: { user } } = await supabase.auth.getUser();
    
    // Auto sign in anonymously if not authenticated
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        toast.error('Failed to connect');
        return false;
      }
      user = data.user;
      
      // Create profile for new anonymous user
      if (user) {
        await supabase.from('profiles').upsert({
          id: user.id,
          display_name: profile.name || 'Anonymous',
        });
      }
    }

    if (!user) {
      toast.error('Failed to connect');
      return false;
    }

    // Find convoy by code via RPC (avoids exposing every active convoy through a direct SELECT)
    const { data: convoy, error } = await supabase
      .rpc('lookup_convoy_by_code' as any, { _code: code.toUpperCase() });

    if (error || !convoy) {
      toast.error('Convoy not found');
      return false;
    }

    // Check member count before joining
    const { count: memberCount } = await supabase
      .from('convoy_members')
      .select('*', { count: 'exact', head: true })
      .eq('convoy_id', convoy.id);

    if (memberCount !== null && memberCount >= MAX_CONVOY_MEMBERS) {
      toast.error(`Convoy full (${MAX_CONVOY_MEMBERS}/${MAX_CONVOY_MEMBERS})`, {
        description: 'Ask the leader to create a second convoy for overflow members.',
      });
      return false;
    }

    // Add self as member with accent color
    const { error: memberError } = await supabase
      .from('convoy_members')
      .insert({
        convoy_id: convoy.id,
        user_id: user.id,
        accent_color: settings.accentColor,
      });

    if (memberError) {
      if (memberError.code === '23505') {
        toast.error('Already in this convoy');
      } else {
        toast.error('Failed to join convoy');
      }
      return false;
    }

    // Fetch all members
    const { data: membersData } = await supabase
      .from('convoy_members')
      .select(`
        id,
        user_id,
        joined_at,
        has_navigated,
        accent_color,
        current_lat,
        current_lng,
        profiles!convoy_members_user_id_fkey(display_name)
      `)
      .eq('convoy_id', convoy.id);

    const members: ConvoyMemberInfo[] = (membersData || []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      name: m.profiles?.display_name || 'Unknown',
      isLeader: m.user_id === convoy.leader_id,
      isReady: true,
      hasNavigated: m.has_navigated || false,
      joinedAt: m.joined_at,
      accentColor: m.accent_color || 'orange',
      currentLat: m.current_lat,
      currentLng: m.current_lng,
    }));

    // Parse destination if set
    const destination: ConvoyDestination | null = convoy.destination_name ? {
      name: convoy.destination_name,
      address: convoy.destination_address || '',
      lat: convoy.destination_lat,
      lng: convoy.destination_lng,
    } : null;

    setConvoyState(() => ({
      id: convoy.id,
      code: convoy.code,
      isLeader: convoy.leader_id === user.id,
      members,
      isActive: true,
      isRestoring: false,
      destination,
      waypoints: [],
      isPaused: convoy.is_paused || false,
      realtimeSuspended: false,
    }));
    rememberActiveConvoy(convoy.id);

    return true;
  }, []);

  const leaveConvoy = useCallback(async (skipDeactivation = false) => {
    const convoyId = state.id;
    const wasLeader = state.isLeader;

    // Run DB cleanup FIRST so the restore effect doesn't re-add us after state clears
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Remove ALL of this user's memberships (clears stale convoys too)
        const { error: delErr } = await supabase
          .from('convoy_members')
          .delete()
          .eq('user_id', user.id);
        if (delErr) console.warn('[Convoy] Failed to remove memberships:', delErr);

        // Deactivate any convoys this user leads (current + stale)
        if (!skipDeactivation) {
          const { error: deactErr } = await supabase
            .from('convoys')
            .update({ is_active: false })
            .eq('leader_id', user.id)
            .eq('is_active', true);
          if (deactErr) console.warn('[Convoy] Failed to deactivate convoys:', deactErr);
        }
      }
    } catch (e) {
      console.warn('[Convoy] leaveConvoy cleanup error:', e);
    }

    // Now clear local state — restore effect will find no active membership
    setConvoyState(() => ({
      id: null,
      code: null,
      isLeader: false,
      members: [],
      isActive: false,
      isRestoring: false,
      destination: null,
      waypoints: [],
      isPaused: false,
      realtimeSuspended: false,
    }));
    rememberActiveConvoy(null);
  }, [state.id, state.isLeader]);

  const setDestination = useCallback(async (destination: ConvoyDestination) => {
    if (!state.id || !state.isLeader) return;

    // Update in database
    const { error } = await supabase
      .from('convoys')
      .update({
        destination_name: destination.name,
        destination_address: destination.address,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        destination_set_at: new Date().toISOString(),
      })
      .eq('id', state.id);

    if (error) {
      toast.error('Failed to set destination');
      return;
    }

    // Update local state immediately
    setConvoyState((prev) => ({
      ...prev,
      destination,
    }));
  }, [state.id, state.isLeader]);

  const clearDestination = useCallback(async () => {
    if (!state.id || !state.isLeader) return;

    // Clear in database
    const { error } = await supabase
      .from('convoys')
      .update({
        destination_name: null,
        destination_address: null,
        destination_lat: null,
        destination_lng: null,
        destination_set_at: null,
      })
      .eq('id', state.id);

    if (error) {
      toast.error('Failed to clear destination');
      return;
    }

    setConvoyState((prev) => ({
      ...prev,
      destination: null,
    }));
  }, [state.id, state.isLeader]);

  const markAsNavigated = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.id) return;

    console.log('[Convoy] Marking user as navigated:', user.id);

    // Update local state immediately for responsive UI
    setConvoyState((prev) => ({
      ...prev,
      members: prev.members.map(m => 
        m.userId === user.id
          ? { ...m, hasNavigated: true }
          : m
      ),
    }));

    // Persist to database
    const { error } = await supabase
      .from('convoy_members')
      .update({ has_navigated: true })
      .eq('convoy_id', state.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Convoy] Failed to mark as navigated:', error);
    } else {
      console.log('[Convoy] Successfully marked as navigated in DB');
    }
  }, [state.id]);

  const resetNavigationStatus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.id) return;

    // Reset local state
    setConvoyState((prev) => ({
      ...prev,
      members: prev.members.map(m => ({ ...m, hasNavigated: false })),
    }));

    // Reset in database for current user
    await supabase
      .from('convoy_members')
      .update({ has_navigated: false })
      .eq('convoy_id', state.id)
      .eq('user_id', user.id);
  }, [state.id]);

  // Leader ends the convoy ride - burn the finished lobby so it cannot be restored later
  const endConvoyRide = useCallback(async () => {
    if (!state.id || !state.isLeader) return;

    const endedAt = new Date().toISOString();

    // Mark the convoy inactive and ended; server-side burn cleanup handles ephemeral ride data.
    await supabase
      .from('convoys')
      .update({
        is_active: false,
        destination_name: null,
        destination_address: null,
        destination_lat: null,
        destination_lng: null,
        destination_set_at: null,
        ride_ended_at: endedAt,
        ride_started_at: null,
      })
      .eq('id', state.id);

    // Clear local state so Home cannot redirect back into the burned lobby.
    setConvoyState(() => ({
      id: null,
      code: null,
      isLeader: false,
      members: [],
      isActive: false,
      isRestoring: false,
      destination: null,
      waypoints: [],
      isPaused: false,
      realtimeSuspended: false,
    }));
    rememberActiveConvoy(null);
  }, [state.id, state.isLeader]);

  // Transfer leadership to another member
  const transferLeadership = useCallback(async (newLeaderUserId: string) => {
    if (!state.id || !state.isLeader) return false;

    const { error } = await supabase
      .rpc('transfer_convoy_leadership' as any, { _convoy_id: state.id, _new_leader_id: newLeaderUserId });

    if (error) {
      toast.error('Failed to transfer leadership');
      return false;
    }

    // Broadcast leadership change to all members for immediate update
    const broadcastChannel = supabase.channel(`convoy-control:${state.id}`);
    await broadcastChannel.subscribe();
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'leadership-changed',
      payload: { newLeaderUserId },
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    supabase.removeChannel(broadcastChannel);

    // Update local state
    setConvoyState((prev) => ({
      ...prev,
      isLeader: false,
      members: prev.members.map(m => ({
        ...m,
        isLeader: m.userId === newLeaderUserId,
      })),
    }));

    toast.success('Leadership transferred');
    return true;
  }, [state.id, state.isLeader]);

  // Toggle pause state for the convoy (leader only)
  const togglePause = useCallback(async () => {
    if (!state.id || !state.isLeader) return;

    const newPausedState = !state.isPaused;

    // Update local state immediately for responsive UI
    setConvoyState((prev) => ({
      ...prev,
      isPaused: newPausedState,
    }));

    toast.success(newPausedState ? 'Ride paused' : 'Ride resumed');

    // Broadcast to all members - await subscription before sending
    const broadcastChannel = supabase.channel(`convoy-control:${state.id}`);
    
    await new Promise<void>((resolve) => {
      broadcastChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Convoy] Broadcasting', newPausedState ? 'pause-ride' : 'resume-ride');
          await broadcastChannel.send({
            type: 'broadcast',
            event: newPausedState ? 'pause-ride' : 'resume-ride',
            payload: {},
          });
          // Small delay to ensure message is sent before cleanup
          setTimeout(() => {
            supabase.removeChannel(broadcastChannel);
            resolve();
          }, 100);
        }
      });
    });

    // Update database in background (don't await)
    supabase
      .from('convoys')
      .update({ 
        is_paused: newPausedState,
        paused_at: newPausedState ? new Date().toISOString() : null,
      })
      .eq('id', state.id)
      .then(({ error }) => {
        if (error) {
          console.error('[Convoy] Failed to persist pause state:', error);
        }
      });
  }, [state.id, state.isLeader, state.isPaused]);

  // Check if all members have navigated
  const allMembersNavigated = state.members.length > 0 && state.members.every(m => m.hasNavigated);

  // Toggle the Realtime channel on/off without touching convoy membership -
  // used by the ride feature's inactivity guard to stop spending Realtime
  // usage when the rider has been stationary for a while.
  const setConvoyRealtimeSuspended = useCallback((suspended: boolean) => {
    setConvoyState((prev) => prev.realtimeSuspended === suspended ? prev : { ...prev, realtimeSuspended: suspended });
  }, []);

  // Expose refresh function for external callers (e.g., leadership change broadcast)
  const refreshConvoyState = useCallback(async () => {
    if (state.id) {
      await refreshMembers(state.id);
    }
  }, [state.id]);

  return {
    convoy: state,
    createConvoy,
    joinConvoy,
    leaveConvoy,
    setDestination,
    clearDestination,
    markAsNavigated,
    resetNavigationStatus,
    endConvoyRide,
    transferLeadership,
    togglePause,
    allMembersNavigated,
    refreshConvoyState,
    setConvoyRealtimeSuspended,
  };
}

function generateLocalCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
