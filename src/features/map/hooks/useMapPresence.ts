import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConvoyId } from '@/features/convoy';
import { useProfile } from '@/features/profile';

// Tracks which convoy members currently have Blacktop Maps selected as their
// nav app, via a presence channel (no DB write) — a member's marker only
// shows up on the map while their app is open with that preference, the same
// way the rest of the app treats ephemeral state (e.g. voice "is speaking").
type Listener = () => void;
const listeners = new Set<Listener>();

let presentUserIds: Set<string> = new Set();

function getSnapshot(): Set<string> {
  return presentUserIds;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPresentUserIds(next: Set<string>) {
  presentUserIds = next;
  listeners.forEach((l) => l());
}

// Side-effecting half: subscribes to the convoy's map-presence channel and
// announces this device if Blacktop Maps is the rider's chosen nav app. Mount
// this exactly once (e.g. in App.tsx) — multiple mounts would open duplicate
// realtime subscriptions.
export function useMapPresenceTracker() {
  const convoyId = useConvoyId();
  const { profile, user } = useProfile();
  const userId = user?.id;
  const prefersBlacktopMap = profile.preferredNavApp === 'blacktop';

  useEffect(() => {
    if (!convoyId || !userId) {
      setPresentUserIds(new Set());
      return;
    }

    const channel = supabase.channel(`map-presence:${convoyId}`, {
      config: { presence: { key: userId } },
    });

    const syncFromPresenceState = () => {
      setPresentUserIds(new Set(Object.keys(channel.presenceState())));
    };

    channel
      .on('presence', { event: 'sync' }, syncFromPresenceState)
      .on('presence', { event: 'join' }, syncFromPresenceState)
      .on('presence', { event: 'leave' }, syncFromPresenceState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && prefersBlacktopMap) {
          await channel.track({ userId });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setPresentUserIds(new Set());
    };
  }, [convoyId, userId, prefersBlacktopMap]);
}

// Read-only half: returns the set of userIds currently visible on the
// in-app map. Safe to call from anywhere (e.g. BlacktopMap).
export function useMapPresentUserIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
