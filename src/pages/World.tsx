import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { supabase } from '@/integrations/supabase/client';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { WorldGlobe, type WorldEventMarker } from '@/components/WorldGlobe';
import { CollectedCardsFolder } from '@/features/cards';
import { ArcadeLobby } from '@/features/arcade';

const EVENT_KEY_ROW1 = [
  { id: 'WF', label: 'Wildfire', color: '#fb923c' },
  { id: 'VO', label: 'Volcano',  color: '#f87171' },
  { id: 'FL', label: 'Flood',    color: '#60a5fa' },
  { id: 'EQ', label: 'Quake',    color: '#c4b5fd' },
  { id: 'DR', label: 'Drought',  color: '#fcd34d' },
] as const;

const EVENT_KEY_ROW2 = [
  { id: 'SE', label: 'Storm',    color: '#93c5fd' },
  { id: 'SW', label: 'Snow',     color: '#dbeafe' },
] as const;

interface EONETEvent {
  id: string;
  title: string;
  categories: { id: string; title: string }[];
  geometry: { date: string; type: string; coordinates: number[] }[];
}

const countriesGeo = feature(
  countriesTopo as unknown as Parameters<typeof feature>[0],
  (countriesTopo as unknown as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as { features: { id: string; geometry: object }[] };

export default function World() {
  const navigate = useNavigate();
  const [globeScale, setGlobeScale] = useState(1);
  const { settings } = useSettings();
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  const { data: eonetData, isLoading: eonetLoading } = useQuery<{ events: EONETEvent[] }>({
    queryKey: ['eonet-events'],
    queryFn: () =>
      fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=40&days=30').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: memberRows } = useQuery({
    queryKey: ['user-locations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('convoy_members')
        .select('user_id, current_lat, current_lng')
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null);
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Deduplicate by user_id (keep one point per rider), then detect country
  const { countryLights, activeCount } = useMemo(() => {
    if (!memberRows?.length) return { countryLights: {}, activeCount: 0 };

    const seen = new Map<string, { lat: number; lng: number }>();
    for (const row of memberRows) {
      if (!seen.has(row.user_id)) {
        seen.set(row.user_id, { lat: row.current_lat!, lng: row.current_lng! });
      }
    }

    const lights: Record<number, number> = {};
    for (const { lat, lng } of seen.values()) {
      for (const feat of countriesGeo.features) {
        if (geoContains(feat as any, [lng, lat])) {
          const id = Number(feat.id);
          lights[id] = (lights[id] ?? 0) + 1;
          break;
        }
      }
    }

    return { countryLights: lights, activeCount: seen.size };
  }, [memberRows]);

  const markers: WorldEventMarker[] = (eonetData?.events ?? [])
    .slice(0, 25)
    .flatMap((event) => {
      const geo = event.geometry[event.geometry.length - 1];
      if (!geo?.coordinates || geo.type !== 'Point') return [];
      const [lng, lat] = geo.coordinates;
      return [{ lat, lng, categoryId: event.categories[0]?.id ?? 'MN' }];
    });

  return (
    <div className="min-h-screen bg-background flex flex-col safe-top safe-bottom animate-world-enter overflow-y-auto">
      {/* Header */}
      <header className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-3.5 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-bold tracking-[0.22em] text-white uppercase">
            Blacktop World
          </h1>
          {/* Event key — inline below heading */}
          <div className="flex flex-col items-center gap-1 mt-2.5 px-2.5 py-1.5 rounded-xl bg-black/40 backdrop-blur-sm border border-white/[0.06]">
            <div className="flex items-center gap-3">
              {EVENT_KEY_ROW1.map(({ id, label, color }) => (
                <div key={id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}99` }} />
                  <span className="text-[9px] tracking-[0.12em] uppercase text-white/55">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {EVENT_KEY_ROW2.map(({ id, label, color }) => (
                <div key={id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}99` }} />
                  <span className="text-[9px] tracking-[0.12em] uppercase text-white/55">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Globe — fixed-height section, page scrolls past it */}
      <div className="relative w-full h-[70vh] flex-shrink-0">
        <WorldGlobe
          accentColor={accentColor}
          events={markers}
          countryLights={countryLights}
          onScaleChange={setGlobeScale}
          className="w-full h-full"
        />
        {/* Rider count — fades when globe is zoomed in */}
        <div
          className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none transition-opacity duration-500"
          style={{ opacity: globeScale > 1.2 ? 0 : 1 }}
        >
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-black/40 backdrop-blur-sm border border-white/[0.06]">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={activeCount > 0
                ? { backgroundColor: '#4ade80', boxShadow: '0 0 6px #4ade80cc' }
                : { backgroundColor: '#f87171', boxShadow: '0 0 6px #f87171cc' }}
            />
            <span className="text-[9px] tracking-[0.15em] uppercase text-white/60">
              {activeCount > 0
                ? `${activeCount.toLocaleString()} active rider${activeCount === 1 ? '' : 's'}`
                : '0 active riders'}
            </span>
          </div>
        </div>
        {/* Scroll hint */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[9px] tracking-[0.25em] uppercase text-white/40">scroll for collection</span>
        </div>
      </div>

      {/* Card collection — full-height vertical snap carousel */}
      <div className="flex-shrink-0">
        <CollectedCardsFolder />
      </div>

      {/* Arcade */}
      <div className="flex-shrink-0">
        <ArcadeLobby />
      </div>

      {eonetLoading && (
        <p className="flex-shrink-0 text-center text-[9px] text-muted-foreground/30 tracking-widest uppercase pb-3 animate-pulse">
          loading events…
        </p>

      )}
    </div>
  );
}
