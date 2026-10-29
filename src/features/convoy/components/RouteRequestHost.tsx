import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { convoyChannel } from '@/lib/convoyChannel';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { requestMapPlace } from '@/features/map/lib/mapConsole';
import { receiveSharedRoute, setRouteLeading, setRoutePublisher } from '@/features/map/lib/sharedRoute';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { useConvoyState } from '../hooks/useConvoyState';
import {
  addRouteRequest,
  cleanPlace,
  clearRouteRequests,
  dropRouteRequest,
  sendRouteAnswer,
  setRouteRequestChannel,
  useRouteRequests,
  type RouteAnswer,
  type RouteRequest,
} from '../lib/routeRequest';

/**
 * Passengers' requests to go somewhere (lib/routeRequest), mounted once in App:
 * the convoy's channel while in one, and on the leader's phone a card saying
 * who wants to go where, with Twisty, Direct and No thanks. Twisty or Direct
 * opens the map and goes there as a place's own card does (the convoy's route
 * and everyone's guidance); the passenger hears back either way.
 */
export function RouteRequestHost() {
  const { convoy } = useConvoyState();
  const { user, profile } = useProfile();
  const requests = useRouteRequests();
  const me = useRef<string | null>(null);
  me.current = user?.id ?? null;
  const leading = useRef(false);
  leading.current = !!convoy.isLeader;

  useEffect(() => {
    if (!convoy.id) {
      clearRouteRequests();
      return;
    }
    const ch = convoyChannel(`route-request-${convoy.id}`);
    ch.on('broadcast', { event: 'request' }, ({ payload }) => {
      const r = payload as Partial<RouteRequest> | null;
      const place = cleanPlace(r?.place);
      if (!leading.current || !place || typeof r?.id !== 'string' || typeof r?.fromId !== 'string' || r.fromId === me.current) return;
      haptics.heavy();
      addRouteRequest({ id: r.id.slice(0, 80), fromId: r.fromId, fromName: String(r.fromName || tr("Your passenger")).slice(0, 30), place });
    })
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        const a = payload as Partial<RouteAnswer> | null;
        if (!a || a.toId !== me.current) return;
        const who = String(a.fromName || tr("The leader")).slice(0, 30);
        const where = String(a.place || '').slice(0, 80);
        if (a.answer === 'twisty') toast.success(tr("{0} is taking the twisty way to {1}", [who, where]));
        else if (a.answer === 'direct') toast.success(tr("{0} is heading to {1}", [who, where]));
        else if (a.answer === 'no') toast(tr("{0} isn't going to {1} this time", [who, where]));
      })
      // Convoy route sharing (map/lib/sharedRoute): one routing request for the convoy, not one a phone.
      .on('broadcast', { event: 'route' }, ({ payload }) => receiveSharedRoute(payload))
      .subscribe();
    setRouteRequestChannel(ch);
    setRoutePublisher((payload) => void ch.send({ type: 'broadcast', event: 'route', payload }));
    return () => {
      setRoutePublisher(null);
      setRouteRequestChannel(null);
      void supabase.removeChannel(ch);
    };
  }, [convoy.id]);

  // No longer leading (handed over): the requests are for the new leader now.
  useEffect(() => {
    if (!convoy.isLeader) clearRouteRequests();
    setRouteLeading(!!convoy.isLeader);
  }, [convoy.isLeader]);

  const r = requests[requests.length - 1];
  if (!r || !convoy.isLeader) return null;

  const answer = (choice: RouteAnswer['answer']) => {
    haptics.light();
    dropRouteRequest(r.id);
    void sendRouteAnswer({ id: r.id, toId: r.fromId, fromName: profile.name || tr("The leader"), place: r.place.name, answer: choice });
    if (choice === 'no') return;
    // The map goes there as its own Twisty or Direct does: the convoy's route, everyone's guidance.
    openBlacktopMap();
    requestMapPlace({ ...r.place, style: choice });
  };

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[1200] safe-frame-x px-3 pb-[calc(0.75rem+var(--safe-bottom))] flex justify-center pointer-events-none">
      <div role="alertdialog" aria-label={tr("Route request")} className="pointer-events-auto w-full max-w-md rounded-3xl frost-accent border p-4 shadow-2xl animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{tr("{0} would like to go to", [r.fromName])}</p>
            <p className="text-base font-semibold leading-tight truncate">{r.place.name}</p>
            {r.place.address && <p className="text-xs text-muted-foreground truncate">{r.place.address}</p>}
          </div>
          <button type="button" onClick={() => answer('no')} aria-label={tr("No thanks")} className="glove-hit w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => answer('twisty')} className="h-12 rounded-2xl bg-accent text-accent-foreground font-semibold">
            {tr("Twisty")}
          </button>
          <button type="button" onClick={() => answer('direct')} className="h-12 rounded-2xl btn-accent-2 font-semibold">
            {tr("Direct")}
          </button>
        </div>
        <button type="button" onClick={() => answer('no')} className="mt-2 w-full h-11 rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground">
          {tr("No thanks")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
