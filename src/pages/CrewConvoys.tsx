import { useSettings } from '@/features/settings';
import { challengeScore, type CrewUnits } from '@/features/crew/challenges';
import { useDemoMode } from '@/lib/demoMode';
import { demoCrewConvoyDetail, demoCrewConvoys } from '@/features/crew/demo';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, Crown, Users, MapPin, X, RefreshCw, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ListSkeleton } from '@/components/skeletons';
import { supabase } from '@/integrations/supabase/client';
import { useCrew } from '@/features/crew/useCrew';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';
import { PEAK_HIDDEN } from '@/features/ride';
import { toast } from 'sonner';
import { useConvoyState } from '@/features/convoy';
import { setRideRole } from '@/features/pillion';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { demoBlocked } from '@/lib/demoGuard';
import { PageTips } from '@/features/guide';

interface CrewConvoyRow {
  id: string;
  code: string;
  name: string;
  leader_name: string;
  member_count: number;
  destination_name: string | null;
  destination_address: string | null;
  is_riding: boolean;
  created_at: string;
}

interface DetailRow {
  member_name: string;
  is_leader: boolean;
  lat: number | null;
  lng: number | null;
  top_speed: number | null;
  distance_driven: number | null;
}

export default function CrewConvoys() {
  const navigate = useNavigate();
  const crew = useCrew();
  const [selected, setSelected] = useState<CrewConvoyRow | null>(null);
  const { settings } = useSettings();
  const units: CrewUnits = { distance: settings.distanceUnit, speed: settings.speedUnit };

  const { enabled: demo } = useDemoMode();
  const { data: convoys = [], isFetching, isLoading, refetch } = useQuery({
    queryKey: ['crew-convoys', crew.code, demo],
    queryFn: async () => {
      if (demo) return demoCrewConvoys(crew.code) as CrewConvoyRow[];
      const { data } = await (supabase as any).rpc('list_crew_convoys', { _crew_code: crew.code });
      return (data ?? []) as CrewConvoyRow[];
    },
    refetchInterval: 60000,
  });

  const { data: detail = [] } = useQuery({
    queryKey: ['crew-convoy-detail', selected?.id, demo],
    enabled: !!selected,
    queryFn: async () => {
      if (demo) return demoCrewConvoyDetail(selected!.id) as DetailRow[];
      const { data } = await (supabase as any).rpc('crew_convoy_detail', { _convoy_id: selected!.id });
      return (data ?? []) as DetailRow[];
    },
    refetchInterval: 30000,
  });

  const leader = detail.find((d) => d.is_leader);

  // Joins straight from the list: no trip to the join page with a code to remember.
  const locked = useDemoLocked();
  const { joinConvoy } = useConvoyState();
  const [joining, setJoining] = useState(false);
  const join = async (code: string) => {
    if (joining || demoBlocked()) return;
    setJoining(true);
    try {
      if (await joinConvoy(code)) {
        // Operator or passenger, as set on Home's Join Convoy tile.
        let pillion = false;
        try { pillion = localStorage.getItem('bt.join_role') === 'pillion'; } catch { /* storage unavailable */ }
        setRideRole(pillion ? 'pillion' : 'operator');
        toast.success(tr("Joined convoy successfully"));
        navigate('/lobby');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-dvh safe-top safe-bottom px-4 pt-4 pb-8">
      <PageHeader
        title={tr("Crew Convoys")}
        backTo="/world"
        backLabel={tr("Back to Blacktop World")}
        right={
          <HeaderButton onClick={() => refetch()} aria-label={tr("Refresh crew convoys")}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </HeaderButton>
        }
      />

      <PageTips
        page="crew-convoys"
        when={!selected}
        tips={[{ target: '[data-tip="crew-convoy"]', text: tr("Tap a convoy to see who's in it. Join it, or Spectate to watch it live on the map without joining.") }]}
      />

      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        {crew.name} · {convoys.length === 1 ? tr("1 open lobby") : tr("{0} open lobbies", [convoys.length])}
      </p>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : convoys.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 py-10 text-center">
          {tr("No unlocked convoys in your crew right now. Unlock a lobby to list it here.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {convoys.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                data-tip={i === 0 ? 'crew-convoy' : undefined}
                onClick={() => setSelected(c)}
                className="w-full text-left px-4 py-3 rounded-xl bg-card/40 border border-border/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.leader_name} · {c.destination_name || tr("No destination set")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                      <Users className="w-3.5 h-3.5" />{c.member_count}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-[9px] uppercase tracking-widest ${c.is_riding ? 'text-accent' : 'text-muted-foreground/70'}`}
                    >
                      <Radio className="w-3 h-3" />{c.is_riding ? tr("Riding") : tr("Lobby")}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 safe-frame bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{selected.name}</h2>
                <p className="text-[11px] text-muted-foreground">{tr("Code")}{" "}{selected.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg bg-secondary/60"
                aria-label={tr("Close convoy details")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selected.destination_name && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">{selected.destination_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{selected.destination_address}</p>
                </div>
              </div>
            )}

            {leader && leader.lat != null && (
              <p className="text-[11px] text-muted-foreground">
                {tr("Leader near")}{" "}{Number(leader.lat).toFixed(2)}, {Number(leader.lng).toFixed(2)}
              </p>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                {tr("Riders (")}{detail.length})
              </p>
              <ul className="space-y-1.5">
                {detail.map((m, i) => (
                  <li key={`${m.member_name}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {m.is_leader ? <Crown className="w-3.5 h-3.5 text-accent" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
                      {m.member_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {/* null: that rider keeps peaks private (Public Road Privacy). */}
                      {m.top_speed == null ? PEAK_HIDDEN : <>{challengeScore('top_speed', Number(m.top_speed), units)}{" "}{tr("top")}</>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Join, or watch it live without joining: the map follows the leader once the ride sets off. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => join(selected.code)}
                disabled={joining || locked}
                className="py-3 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {joining ? tr("Joining...") : tr("Join Convoy")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (demoBlocked()) return;
                  navigate(`/spectate/${selected.id}`, { state: { name: selected.leader_name, riding: selected.is_riding } });
                }}
                disabled={locked}
                className="py-3 rounded-xl bg-accent text-accent-foreground text-sm font-semibold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                {tr("Spectate")}
              </button>
            </div>
            {locked && <DemoLockNote />}
          </div>
        </div>
      )}
    </div>
  );
}
