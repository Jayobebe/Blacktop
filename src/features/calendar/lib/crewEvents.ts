/**
 * Crew plans on the Blacktop Calendar: a ride or a meet one rider puts on a
 * crew's calendar, with who's going. Through the server's functions
 * (`list_crew_events`, `create_crew_event`, `rsvp_crew_event`,
 * `delete_crew_event`; migration 20261028000000_calendar_crew_events.sql,
 * behind the `calendar` server cap), read only while the calendar or the
 * Console is on screen. The last list is kept on the phone
 * (`blacktop_calendar_crew`, left out of backups) so the Console's Up next and
 * the pip can show the next plan without asking again. Demo mode shows made-up
 * plans and saves nothing.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive, useDemoMode } from '@/lib/demoMode';
import { demoBlocked } from '@/lib/demoGuard';
import { useServerCap } from '@/lib/serverCaps';
import { useCrew } from '@/features/crew/useCrew';

export type RsvpStatus = 'going' | 'maybe' | 'no';

export interface CrewEvent {
  id: string;
  crew_code: string;
  kind: 'ride' | 'meet';
  title: string;
  notes: string;
  place_name: string;
  lat: number | null;
  lng: number | null;
  /** A ride's stops and end, in order (the end last). */
  route: Array<{ lat: number; lng: number; name?: string }> | null;
  starts_at: string;
  creator_name: string;
  mine: boolean;
  my_status: RsvpStatus | null;
  going: number;
  maybe: number;
  going_names: string[];
}

const CACHE = 'blacktop_calendar_crew';

export function cachedCrewEvents(): CrewEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function keep(list: CrewEvent[]) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(list.filter((e) => Date.parse(e.starts_at) > Date.now() - 86_400_000).slice(0, 60)));
  } catch {
    /* this launch only */
  }
}

/** Made-up plans for demo mode, a few days out, in the demo crews. */
function demoEvents(): CrewEvent[] {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  return [
    { id: 'demo-ce-1', crew_code: 'SUN4DY', kind: 'ride', title: 'Sunday breakfast run', notes: 'Meet at the café, leave 08:30 sharp.', place_name: 'Devil’s Dyke', lat: 50.8858, lng: -0.2128, route: null, starts_at: at(4, 8, 0), creator_name: 'Marco', mine: false, my_status: 'going', going: 5, maybe: 2, going_names: ['Marco', 'Priya', 'Sam', 'Jules', 'You'] },
    { id: 'demo-ce-2', crew_code: 'CAF3RN', kind: 'meet', title: 'Bike night', notes: '', place_name: 'Ace Cafe', lat: 51.5410, lng: -0.2779, route: null, starts_at: at(9, 19, 0), creator_name: 'Lena', mine: false, my_status: null, going: 11, maybe: 4, going_names: ['Lena', 'Tom', 'Ade'] },
    { id: 'demo-ce-3', crew_code: 'TRK8RT', kind: 'ride', title: 'Charity ride for the air ambulance', notes: 'Donations at the start.', place_name: 'Goodwood', lat: 50.8591, lng: -0.7591, route: null, starts_at: at(16, 10, 0), creator_name: 'Kai', mine: false, my_status: 'maybe', going: 23, maybe: 6, going_names: ['Kai', 'Nia'] },
  ];
}

/** Plans in every crew the rider is in, from `from` to `to`, while `active`. */
export function useCrewEvents(from: Date, to: Date, active: boolean): { events: CrewEvent[]; available: boolean } {
  const crew = useCrew();
  const cap = useServerCap('calendar');
  const { enabled: demo } = useDemoMode();
  const codes = crew.crews.map((c) => c.code).slice(0, 4);
  const on = demo || cap;
  const { data } = useQuery({
    queryKey: ['crew-events', codes.join(','), from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), demo],
    enabled: active && on && codes.length > 0,
    staleTime: 60_000,
    refetchInterval: active ? 120_000 : false,
    queryFn: async () => {
      if (demo) return demoEvents().filter((e) => codes.includes(e.crew_code));
      const { data, error } = await (supabase as any).rpc('list_crew_events', { _crew_codes: codes, _from: from.toISOString(), _to: to.toISOString() });
      if (error) throw error;
      const list = (data ?? []) as CrewEvent[];
      keep(list);
      return list;
    },
  });
  return { events: data ?? (on && !demo ? cachedCrewEvents().filter((e) => codes.includes(e.crew_code)) : []), available: on };
}

export interface NewCrewEvent {
  crewCode: string;
  kind: 'ride' | 'meet';
  title: string;
  notes: string;
  place: { lat: number; lng: number; name: string } | null;
  route: Array<{ lat: number; lng: number; name?: string }> | null;
  startsAt: Date;
  creatorName: string;
}

export function useCrewEventActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['crew-events'] });
  return {
    create: async (e: NewCrewEvent): Promise<string | null> => {
      if (demoBlocked()) return 'demo';
      const { error } = await (supabase as any).rpc('create_crew_event', {
        _crew_code: e.crewCode,
        _kind: e.kind,
        _title: e.title,
        _notes: e.notes,
        _place_name: e.place?.name ?? '',
        _lat: e.place?.lat ?? null,
        _lng: e.place?.lng ?? null,
        _route: e.route,
        _starts_at: e.startsAt.toISOString(),
        _creator_name: e.creatorName,
      });
      refresh();
      return error ? error.message : null;
    },
    rsvp: async (id: string, status: RsvpStatus, name: string): Promise<string | null> => {
      if (demoBlocked()) return 'demo';
      const { error } = await (supabase as any).rpc('rsvp_crew_event', { _id: id, _status: status, _display_name: name });
      refresh();
      return error ? error.message : null;
    },
    remove: async (id: string): Promise<string | null> => {
      if (demoBlocked()) return 'demo';
      const { error } = await (supabase as any).rpc('delete_crew_event', { _id: id });
      refresh();
      return error ? error.message : null;
    },
  };
}

/** The next crew plan this rider is going to (or may), from what's kept: for the Console without a fetch. */
export function nextCrewPlan(now = Date.now()): CrewEvent | null {
  const list = isDemoModeActive() ? demoEvents() : cachedCrewEvents();
  return list.filter((e) => Date.parse(e.starts_at) > now && (e.my_status === 'going' || e.my_status === 'maybe')).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;
}
