import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ConvoyState, ConvoyMemberInfo, ConvoyDestination } from '@/types/convoy';
import { useProfile } from '@/features/profile';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const MAX_CONVOY_MEMBERS = 8;

type Listener = () => void;
const listeners = new Set<Listener>();

let convoyState: ConvoyState = {
  id: null,
  code: null,
  isLeader: false,
  members: [],
  isActive: false,
  destination: null,
  waypoints: [],
  isPaused: false,
};

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

export function useConvoyState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { profile } = useProfile();
  const { settings } = useSettings();

  // Restore convoy state from database on mount (handles page reload)
  useEffect(() => {
    // Skip if we already have an active convoy loaded
    if (state.isActive) return;

    const restoreConvoySession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is a member of any active convoy (take most recent if multiple)
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
            is_paused
          )
        `)
        .eq('user_id', user.id)
        .eq('convoys.is_active', true)
        .order('joined_at', { ascending: false })
        .limit(1);

      const membership = memberships?.[0];
      if (!membership?.convoys) {
        console.log('[Convoy] No active convoy membership found');
        return;
      }

      const convoy = membership.convoys as any;
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
        destination,
        waypoints: [],
        isPaused: convoy.is_paused || false,
      }));

      toast.success('Convoy session restored');
    };

    restoreConvoySession();
  }, [state.isActive]);

  // Subscribe to realtime convoy updates
  useEffect(() => {
    if (!state.id) return;

    const channel = supabase
      .channel(`convoy-${state.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'convoys',
          filter: `id=eq.${state.id}`,
        },
        async (payload) => {
          const convoy = payload.new as any;
          const oldConvoy = payload.old as any;
          
          // If leader_id changed, refresh members to update leadership status
          if (convoy.leader_id !== oldConvoy.leader_id) {
            console.log('[Convoy] Leadership changed via realtime, refreshing members');
            await refreshMembers(state.id!);
          }
          
          // Update destination from realtime
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
          filter: `convoy_id=eq.${state.id}`,
        },
        async () => {
          // Refresh members list on any member change
          await refreshMembers(state.id!);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.id]);

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
      }));

      console.log('[Convoy] Refreshed members:', members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated })));

      // Auto-promote last remaining member to leader
      if (members.length === 1 && user && members[0].userId === user.id && !members[0].isLeader) {
        console.log('[Convoy] Auto-promoting last remaining member to leader');
        const { error } = await supabase
          .from('convoys')
          .update({ leader_id: user.id })
          .eq('id', convoyId);
        
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
      destination: null,
      waypoints: [],
      isPaused: false,
    }));

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

    // Find convoy by code
    const { data: convoy, error } = await supabase
      .from('convoys')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

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
        description: 'Ask the leader to create a second convoy for overflow riders.',
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
      destination,
      waypoints: [],
      isPaused: convoy.is_paused || false,
    }));

    return true;
  }, []);

  const leaveConvoy = useCallback(async (skipDeactivation = false) => {
    const convoyId = state.id;
    const wasLeader = state.isLeader;
    
    // Clear state immediately (optimistic update) for instant UI response
    setConvoyState(() => ({
      id: null,
      code: null,
      isLeader: false,
      members: [],
      isActive: false,
      destination: null,
      waypoints: [],
      isPaused: false,
    }));

    // Run database cleanup in background (non-blocking)
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !convoyId) return;

      // Remove self from convoy_members
      supabase
        .from('convoy_members')
        .delete()
        .eq('convoy_id', convoyId)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('[Convoy] Failed to remove membership:', error);
        });

      // If leader and not skipping deactivation, deactivate convoy
      // Skip when leadership was just transferred (caller passes skipDeactivation=true)
      if (wasLeader && !skipDeactivation) {
        supabase
          .from('convoys')
          .update({ is_active: false })
          .eq('id', convoyId)
          .then(({ error }) => {
            if (error) console.warn('[Convoy] Failed to deactivate convoy:', error);
          });
      }
    })();
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

  // Leader ends the convoy ride - clears destination and resets all members' navigation status
  const endConvoyRide = useCallback(async () => {
    if (!state.id || !state.isLeader) return;

    // Clear destination and ride flags in database (this triggers realtime for all members)
    await supabase
      .from('convoys')
      .update({
        destination_name: null,
        destination_address: null,
        destination_lat: null,
        destination_lng: null,
        destination_set_at: null,
        ride_ended_at: null, // Clear so next ride can be started
        ride_started_at: null, // Clear so next ride can be started
      })
      .eq('id', state.id);

    // Reset all members' navigation status
    await supabase
      .from('convoy_members')
      .update({ has_navigated: false })
      .eq('convoy_id', state.id);

    // Update local state
    setConvoyState((prev) => ({
      ...prev,
      destination: null,
      members: prev.members.map(m => ({ ...m, hasNavigated: false })),
    }));
  }, [state.id, state.isLeader]);

  // Transfer leadership to another member
  const transferLeadership = useCallback(async (newLeaderUserId: string) => {
    if (!state.id || !state.isLeader) return false;

    const { error } = await supabase
      .from('convoys')
      .update({ leader_id: newLeaderUserId })
      .eq('id', state.id);

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
