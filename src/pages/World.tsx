import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { supabase } from '@/integrations/supabase/client';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { WorldGlobe, type WorldLandmark } from '@/components/WorldGlobe';
import { CollectedCardsFolder } from '@/features/cards';
import { ArcadeLobby } from '@/features/arcade';
import { useDemoMode, DEMO_COUNTRY_LIGHTS } from '@/lib/demoMode';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import { useCrew, CREW_QR_PREFIX } from '@/features/crew/useCrew';

// Crew hub landmarks dotted around the globe. Rotating the globe brings each
// one into view; tapping the chip opens its page.
const CREW_LANDMARKS: (WorldLandmark & { route?: string })[] = [
  { id: 'convoys', lat: 51.5, lng: -0.12, label: 'Crew Convoys', kind: 'convoys', route: '/crew/convoys' },
  { id: 'leaderboard', lat: 35.68, lng: 139.69, label: 'Crew Leaderboards', kind: 'leaderboard', route: '/crew/leaderboard' },
  { id: 'join', lat: 34.05, lng: -118.24, label: 'Join Crew', kind: 'join', route: '/crew/join' },
  { id: 'crewqr', lat: -33.87, lng: 151.21, label: 'Crew QR', kind: 'qr' },
];

const countriesGeo = feature(
  countriesTopo as unknown as Parameters<typeof feature>[0],
  (countriesTopo as unknown as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as { features: { id: string; geometry: object }[] };

export default function World() {
  const navigate = useNavigate();
  const [globeScale, setGlobeScale] = useState(1);
  const [showCrewQr, setShowCrewQr] = useState(false);
  const crew = useCrew();
  const { settings } = useSettings();
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;
  const { enabled: demoEnabled, activeRiders: demoActiveRiders } = useDemoMode();



  const { data: memberRows } = useQuery({
    queryKey: ['world-locations'],
    queryFn: async () => {
      // Coarse, anonymous presence (rounded coords, no user_id) for the globe.
      const { data } = await supabase.rpc('get_world_presence');
      return (data ?? []) as Array<{ lat: number; lng: number }>;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Aggregate rounded coordinates into country glow + active count.
  const { countryLights, activeCount } = useMemo(() => {
    if (!memberRows?.length) return { countryLights: {}, activeCount: 0 };

    const lights: Record<number, number> = {};
    for (const { lat, lng } of memberRows) {
      for (const feat of countriesGeo.features) {
        if (geoContains(feat as any, [lng, lat])) {
          const id = Number(feat.id);
          lights[id] = (lights[id] ?? 0) + 1;
          break;
        }
      }
    }

    return { countryLights: lights, activeCount: memberRows.length };
  }, [memberRows]);
  const { data: totalBurners = 0 } = useQuery({
    queryKey: ['profile-count'],
    queryFn: async () => {
      const { data } = await supabase.rpc('profile_count');
      return Number(data ?? 0);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const displayedActiveCount = demoEnabled ? demoActiveRiders : totalBurners;

  const openLandmark = (id: string) => {
    if (id === 'crewqr') {
      setShowCrewQr(true);
      return;
    }
    const target = CREW_LANDMARKS.find((l) => l.id === id);
    if (target?.route) navigate(target.route);
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col safe-top safe-bottom animate-world-enter overflow-y-auto">
      {/* Header */}
      <header className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
        <button
          type="button"
          onPointerUp={() => navigate('/', { replace: true })}
          onClick={() => navigate('/', { replace: true })}
          className="absolute left-4 top-3.5 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-bold tracking-[0.22em] text-white uppercase">
            Blacktop World
          </h1>
          <p className="text-[9px] tracking-[0.2em] uppercase text-white/40 mt-1">
            spin the globe · tap a landmark
          </p>
        </div>
      </header>

      {/* Globe — fixed-height section, page scrolls past it */}
      <div className="relative w-full h-[70vh] flex-shrink-0">
        <WorldGlobe
          accentColor={accentColor}
          landmarks={CREW_LANDMARKS}
          onLandmarkSelect={openLandmark}
          countryLights={demoEnabled ? DEMO_COUNTRY_LIGHTS : countryLights}
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
              style={displayedActiveCount > 0
                ? { backgroundColor: '#4ade80', boxShadow: '0 0 6px #4ade80cc' }
                : { backgroundColor: '#f87171', boxShadow: '0 0 6px #f87171cc' }}
            />
            <span className="text-[9px] tracking-[0.15em] uppercase text-white/60">
              {`${displayedActiveCount.toLocaleString()} total burners`}
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
    </div>
  );
}
