import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import { sessionUser } from '@/lib/sessionUser';
import { END_EVENT, LIVE_EVENT, RIDER_EVENT, SEND_EVERY_MS, SLOW_EVERY_MS, spectateChannelName, type LiveRide, type SpectatorPresence } from '../lib/live';

export interface Spectator {
  key: string;
  name: string;
}

/**
 * The riders' half of spectating (see lib/live.ts). On a ride in a convoy
 * listed in Crew Convoys (an unlocked lobby, solo or group), every rider's
 * phone joins the convoy's spectate channel to see who is watching: each
 * spectator is listed (as a spectator, never a rider or passenger) and
 * announced once by name ("Sam is spectating"). While at least one crew
 * member is watching, every rider's phone sends its own ride: the leader's
 * (the solo rider's) every 2 s on the old event, anyone else's every 2 s if a
 * spectator is following them and every 6 s if not; nothing is sent while
 * nobody watches. Whether the convoy is listed is read once. Off in demo mode.
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
    let me: string | null = null;
    /** A spectator is following this rider (an older spectator app follows the leader). */
    let followed = false;
    let tick = 0;
    const announced = new Set<string>();

    void (async () => {
      const { data } = await supabase.from('convoys').select('is_listed').eq('id', convoyId).maybeSingle();
      if (gone || !(data as { is_listed?: boolean } | null)?.is_listed) return;
      me = (await sessionUser())?.id ?? null;
      if (gone) return;
      const ch = supabase.channel(spectateChannelName(convoyId), { config: { broadcast: { self: false } } });
      channel = ch;
      const send = (now = false) => {
        if (count === 0) return;
        tick++;
        const leading = leadingRef.current;
        // Nobody following this rider: a beat in three, just for their pin.
        if (!leading && !followed && !now && tick % Math.round(SLOW_EVERY_MS / SEND_EVERY_MS) !== 0) return;
        const live = liveRef.current();
        if (!live) return;
        void ch.send({ type: 'broadcast', event: leading ? LIVE_EVENT : RIDER_EVENT, payload: { ...live, rider: me ?? undefined } });
      };
      const sync = () => {
        const state = ch.presenceState<SpectatorPresence>();
        const list = Object.entries(state).map(([key, metas]) => ({ key, name: metas[0]?.name || tr("A crew member") }));
        count = list.length;
        followed = Object.values(state).some((metas) => {
          const f = metas[0]?.following;
          return f ? f === me : leadingRef.current;
        });
        setSpectators(list);
        for (const s of list) {
          if (announced.has(s.key)) continue;
          announced.add(s.key);
          toast(tr("{0} is spectating", [s.name]));
          eventSound('radioIn');
          // Someone just arrived: they shouldn't wait for the next beat.
          window.setTimeout(() => send(true), 300);
        }
      };
      ch.on('presence', { event: 'sync' }, sync);
      ch.subscribe();
      timer = window.setInterval(() => send(), SEND_EVERY_MS);
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
