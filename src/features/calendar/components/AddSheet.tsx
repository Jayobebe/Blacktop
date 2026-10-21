import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Flag, Bell, Timer, Users, Search, Loader2, Check, MapPin, Route as RouteIcon, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import { useTrips, legCount, tripFinished } from '@/features/ride/lib/trips';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { getSavedPOIs } from '@/features/map';
import { searchPlaces, type MapSearchResult } from '@/features/map/lib/placeSearch';
import { addCalendarItem, dayStart, type ReminderType } from '../lib/calendarStore';
import { useCrewEventActions } from '../lib/crewEvents';

type Tab = 'plan' | 'reminder' | 'track' | 'crew';

const PACKING = () => [tr("Helmet"), tr("Leathers or suit"), tr("Gloves"), tr("Boots"), tr("Back protector"), tr("Tyre warmers"), tr("Fuel"), tr("Tools and tyre gauge"), tr("Food and water"), tr("Booking confirmation")];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
const input = 'w-full h-11 rounded-xl bg-background/60 border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-accent/50';

/**
 * Adding to a day (the day's Add, or holding a day): a ride plan (where to,
 * a trip's leg), a reminder (MOT, insurance, tax, tyres, anything; yearly), a
 * Track Day booking with its packing list, or a crew plan everyone in the
 * crew sees (when the server has crew plans).
 */
export function AddSheet({ day, open, onOpenChange, crewPlans }: { day: string; open: boolean; onOpenChange: (o: boolean) => void; crewPlans: boolean }) {
  const [tab, setTab] = useState<Tab>('plan');
  const lang = document.documentElement.lang || undefined;
  const tabs: Array<[Tab, string, typeof Flag]> = [
    ['plan', tr("Ride plan"), Flag],
    ['reminder', tr("Reminder"), Bell],
    ['track', tr("Track Day"), Timer],
    ...(crewPlans ? ([['crew', tr("Crew plan"), Users]] as Array<[Tab, string, typeof Flag]>) : []),
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <SheetHeader className="text-left">
          <SheetTitle>{tr("Add to {0}", [dayStart(day).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })])}</SheetTitle>
          <SheetDescription>{tr("Kept on your phone; a crew plan is shared with that crew.")}</SheetDescription>
        </SheetHeader>
        <div role="tablist" className="mt-3 grid gap-1 rounded-xl border border-accent/40 bg-background/60 p-0.5" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(([id, label, I]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('tall-hit flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-semibold', tab === id ? 'bg-accent text-accent-foreground' : 'text-accent/80')}
            >
              <I className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          {tab === 'plan' && <PlanForm day={day} done={() => onOpenChange(false)} />}
          {tab === 'reminder' && <ReminderForm day={day} done={() => onOpenChange(false)} />}
          {tab === 'track' && <TrackForm day={day} done={() => onOpenChange(false)} />}
          {tab === 'crew' && <CrewForm day={day} done={() => onOpenChange(false)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Where a plan goes: a saved route, a saved place or a search, or a trip's next leg. */
type Where = { kind: 'none' } | { kind: 'route'; id: string; name: string } | { kind: 'place'; lat: number; lng: number; name: string; address?: string } | { kind: 'trip'; id: string; leg: number; name: string };

function WherePicker({ value, onChange, trips = true }: { value: Where; onChange: (w: Where) => void; trips?: boolean }) {
  const routes = useSavedRoutes();
  const open = useTrips().filter((t) => !tripFinished(t) && t.rides.length > 0);
  const saved = getSavedPOIs();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setBusy(true);
      void searchPlaces(q, null, null, null)
        .then((r) => setResults(r.slice(0, 5)))
        .finally(() => setBusy(false));
    }, 450);
    return () => window.clearTimeout(t);
  }, [q]);
  const chip = (on: boolean, label: string, onClick: () => void, Icon: typeof Flag) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        haptics.tick();
        onClick();
      }}
      className={cn('h-9 max-w-full px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border truncate', on ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{label}</span>
    </button>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {chip(value.kind === 'none', tr("Anywhere"), () => onChange({ kind: 'none' }), MapPin)}
        {trips && open.map((t) => chip(value.kind === 'trip' && value.id === t.id, tr("{0}: leg {1} of {2}", [t.name, t.legsDone + 1, legCount(t)]), () => onChange({ kind: 'trip', id: t.id, leg: t.legsDone, name: t.name }), RouteIcon))}
        {routes.map((r) => chip(value.kind === 'route' && value.id === r.id, r.name, () => onChange({ kind: 'route', id: r.id, name: r.name }), RouteIcon))}
        {saved.map((p) => chip(value.kind === 'place' && value.name === p.name, p.name, () => onChange({ kind: 'place', lat: p.lat, lng: p.lng, name: p.name }), Bookmark))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search for a place")} className={cn(input, 'pl-9')} />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <ul className="rounded-xl border border-border overflow-hidden">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ kind: 'place', lat: r.lat, lng: r.lng, name: r.name, address: r.address });
                  setQ('');
                  setResults([]);
                }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/10 border-t border-border/50 first:border-t-0"
              >
                <span className="font-semibold">{r.name}</span>
                {r.address && <span className="block text-[11px] text-muted-foreground truncate">{r.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.kind === 'place' && !saved.some((p) => p.name === value.name) && (
        <p className="text-xs text-accent inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {value.name}</p>
      )}
    </div>
  );
}

function PlanForm({ day, done }: { day: string; done: () => void }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [where, setWhere] = useState<Where>({ kind: 'none' });
  const [notify, setNotify] = useState(true);
  const save = () => {
    const name = title.trim() || (where.kind === 'route' || where.kind === 'trip' ? where.name : where.kind === 'place' ? tr("Ride to {0}", [where.name]) : tr("Ride"));
    addCalendarItem({
      kind: 'plan',
      day,
      time,
      title: name,
      notify,
      routeId: where.kind === 'route' ? where.id : undefined,
      place: where.kind === 'place' ? { lat: where.lat, lng: where.lng, name: where.name, address: where.address } : undefined,
      tripId: where.kind === 'trip' ? where.id : undefined,
      leg: where.kind === 'trip' ? where.leg : undefined,
    });
    toast.success(tr("Added to your calendar"));
    done();
  };
  return (
    <div className="space-y-3">
      <Field label={tr("Name")}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Sunday ride")} maxLength={60} className={input} />
      </Field>
      <Field label={tr("Time")}>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
      </Field>
      <Field label={tr("Where to")}>
        <WherePicker value={where} onChange={setWhere} />
      </Field>
      <Notify value={notify} onChange={setNotify} text={tr("A notification an hour before")} />
      <Button onClick={save} className="w-full h-12 rounded-2xl font-semibold">{tr("Add plan")}</Button>
    </div>
  );
}

function Notify({ value, onChange, text }: { value: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl frost border border-border/60 px-3 py-2.5">
      <span className="flex-1 text-sm">{text}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

function ReminderForm({ day, done }: { day: string; done: () => void }) {
  const [type, setType] = useState<ReminderType>('mot');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [yearly, setYearly] = useState(true);
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(true);
  const types: Array<[ReminderType, string]> = [
    ['mot', tr("MOT / inspection")],
    ['insurance', tr("Insurance renewal")],
    ['tax', tr("Vehicle tax")],
    ['tyres', tr("Tyre swap")],
    ['other', tr("Something else")],
  ];
  const save = () => {
    if (type === 'other' && !title.trim()) return toast.error(tr("Give it a name"));
    addCalendarItem({ kind: 'reminder', day, time: time || undefined, title: type === 'other' ? title.trim() : '', type, yearly, notes: notes.trim() || undefined, notify });
    toast.success(tr("Added to your calendar"));
    done();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {types.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setType(id);
              setYearly(id !== 'other' && id !== 'tyres');
            }}
            className={cn('h-9 px-3 rounded-full text-xs font-semibold border', type === id ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}
          >
            {label}
          </button>
        ))}
      </div>
      {type === 'other' && (
        <Field label={tr("Name")}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={input} />
        </Field>
      )}
      <Field label={tr("Time (optional)")}>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
      </Field>
      <Field label={tr("Notes")}>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={120} className={input} />
      </Field>
      <label className="flex items-center gap-3 rounded-xl frost border border-border/60 px-3 py-2.5">
        <span className="flex-1 text-sm">{tr("Every year on this date")}</span>
        <Switch checked={yearly} onCheckedChange={setYearly} />
      </label>
      <Notify value={notify} onChange={setNotify} text={tr("A notification the day before and on the day")} />
      <Button onClick={save} className="w-full h-12 rounded-2xl font-semibold">{tr("Add reminder")}</Button>
    </div>
  );
}

function TrackForm({ day, done }: { day: string; done: () => void }) {
  const [q, setQ] = useState('');
  const [circuit, setCircuit] = useState<{ name: string; id?: number } | null>(null);
  const [venues, setVenues] = useState<Array<{ name: string; id: number }>>([]);
  const [time, setTime] = useState('08:00');
  const [notify, setNotify] = useState(true);
  const packing = useMemo(PACKING, []);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  // The circuit library (offline, static files), loaded when searched.
  useEffect(() => {
    if (q.trim().length < 2) {
      setVenues([]);
      return;
    }
    let live = true;
    void import('@/features/track/lib/circuitLibrary').then(async (lib) => {
      const all = await lib.loadCircuitIndex();
      if (!live) return;
      setVenues(lib.searchVenues(all, q, null, 6).map((v) => ({ name: v.name, id: v.layouts[0]?.id ?? 0 })));
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [q]);
  const save = () => {
    const name = circuit?.name ?? q.trim();
    if (!name) return toast.error(tr("Pick the circuit"));
    addCalendarItem({ kind: 'track', day, time, title: name, circuit: name, circuitId: circuit?.id, packing: packing.map((item) => ({ item, done: packed.has(item) })), notify });
    toast.success(tr("Added to your calendar"));
    done();
  };
  return (
    <div className="space-y-3">
      <Field label={tr("Circuit")}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent" />
          <input
            value={circuit ? circuit.name : q}
            onChange={(e) => {
              setCircuit(null);
              setQ(e.target.value);
            }}
            placeholder={tr("Search circuits")}
            className={cn(input, 'pl-9')}
          />
        </div>
      </Field>
      {!circuit && venues.length > 0 && (
        <ul className="rounded-xl border border-border overflow-hidden">
          {venues.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => setCircuit(v)} className="w-full text-left px-3 py-2.5 text-sm font-semibold hover:bg-accent/10 border-t border-border/50 first:border-t-0">
                {v.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field label={tr("Time")}>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
      </Field>
      <Field label={tr("Packing list")}>
        <div className="grid grid-cols-2 gap-1">
          {packing.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPacked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })}
              className={cn('min-h-[36px] text-left text-xs rounded-lg px-2 py-1.5 flex items-center gap-1.5 border', packed.has(p) ? 'border-[hsl(150_55%_50%/0.5)]' : 'border-border/60 text-muted-foreground')}
            >
              <Check className={cn('w-3.5 h-3.5 shrink-0', packed.has(p) ? 'text-[hsl(150_55%_55%)]' : 'opacity-25')} /> {p}
            </button>
          ))}
        </div>
      </Field>
      <Notify value={notify} onChange={setNotify} text={tr("A notification the evening before, with what's still to pack")} />
      <Button onClick={save} className="w-full h-12 rounded-2xl font-semibold">{tr("Add Track Day")}</Button>
    </div>
  );
}

function CrewForm({ day, done }: { day: string; done: () => void }) {
  const crew = useCrew();
  const { profile } = useProfile();
  const routes = useSavedRoutes();
  const actions = useCrewEventActions();
  const [code, setCode] = useState(crew.code);
  const [kind, setKind] = useState<'ride' | 'meet'>('ride');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [where, setWhere] = useState<Where>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return toast.error(tr("Give it a name"));
    const [h, m] = time.split(':').map(Number);
    const at = dayStart(day);
    at.setHours(h || 0, m || 0, 0, 0);
    const route = where.kind === 'route' ? routes.find((r) => r.id === where.id) : null;
    setBusy(true);
    const err = await actions.create({
      crewCode: code,
      kind,
      title: title.trim(),
      notes: notes.trim(),
      place: where.kind === 'place' ? { lat: where.lat, lng: where.lng, name: where.name } : route ? { lat: route.from.lat, lng: route.from.lng, name: route.from.name } : null,
      route: route ? [...(route.via ?? []), route.to].map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })) : null,
      startsAt: at,
      creatorName: profile.name || '',
    });
    setBusy(false);
    if (err === 'demo') return;
    if (err) return toast.error(tr("Couldn't post the plan"), { description: err });
    toast.success(tr("Posted to {0}", [crew.crews.find((c) => c.code === code)?.name ?? code]));
    done();
  };
  return (
    <div className="space-y-3">
      <Field label={tr("Crew")}>
        <div className="flex flex-wrap gap-1.5">
          {crew.crews.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCode(c.code)}
              className={cn('h-9 max-w-[48%] px-3 rounded-full text-xs font-semibold border truncate', code === c.code ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-accent/40 bg-background/60 p-0.5">
        {(['ride', 'meet'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cn('tall-hit rounded-lg py-2 text-xs font-semibold', kind === k ? 'bg-accent text-accent-foreground' : 'text-accent/80')}>
            {k === 'ride' ? tr("Group ride") : tr("Meet")}
          </button>
        ))}
      </div>
      <Field label={tr("Name")}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'ride' ? tr("Breakfast run") : tr("Bike night")} maxLength={80} className={input} />
      </Field>
      <Field label={tr("Time")}>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
      </Field>
      <Field label={kind === 'ride' ? tr("Route or meeting point") : tr("Where")}>
        <WherePicker value={where} onChange={setWhere} trips={false} />
      </Field>
      <Field label={tr("Notes")}>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={input} />
      </Field>
      <p className="text-[11px] text-muted-foreground">{tr("Everyone in the crew sees it and can say if they're going. It's taken off a week after.")}</p>
      <Button onClick={() => void save()} disabled={busy} className="w-full h-12 rounded-2xl font-semibold">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("Post to the crew")}
      </Button>
    </div>
  );
}
