import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import { END_EVENT, LIVE_EVENT, SEND_EVERY_MS, spectateChannelName, type LiveRide, type SpectatorPresence } from '../lib/live';

export interface Spectator {
  key: string;
  name: string;
}

/**
 * The riders' half of spectating (see lib/live.ts). On a ride in a convoy
 * listed in Crew Convoys (an unlocked lobby, solo or group), every rider's
 * phone joins the convoy's spectate channel to see who is watching: each
 * spectator is listed (as a spectator, never a rider or passenger) and
 * announced once by name ("Sam is spectating"). The leader's phone (the solo
 * rider's, on a solo ride) also sends the ride every 2 s while at least one
 * crew member is watching; nothing is sent while nobody is. Whether the
 * convoy is listed is read once. Off in demo mode.
 */
export function useSpectateBroadcast(convoyId: string | null, active: boolean, leading: boolean, getLive: () => LiveRide | null): Spectator[] {
  const [spectators, setSpectators] = useState<Spectator[]>([]);
  const liveRef = useRef(getLive);
  liveRef.current = getLive;
  const leadingRef = useRef(leading);
  leadingRef.current = leading;

  useEffect(() => {
    if (!convoyId || !active || isDemoModeActive()) return;
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer = 0;
    let count = 0;
    const announced = new Set<string>();

    void (async () => {
      const { data } = await supabase.from('convoys').select('is_listed').eq('id', convoyId).maybeSingle();
      if (gone || !(data as { is_listed?: boolean } | null)?.is_listed) return;
      const ch = supabase.channel(spectateChannelName(convoyId), { config: { broadcast: { self: false } } });
      channel = ch;
      const send = () => {
        if (count === 0 || !leadingRef.current) return;
        const live = liveRef.current();
        if (live) void ch.send({ type: 'broadcast', event: LIVE_EVENT, payload: live });
      };
      const sync = () => {
        const state = ch.presenceState<SpectatorPresence>();
        const list = Object.entries(state).map(([key, metas]) => ({ key, name: metas[0]?.name || tr("A crew member") }));
        count = list.length;
        setSpectators(list);
        for (const s of list) {
          if (announced.has(s.key)) continue;
          announced.add(s.key);
          toast(tr("{0} is spectating", [s.name]));
          eventSound('radioIn');
          // Someone just arrived: they shouldn't wait for the next beat.
          window.setTimeout(send, 300);
        }
      };
      ch.on('presence', { event: 'sync' }, sync);
      ch.subscribe();
      timer = window.setInterval(send, SEND_EVERY_MS);
    })();

    return () => {
      gone = true;
      window.clearInterval(timer);
      setSpectators([]);
      if (channel) {
        const ch = channel;
        // The ride is over: tell anyone watching (the leader's phone says it).
        const bye = leadingRef.current ? ch.send({ type: 'broadcast', event: END_EVENT, payload: {} }) : Promise.resolve();
        void bye.finally(() => supabase.removeChannel(ch));
      }
    };
  }, [convoyId, active]);

  return spectators;
}
