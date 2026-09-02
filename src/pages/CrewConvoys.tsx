import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, Crown, Users, MapPin, X, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrew } from '@/features/crew/useCrew';

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

  const { data: convoys = [], isFetching, refetch } = useQuery({
    queryKey: ['crew-convoys', crew.code],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('list_crew_convoys', { _crew_code: crew.code });
      return (data ?? []) as CrewConvoyRow[];
    },
    refetchInterval: 15000,
  });

  const { data: detail = [] } = useQuery({
    queryKey: ['crew-convoy-detail', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('crew_convoy_detail', { _convoy_id: selected!.id });
      return (data ?? []) as DetailRow[];
    },
    refetchInterval: 10000,
  });

  const leader = detail.find((d) => d.is_leader);

  return (
    <div className="min-h-dvh bg-background safe-top safe-bottom px-4 pt-4 pb-8">
      <header className="relative flex items-center justify-center pb-5">
        <button
          type="button"
          onClick={() => navigate('/world')}
          className="absolute left-0 top-0 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back to Blacktop World"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Crew Convoys</h1>
        <button
          type="button"
          onClick={() => refetch()}
          className="absolute right-0 top-0 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Refresh crew convoys"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Crew {crew.code} · {convoys.length} open {convoys.length === 1 ? 'lobby' : 'lobbies'}
      </p>

      {convoys.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 py-10 text-center">
          No unlocked convoys in your crew right now. Unlock a lobby to list it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {convoys.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c)}
                className="w-full text-left px-4 py-3 rounded-xl bg-card/40 border border-border/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.leader_name} · {c.destination_name || 'No destination set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                      <Users className="w-3.5 h-3.5" />{c.member_count}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-[9px] uppercase tracking-widest ${c.is_riding ? 'text-accent' : 'text-muted-foreground/70'}`}
                    >
                      <Radio className="w-3 h-3" />{c.is_riding ? 'Riding' : 'Lobby'}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{selected.name}</h2>
                <p className="text-[11px] text-muted-foreground">Code {selected.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg bg-secondary/60"
                aria-label="Close convoy details"
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
                Leader near {Number(leader.lat).toFixed(2)}, {Number(leader.lng).toFixed(2)}
              </p>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Riders ({detail.length})
              </p>
              <ul className="space-y-1.5">
                {detail.map((m, i) => (
                  <li key={`${m.member_name}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {m.is_leader ? <Crown className="w-3.5 h-3.5 text-accent" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
                      {m.member_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {Math.round(Number(m.top_speed ?? 0))} top
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => navigate('/join-convoy')}
              className="w-full py-3 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors"
            >
              Join with code {selected.code}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
