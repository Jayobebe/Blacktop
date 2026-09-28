import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

/**
 * Regroup call: a convoy-wide "riders are behind, ease off and regroup"
 * broadcast. One realtime channel per convoy, opened by useRegroupListener
 * (mounted by the ride screen); sendRegroup() reuses it so the map's status
 * bar can send without opening a second channel on the same topic.
 */

export interface RegroupCall {
  fromUserId: string;
  fromName: string;
  behindNames: string[];
  sentAt: number;
}

// Same spam guard as rescue: at most one regroup call per device per minute.
const REGROUP_COOLDOWN_MS = 60_000;

let channel: ReturnType<typeof supabase.channel> | null = null;
let lastSentAt = 0;

export function describeRegroup(behindNames: string[], withAdvice = true): string {
  const advice = withAdvice ? ' Ease off and regroup.' : '';
  if (behindNames.length === 0) return 'Ease off and regroup.';
  if (behindNames.length === 1) return `${behindNames[0]} is behind.${advice}`;
  if (behindNames.length === 2) return `${behindNames[0]} and ${behindNames[1]} are behind.${advice}`;
  return `${behindNames.length} riders are behind.${advice}`;
}

export async function sendRegroup(call: Omit<RegroupCall, 'sentAt'>): Promise<boolean> {
  if (!channel) {
    toast.error(tr("Not connected to the convoy"));
    return false;
  }
  const now = Date.now();
  if (now - lastSentAt < REGROUP_COOLDOWN_MS) {
    toast.error(tr("Regroup already sent. Try again in {0}s", [Math.ceil((REGROUP_COOLDOWN_MS - (now - lastSentAt)) / 1000)]));
    return false;
  }
  lastSentAt = now;
  await channel.send({ type: 'broadcast', event: 'regroup', payload: { ...call, sentAt: now } });
  toast.success(tr("Regroup sent to convoy"));
  return true;
}

export function useRegroupListener(convoyId: string | null, userId: string | null) {
  useEffect(() => {
    if (!convoyId) return;

    const ch = supabase.channel(`regroup-${convoyId}`);
    ch.on('broadcast', { event: 'regroup' }, async ({ payload }) => {
      const call = payload as RegroupCall;
      if (!call?.fromUserId || call.fromUserId === userId) return;

      // Broadcast channels are open to anyone who knows the topic: only
      // surface calls from actual members of this convoy.
      const { data: member } = await supabase
        .from('convoy_members')
        .select('user_id')
        .eq('convoy_id', convoyId)
        .eq('user_id', call.fromUserId)
        .maybeSingle();
      if (!member) return;

      const names = Array.isArray(call.behindNames) ? call.behindNames.map(String).slice(0, 8) : [];
      haptics.heavy();
      toast.warning(tr("Regroup: {0}", [String(call.fromName || 'Convoy').slice(0, 30)]), {
        description: describeRegroup(names),
        duration: 12000,
      });
    }).subscribe();

    channel = ch;
    return () => {
      if (channel === ch) channel = null;
      supabase.removeChannel(ch);
    };
  }, [convoyId, userId]);
}
