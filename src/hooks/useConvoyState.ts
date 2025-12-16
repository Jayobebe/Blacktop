import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ConvoyState, ConvoyMemberInfo, ConvoyDestination } from '@/types/convoy';
import { useProfile } from './useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Listener = () => void;
const listeners = new Set<Listener>();

let convoyState: ConvoyState = {
  id: null,
  code: null,
  isLeader: false,
  members: [],
  isActive: false,
  destination: null,
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
        (payload) => {
          const convoy = payload.new as any;
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
            }));
          } else {
            setConvoyState((prev) => ({
              ...prev,
              destination: null,
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
    const { data: membersData } = await supabase
      .from('convoy_members')
      .select(`
        id,
        user_id,
        joined_at,
        has_navigated,
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
      }));

      console.log('[Convoy] Refreshed members:', members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated })));

      setConvoyState((prev) => ({
        ...prev,
        members,
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

    // Add self as member
    const { error: memberError } = await supabase
      .from('convoy_members')
      .insert({
        convoy_id: convoy.id,
        user_id: user.id,
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
    };

    setConvoyState(() => ({
      id: convoy.id,
      code: convoy.code,
      isLeader: true,
      members: [member],
      isActive: true,
      destination: null,
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

    // Add self as member
    const { error: memberError } = await supabase
      .from('convoy_members')
      .insert({
        convoy_id: convoy.id,
        user_id: user.id,
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
    }));

    return true;
  }, []);

  const leaveConvoy = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user && state.id) {
      // Remove self from convoy_members
      await supabase
        .from('convoy_members')
        .delete()
        .eq('convoy_id', state.id)
        .eq('user_id', user.id);

      // If leader, deactivate convoy
      if (state.isLeader) {
        await supabase
          .from('convoys')
          .update({ is_active: false })
          .eq('id', state.id);
      }
    }

    setConvoyState(() => ({
      id: null,
      code: null,
      isLeader: false,
      members: [],
      isActive: false,
      destination: null,
    }));
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

    // Clear destination in database (this triggers realtime for all members)
    await supabase
      .from('convoys')
      .update({
        destination_name: null,
        destination_address: null,
        destination_lat: null,
        destination_lng: null,
        destination_set_at: null,
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

  // Check if all members have navigated
  const allMembersNavigated = state.members.length > 0 && state.members.every(m => m.hasNavigated);

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
    allMembersNavigated,
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
