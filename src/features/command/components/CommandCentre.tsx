import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Pencil, Bell, LifeBuoy, Users, Trophy, Wrench, CloudRain, TriangleAlert, Sparkles, Timer, Plus, Check,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Navigation, Route, Play, Map as MapIcon, Bike, ShieldCheck, SlidersHorizontal,
  Radio, LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSettings } from '@/features/settings';
import { useHoldTap } from '@/hooks/useHoldTap';
import { RESCUE_HOLD_MS } from '@/features/rescue';
import { useInbox, markInboxRead, removeInboxItem, clearInbox, type InboxItem, type InboxKind } from '@/lib/inbox';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { requestMapSearch } from '@/features/map/lib/mapCommand';
import { getRecentLocations } from '@/features/map/lib/placeSearch';
import { useRideHistory } from '@/features/ride';
import { useActions, defaultQuickActions, groupLabel, GROUP_ORDER, type CommandAction, type ActionGroup } from '../lib/useActions';
import { useChosenQuickActions, setQuickActions, rowSizes, MAX_QUICK_ACTIONS } from '../lib/quickActions';

/**
 * Blacktop Command: the card left of Home. One search for everything (actions,
 * settings, places, past rides, or the map for anything else), up to nine
 * quick actions the rider chooses (three to a row at most, a short row
 * stretching across), and the notifications kept on the phone. `active` is
 * true while it's the card on screen: the notifications count as read then.
 */
export function CommandCentre({ active, footer }: { active: boolean; footer?: ReactNode }) {
  const actions = useActions();
  const byId = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions]);
  const chosen = useChosenQuickActions();
  const ids = (chosen ?? defaultQuickActions(actions)).filter((id) => byId.has(id));
  const tiles = ids.map((id) => byId.get(id)!);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const inbox = useInbox();

  // Seen once it's been on screen a moment.
  useEffect(() => {
    if (!active || !inbox.unread) return;
    const t = window.setTimeout(markInboxRead, 1500);
    return () => window.clearTimeout(t);
  }, [active, inbox.unread]);
  // Off the card, the search is put away.
  useEffect(() => {
    if (!active) setQuery('');
  }, [active]);

  const { updateSetting } = useSettings();
  /** A gated action waiting on the rider's yes: added (from the picker) or run (a tile) once its features are on. */
  const [gated, setGated] = useState<{ action: CommandAction; then: 'add' | 'run' } | null>(null);
  const run = (a: CommandAction) => {
    haptics.tick();
    if (a.needs) return setGated({ action: a, then: 'run' });
    void a.run();
  };
  const switchOn = () => {
    if (!gated) return;
    const { action: a, then } = gated;
    a.needs?.keys.forEach((k) => updateSetting(k, true));
    setGated(null);
    if (then === 'add') {
      if (ids.length < MAX_QUICK_ACTIONS) keep([...ids, a.id]);
    } else {
      // Next frame: the screens it opens read the setting just switched on.
      requestAnimationFrame(() => void a.run());
    }
  };

  let i = 0;
  const rows = rowSizes(tiles.length).map((n) => tiles.slice(i, (i += n)));

  return (
    <div className="flex-1 min-h-0 flex flex-col animate-fade-in">
      <header className="mb-3 landscape:mb-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5 landscape:hidden">Blacktop</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{tr("Blacktop Command")}</h1>
      </header>

      <label className="relative block mb-3 landscape:mb-2">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("Search Blacktop")}
          aria-label={tr("Search Blacktop")}
          enterKeyHint="search"
          className="w-full h-12 rounded-2xl frost-accent bg-card/80 pl-10 pr-11 text-[15px] outline-none focus:ring-2 focus:ring-accent/50"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={tr("Clear")} className="glove-hit absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </label>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2" data-no-pull>
        {query.trim() ? (
          <SearchResults query={query.trim()} actions={actions} onRun={run} onDone={() => setQuery('')} />
        ) : (
          <>
            {/* Quick actions */}
            <section aria-labelledby="qa-heading" className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h2 id="qa-heading" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Quick actions")}</h2>
                <button type="button" onClick={() => setEditing(true)} className="glove-hit inline-flex items-center gap-1 text-xs font-medium text-accent">
                  <Pencil className="w-3.5 h-3.5" /> {tr("Edit")}
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((row, r) => (
                  <div key={r} className="flex gap-2">
                    {row.map((a) => (
                      <ActionTile key={a.id} action={a} onRun={() => run(a)} />
                    ))}
                  </div>
                ))}
                {/* A thin row to add one, until there are nine. */}
                {tiles.length < MAX_QUICK_ACTIONS && (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="pressable w-full h-11 rounded-xl border border-dashed border-accent/50 text-accent text-[13px] font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> {tr("Add a quick action")}
                  </button>
                )}
              </div>
            </section>

            {/* Notifications */}
            <section aria-labelledby="nc-heading">
              <div className="flex items-center justify-between mb-2">
                <h2 id="nc-heading" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Notifications")}</h2>
                {inbox.items.length > 0 && (
                  <button type="button" onClick={clearInbox} className="glove-hit text-xs font-medium text-muted-foreground hover:text-foreground">
                    {tr("Clear all")}
                  </button>
                )}
              </div>
              {inbox.items.length === 0 ? (
                <p className="rounded-2xl frost p-4 text-sm text-muted-foreground text-center">{tr("No notifications yet.")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {inbox.items.map((n) => (
                    <NotificationRow key={n.id} item={n} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      {footer}

      <QuickActionsEditor open={editing} onOpenChange={setEditing} actions={actions} ids={ids} />
      <QuickActionPicker
        open={adding}
        onOpenChange={setAdding}
        actions={actions}
        ids={ids}
        onGated={(a) => {
          setAdding(false);
          setGated({ action: a, then: 'add' });
        }}
      />

      {/* An action whose feature is off in Settings: switch it on, and it works straight away. */}
      <AlertDialog open={!!gated} onOpenChange={(o) => !o && setGated(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{gated ? tr("Turn on {0}?", [gated.action.needs?.name ?? '']) : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {gated ? tr("This quick action needs {0}, which is off in Settings. Turn it on and it works straight away.", [gated.action.needs?.name ?? '']) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Not now")}</AlertDialogCancel>
            <AlertDialogAction onClick={switchOn}>{tr("Turn on")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionTile({ action: a, onRun }: { action: CommandAction; onRun: () => void }) {
  const Icon = a.Icon;
  // A held action (rescue) fills as it's held; a tap does its onTap instead.
  const hold = useHoldTap(() => a.onTap?.(), onRun, RESCUE_HOLD_MS);
  return (
    <button
      type="button"
      {...(a.hold ? hold.handlers : { onClick: onRun })}
      aria-pressed={a.on === undefined ? undefined : a.on}
      className={cn(
        'pressable flex-1 min-w-0 min-h-[76px] rounded-2xl border px-3 py-2.5 flex flex-col items-start justify-between gap-1.5 text-left transition-colors',
        a.on ? 'bg-accent/15 border-accent/70' : 'frost border-border/60',
        a.hold && 'hold-target relative overflow-hidden',
        a.hold && a.on && 'bg-[hsl(var(--burn)/0.15)] border-[hsl(var(--burn)/0.7)] animate-pulse',
      )}
    >
      {a.hold && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-[hsl(var(--burn)/0.3)] pointer-events-none"
          style={{ height: hold.holding ? '100%' : '0%', transition: hold.holding ? `height ${RESCUE_HOLD_MS}ms linear` : 'height 150ms ease-out' }}
        />
      )}
      <Icon className={cn('w-5 h-5 shrink-0', a.burn ? 'text-[hsl(var(--burn))]' : !a.color && 'text-accent')} style={a.color ? { color: a.color } : undefined} />
      <span className="w-full min-w-0">
        <span className="block text-[13px] font-semibold leading-tight line-clamp-2 break-words">{a.label}</span>
        {a.needs ? (
          <span className="block text-[11px] leading-tight mt-0.5 truncate text-muted-foreground">{tr("Needs {0}", [a.needs.name])}</span>
        ) : (
          a.caption && <span className={cn('block text-[11px] leading-tight mt-0.5 truncate', a.on ? 'text-accent' : 'text-muted-foreground')}>{a.caption}</span>
        )}
      </span>
    </button>
  );
}

const KIND_ICON: Record<InboxKind, typeof Bell> = {
  rescue: LifeBuoy,
  convoy: Users,
  crew: Trophy,
  service: Wrench,
  weather: CloudRain,
  hazard: TriangleAlert,
  cards: Sparkles,
  track: Timer,
  general: Bell,
};

function ago(at: number): string {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return tr("just now");
  if (s < 3600) return tr("{0} min ago", [Math.floor(s / 60)]);
  if (s < 86400) return tr("{0} h ago", [Math.floor(s / 3600)]);
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function NotificationRow({ item: n }: { item: InboxItem }) {
  const navigate = useNavigate();
  const Icon = KIND_ICON[n.kind] ?? Bell;
  const open = () => {
    if (!n.url) return;
    haptics.tick();
    navigate(n.url);
  };
  return (
    <li className="flex items-start gap-3 rounded-2xl frost p-3">
      <span className={cn('mt-0.5 shrink-0 rounded-lg p-1.5', n.kind === 'rescue' ? 'bg-[hsl(var(--burn)/0.15)]' : 'bg-accent/10')}>
        <Icon className={cn('w-4 h-4', n.kind === 'rescue' ? 'text-[hsl(var(--burn))]' : 'text-accent')} />
      </span>
      <button type="button" onClick={open} disabled={!n.url} className="flex-1 min-w-0 text-left disabled:cursor-default">
        <span className="flex items-center gap-1.5">
          {!n.read && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
          <span className="text-sm font-semibold leading-snug break-words">{n.title}</span>
        </span>
        {n.body && <span className="block text-xs text-muted-foreground leading-snug mt-0.5 break-words">{n.body}</span>}
        <span className="block text-[10px] text-muted-foreground/80 mt-1">{ago(n.at)}</span>
      </button>
      <button type="button" onClick={() => removeInboxItem(n.id)} aria-label={tr("Remove")} className="glove-hit p-1 text-muted-foreground/70 hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

/** Folded for matching: lower case, accents off, so "cafe" finds "Café". */
const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function SearchResults({ query, actions, onRun, onDone }: { query: string; actions: CommandAction[]; onRun: (a: CommandAction) => void; onDone: () => void }) {
  const navigate = useNavigate();
  const { rides } = useRideHistory();
  const q = fold(query);
  const hit = (...parts: (string | undefined)[]) => parts.some((p) => p && fold(p).includes(q));

  const found = actions.filter((a) => hit(a.label, a.caption, groupLabel(a.group))).slice(0, 12);
  const savedNames = new Set(actions.filter((a) => a.id.startsWith('nav.to:')).map((a) => a.label));
  const recent = getRecentLocations()
    .filter((p) => !savedNames.has(p.name) && hit(p.name, p.address))
    .slice(0, 5);
  const pastRides = rides.filter((r) => hit(r.name)).slice(0, 5);

  const Row = ({ icon, label, caption, onClick }: { icon: ReactNode; label: string; caption?: string; onClick: () => void }) => (
    <li>
      <button
        type="button"
        onClick={() => {
          haptics.tick();
          onClick();
          onDone();
        }}
        className="pressable w-full flex items-center gap-3 rounded-2xl frost p-3 text-left min-h-12"
      >
        <span className="shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{label}</span>
          {caption && <span className="block text-[11px] text-muted-foreground truncate">{caption}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <ul className="space-y-1.5">
      {found.map((a) => {
        const Icon = a.Icon;
        return (
          <Row
            key={a.id}
            icon={<Icon className={cn('w-5 h-5', a.burn ? 'text-[hsl(var(--burn))]' : !a.color && 'text-accent')} style={a.color ? { color: a.color } : undefined} />}
            label={a.label}
            caption={[groupLabel(a.group), a.caption].filter(Boolean).join(' · ')}
            onClick={() => onRun(a)}
          />
        );
      })}
      {recent.map((p) => (
        <Row
          key={p.id}
          icon={<Navigation className="w-5 h-5 text-accent" />}
          label={p.name}
          caption={[tr("Navigate"), p.address].filter(Boolean).join(' · ')}
          onClick={() => openBlacktopMap({ lat: p.lat, lng: p.lng, name: p.name, address: p.address })}
        />
      ))}
      {pastRides.map((r) => (
        <Row
          key={r.id}
          icon={<Route className="w-5 h-5 text-accent" />}
          label={r.name!}
          caption={[tr("Rides"), new Date(r.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })].join(' · ')}
          onClick={() => navigate(`/ride/${r.id}`)}
        />
      ))}
      {/* Anything else: the map's own search. */}
      <Row
        icon={<Search className="w-5 h-5 text-accent" />}
        label={tr("Search the map for “{0}”", [query])}
        onClick={() => {
          openBlacktopMap();
          requestMapSearch({ query });
        }}
      />
    </ul>
  );
}

/** Taking a set of quick actions: a light buzz, and the order kept. */
function keep(next: string[]) {
  haptics.tick();
  setQuickActions(next);
}

/** Edit: the chosen quick actions in order, to move up or down or take off. */
function QuickActionsEditor({ open, onOpenChange, actions, ids }: { open: boolean; onOpenChange: (o: boolean) => void; actions: CommandAction[]; ids: string[] }) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    keep(next);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom">
        <SheetHeader className="text-left">
          <SheetTitle>{tr("Quick actions")}</SheetTitle>
          <SheetDescription>{tr("Up to {0}, three to a row. Add what you reach for most.", [MAX_QUICK_ACTIONS])}</SheetDescription>
        </SheetHeader>
        <ol className="mt-3 space-y-1.5">
          {ids.map((id, i) => {
            const a = byId.get(id)!;
            const Icon = a.Icon;
            return (
              <li key={id} className="flex items-center gap-2 rounded-xl frost border border-border/60 pl-3 pr-1 py-1">
                <Icon className={cn('w-4 h-4 shrink-0', a.burn ? 'text-[hsl(var(--burn))]' : !a.color && 'text-accent')} style={a.color ? { color: a.color } : undefined} />
                <span className="flex-1 min-w-0 text-sm font-medium truncate">
                  {a.label}
                  {a.caption && a.on === undefined && <span className="text-muted-foreground font-normal"> · {a.caption}</span>}
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr("Move up")} className="glove-hit p-2 disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={tr("Move down")} className="glove-hit p-2 disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => keep(ids.filter((x) => x !== id))} aria-label={tr("Remove")} className="glove-hit p-2 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

const GROUP_ICON: Record<ActionGroup, typeof Bell> = {
  ride: Play,
  places: MapIcon,
  vehicles: Bike,
  safety: ShieldCheck,
  settings: SlidersHorizontal,
  radio: Radio,
  screens: LayoutGrid,
};

/**
 * Adding one: first the kind (Ride, Map, Vehicles, Safety, Settings, Radio,
 * Shortcuts, with how many there are to add), then the action; picking it adds
 * it to the end and closes, so it's there on Command straight away.
 */
function QuickActionPicker({
  open,
  onOpenChange,
  actions,
  ids,
  onGated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actions: CommandAction[];
  ids: string[];
  /** Picked an action whose feature is off: Command asks to switch it on, then adds it. */
  onGated: (a: CommandAction) => void;
}) {
  const [group, setGroup] = useState<ActionGroup | null>(null);
  useEffect(() => {
    if (!open) setGroup(null);
  }, [open]);
  const free = actions.filter((a) => !ids.includes(a.id));
  const list = group ? free.filter((a) => a.group === group) : [];
  const add = (a: CommandAction) => {
    if (ids.length >= MAX_QUICK_ACTIONS) return void toast(tr("Up to {0} quick actions", [MAX_QUICK_ACTIONS]));
    if (a.needs) return onGated(a);
    keep([...ids, a.id]);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            {group && (
              <button type="button" onClick={() => setGroup(null)} aria-label={tr("Back")} className="glove-hit -ml-1 p-1 text-accent">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {group ? groupLabel(group) : tr("Add a quick action")}
          </SheetTitle>
          <SheetDescription>
            {tr("{0} of {1} in use.", [ids.length, MAX_QUICK_ACTIONS])}
          </SheetDescription>
        </SheetHeader>

        {!group ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {GROUP_ORDER.map((g) => {
              const n = free.filter((a) => a.group === g).length;
              if (!actions.some((a) => a.group === g)) return null;
              const Icon = GROUP_ICON[g];
              return (
                <button
                  key={g}
                  type="button"
                  disabled={n === 0}
                  onClick={() => setGroup(g)}
                  className="pressable flex items-center gap-3 rounded-2xl frost border border-border/60 p-3 min-h-14 text-left disabled:opacity-40"
                >
                  <Icon className="w-5 h-5 text-accent shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{groupLabel(g)}</span>
                    <span className="block text-[11px] text-muted-foreground">{n}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {list.map((a) => {
              const Icon = a.Icon;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => add(a)} className="pressable w-full flex items-center gap-3 rounded-2xl frost border border-border/60 p-3 min-h-12 text-left">
                    <Icon className={cn('w-5 h-5 shrink-0', a.burn ? 'text-[hsl(var(--burn))]' : !a.color && 'text-accent')} style={a.color ? { color: a.color } : undefined} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{a.label}</span>
                      {a.needs ? (
                        <span className="block text-[11px] text-muted-foreground truncate">{tr("Needs {0}", [a.needs.name])}</span>
                      ) : (
                        a.caption && <span className="block text-[11px] text-muted-foreground truncate">{a.caption}</span>
                      )}
                    </span>
                    <Plus className="w-4 h-4 text-accent shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
