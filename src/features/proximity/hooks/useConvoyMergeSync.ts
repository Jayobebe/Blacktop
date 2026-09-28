import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import type { ConvoyState } from '@/types/convoy';
import { getProximityState, setProximityState } from '../lib/proximityStore';
import { registerMergeControls, type ConvoyActions } from '../lib/controls';
import type { MergeRecord } from '../types';
import { tr } from '@/lib/i18n';

type Channel = ReturnType<typeof supabase.channel>;

type MergeMessage =
  | { type: 'merge'; fromId: string; hostCode: string; record: MergeRecord }
  | { type: 'unmerge'; fromId: string; mergeId: string };

// One channel per convoy, shared by the hook and announceMerge().
let channel: Channel | null = null;

/** Guest leader → own riders: "follow me into the host convoy". */
export async function announceMergeToConvoy(record: MergeRecord, hostCode: string, fromId: string) {
  if (!channel) return;
  await channel.send({ type: 'broadcast', event: 'merge', payload: { type: 'merge', fromId, hostCode, record } });
}

/**
 * Keeps every convoy member in step with merges, whether or not they opted in
 * to nearby riders themselves: when their leader merges into another convoy
 * they move with them, and on "unmerge" everyone returns to the convoy they
 * came from. Either leader can unmerge.
 */
export function useConvoyMergeSync({
  convoy,
  userId,
  actions,
}: {
  convoy: ConvoyState;
  userId: string | null;
  actions: Pick<ConvoyActions, 'joinConvoy' | 'leaveConvoy' | 'attachRide' | 'getConvoyId'>;
}) {
  const live = useRef({ convoy, userId, actions });
  live.current = { convoy, userId, actions };

  const moveTo = async (code: string, label: string) => {
    const { actions: a } = live.current;
    await a.leaveConvoy(true);
    const ok = await a.joinConvoy(code);
    if (ok) {
      a.attachRide(a.getConvoyId());
      haptics.success();
      toast.success(label);
    } else {
      a.attachRide(null);
      toast.error(tr("Couldn't rejoin the convoy"), { description: tr("You can rejoin with its code from Home.") });
    }
    return ok;
  };

  const handle = async (msg: MergeMessage) => {
    const { userId: uid, convoy: c } = live.current;
    if (!uid || !msg || msg.fromId === uid) return;

    if (msg.type === 'merge') {
      if (!c.id || msg.record?.homeConvoyId !== c.id) return;
      // Only my own leader can move me.
      const { data } = await supabase.from('convoys').select('leader_id').eq('id', c.id).maybeSingle();
      if (!data || data.leader_id !== msg.fromId) return;
      setProximityState({ busy: tr("Merging with {0}'s convoy…", [msg.record.hostName]), merge: { ...msg.record, role: 'guest' } });
      try {
        await moveTo(msg.hostCode, tr("Merged with {0}'s convoy", [msg.record.hostName]));
      } finally {
        setProximityState({ busy: null });
      }
      return;
    }

    if (msg.type === 'unmerge') {
      const record = getProximityState().merge;
      if (!record || record.mergeId !== msg.mergeId) return;
      // Trust my own record of who the two leaders are, not the message.
      if (msg.fromId !== record.hostLeaderId && msg.fromId !== record.homeLeaderId) return;
      if (record.role === 'host') {
        setProximityState({ merge: null });
        toast(tr("{0}'s convoy split off", [record.homeName]));
        return;
      }
      setProximityState({ busy: tr("Returning to {0}'s convoy…", [record.homeName]) });
      try {
        await moveTo(record.homeCode, tr("Back with {0}'s convoy", [record.homeName]));
      } finally {
        setProximityState({ busy: null, merge: null });
      }
    }
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    if (!convoy.id) return;
    const ch = supabase.channel(`prox-convoy:${convoy.id}`);
    ch.on('broadcast', { event: 'merge' }, ({ payload }) => void handleRef.current(payload as MergeMessage))
      .on('broadcast', { event: 'unmerge' }, ({ payload }) => void handleRef.current(payload as MergeMessage))
      .subscribe();
    channel = ch;
    return () => {
      if (channel === ch) channel = null;
      supabase.removeChannel(ch);
    };
  }, [convoy.id]);

  // A merge record only means something while in that merged convoy.
  useEffect(() => {
    const st = getProximityState();
    if (st.merge && convoy.id && convoy.id !== st.merge.hostConvoyId && !st.busy) {
      setProximityState({ merge: null });
    }
  }, [convoy.id]);

  useEffect(() => {
    registerMergeControls({
      unmerge: async () => {
        const record = getProximityState().merge;
        const { userId: uid, convoy: c } = live.current;
        if (!record || !uid || c.id !== record.hostConvoyId || record.role === 'guest') return;
        if (channel) {
          await channel.send({ type: 'broadcast', event: 'unmerge', payload: { type: 'unmerge', fromId: uid, mergeId: record.mergeId } });
        }
        if (record.role === 'host') {
          setProximityState({ merge: null });
          toast.success(tr("Unmerged from {0}'s convoy", [record.homeName]));
          return;
        }
        setProximityState({ busy: 'Unmerging…' });
        try {
          await moveTo(record.homeCode, tr("Unmerged. Back leading your convoy"));
        } finally {
          setProximityState({ busy: null, merge: null });
        }
      },
    });
    return () => registerMergeControls(null);
  }, []);
}
