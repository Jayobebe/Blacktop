import { paymentsAvailable } from '@/lib/platform';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { supabase } from '@/integrations/supabase/client';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { WorldGlobe, type WorldLandmark } from '@/components/WorldGlobe';
import { CollectedCardsFolder, useCardDrops, useCardKickbacks, copyLedger, useVehicleCards, MONTHLY_COPY_CAP } from '@/features/cards';

import { useDemoMode, DEMO_COUNTRY_LIGHTS } from '@/lib/demoMode';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import { useCrew, CREW_QR_PREFIX } from '@/features/crew/useCrew';
import { CrewList } from '@/features/crew/CrewList';
import { BlacktankPanel } from '@/features/blacktank';

import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { endWarp } from '@/lib/warp';
import { PageTips } from '@/features/guide';
// Not the Card Wars barrel: that would pull the whole game into this page.
import { SpectreTagBack } from '@/features/card-wars/light';

// Crew hub landmarks dotted around the globe. Rotating the globe brings each
// one into view; tapping the chip opens its page.
const CREW_LANDMARKS: (WorldLandmark & { route?: string })[] = [
  { id: 'convoys', lat: 51.5, lng: -0.12, label: tr("Crew Convoys"), kind: 'convoys', route: '/crew/convoys' },
  { id: 'leaderboard', lat: 35.68, lng: 139.69, label: tr("Crew Leaderboards"), kind: 'leaderboard', route: '/crew/leaderboard' },
  { id: 'join', lat: 34.05, lng: -118.24, label: tr("Join Crew"), kind: 'join', route: '/crew/join' },
  { id: 'crewqr', lat: -33.87, lng: 151.21, label: tr("Crew QR"), kind: 'qr' },
  { id: 'challenge', lat: -15.8, lng: -47.9, label: tr("Crew Challenge"), kind: 'challenge', route: '/crew/challenges' },
  { id: 'arcade', lat: -29.0, lng: 25.0, label: tr("Blacktop Arcade"), kind: 'arcade' },
  { id: 'speedshop', lat: 28.6, lng: 77.2, label: tr("Speedshop"), kind: 'shop', route: '/speedshop' },
  // Bottom of the globe, on the Antarctic landmass (Enderby Land): comes into
  // view along the lower edge as the globe turns.
  // Crypto fuel pot: not in the store apps (paymentsAvailable).
  ...(paymentsAvailable() ? [{ id: 'blacktank', lat: -70, lng: 60, label: tr("Blacktank"), kind: 'tank' as const }] : []),

];

const countriesGeo = feature(
  countriesTopo as unknown as Parameters<typeof feature>[0],
  (countriesTopo as unknown as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as { features: { id: string; geometry: object }[] };

export default function World() {
  // Arrived through the warp from Home's globe: let it go once this page has had a moment to draw.
  useEffect(() => {
    // Not cancelled on unmount: the warp must be let go even if this page is torn down and remounted.
    // After this page's own slide-in has finished, so the warp copies it where it will sit.
    window.setTimeout(endWarp, 400);
  }, []);
  const navigate = useNavigate();
  const [globeScale, setGlobeScale] = useState(1);
  const [showCrewQr, setShowCrewQr] = useState(false);
  const [searchParams] = useSearchParams();
  // Blacktank notifications open the panel straight away (/world?tank=1).
  const [showBlacktank, setShowBlacktank] = useState(() => paymentsAvailable() && searchParams.get('tank') === '1');

  const crew = useCrew();
  const { settings } = useSettings();
  // A Spectre's back is its Card Wars dog tag once the server knows those tags.
  const tagBuilds = useServerCap('cardWarsBuilds');
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;
  const { enabled: demoEnabled, activeRiders: demoActiveRiders } = useDemoMode();
  const { updateSetting } = useSettings();
  const { cards } = useVehicleCards();
  const { myDrops } = useCardDrops(null);
  useCardKickbacks();
  const cardLedger = copyLedger(cards.map((c) => c.stats.totalRides), myDrops.length);

  // Local prestige: whose dropped cards get collected the most around here.
  const { data: kings = [] } = useQuery({
    queryKey: ['area-card-kings'],
    enabled: settings.blacktopWorldEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
      );
      const { data, error } = await supabase.rpc('area_card_kings', {
        _lat: pos.coords.latitude,
        _lng: pos.coords.longitude,
        _radius_km: 50,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ owner_name: string; collected_count: number; active_drops: number; kickbacks?: number; points?: number }>;
    },
    retry: false,
  });



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
    if (id === 'blacktank') {
      setShowBlacktank(true);
      return;
    }

    if (id === 'arcade') {
      navigate('/arcade');
      return;
    }
    const target = CREW_LANDMARKS.find((l) => l.id === id);
    if (target?.route) navigate(target.route);
  };

  // Blacktop World (and therefore card drops) is strictly opt-in.
  if (!settings.blacktopWorldEnabled) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-8 text-center safe-top safe-bottom">
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">{tr("Blacktop World")}</h1>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {tr("You're opted out. Blacktop World — the crew globe, card collection and card drops on the map — is only active once you opt in.")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-[11px] font-semibold uppercase tracking-[0.15em]"
          >
            {tr("Open settings")}
          </button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="px-4 py-2.5 rounded-xl border border-border/50 text-[11px] font-semibold uppercase tracking-[0.15em]"
          >
            {tr("Back")}
          </button>
        </div>
      </div>
    );
  }

  return (

    <div className="min-h-dvh flex flex-col safe-top safe-bottom animate-world-enter overflow-y-auto">
      {/* First-time tips. The collection is further down the page, so its tips bring it into view. */}
      <PageTips
        page="world"
        scroll
        tips={[
          { target: '[data-tip="world-globe"]', text: tr("Spin the globe and tap a landmark: crew convoys, leaderboards, challenges, the arcade and more.") },
          { target: '[data-tip="scan-card"]', text: tr("Scan another rider's card QR here to add it to your collection.") },
          { target: '[data-tip="vault-card"]', text: tr("Tap any card to turn it over. The back has its QR to pass on, or its dog tag, and a sticker for your Home screen.") },
        ]}
      />
      {/* Header */}
      <header className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
        <button
          type="button"
          onPointerUp={() => navigate('/', { replace: true })}
          onClick={() => navigate('/', { replace: true })}
          className="absolute left-4 top-3.5 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label={tr("Back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-bold tracking-[0.22em] text-white uppercase">
            {tr("Blacktop World")}
          </h1>
          <p className="text-[9px] tracking-[0.2em] uppercase text-white/40 mt-1">
            {tr("spin the globe · tap a landmark")}
          </p>
        </div>
      </header>

      {/* Globe — fixed-height section, page scrolls past it */}
      <div data-tip="world-globe" className="relative w-full h-[70vh] flex-shrink-0">
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
              {tr("{0} total burners", [displayedActiveCount.toLocaleString()])}
            </span>
          </div>
        </div>
        {/* Scroll hint — only when there's a collection below to scroll to */}
        {settings.collectiblesEnabled && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-[9px] tracking-[0.25em] uppercase text-white/40">{tr("scroll for collection")}</span>
          </div>
        )}
      </div>

      {/* Card drops — who can find the cards you plant on the map. Planting needs your
          own card (minted from a garage vehicle), so it's only for collectors with a garage. */}
      {settings.collectiblesEnabled && settings.garageEnabled && (
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="rounded-2xl border border-border/40 bg-card/60 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em]">{tr("Card drops")}</h2>
            <span className="text-[11px] text-muted-foreground">
              {cardLedger.available}{" "}{tr("spare ·")}{" "}{myDrops.length}{" "}{tr("out there")}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {tr("Card drops are a Blacktop World feature — active only while you're opted in. Spare copies of your card can be planted on the Blacktop map for other riders to find and scan. Every time someone collects one of yours, you earn a kickback badge point — your drops keep working for you. Earn more from tier milestones, crew challenges, every 4 cards you collect, and 3-day ride streaks — up to")}{" "}{MONTHLY_COPY_CAP}{" "}{tr("bonus copies a month (")}{Math.max(0, MONTHLY_COPY_CAP - cardLedger.monthlyUsed)}{" "}{tr("left this month). Earn all")}{" "}{MONTHLY_COPY_CAP}{" "}{tr("and a 10th copy is granted free. Tier copies and 10-badge trades never count against the cap.")}
          </p>
          {kings.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Crown className="w-3.5 h-3.5 text-accent" />
                <p className="text-[10px] font-bold uppercase tracking-[0.15em]">{tr("Local card kings")}</p>
              </div>
              <div className="space-y-1.5">
                {kings.map((k, i) => (
                  <div key={k.owner_name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-4 text-center font-mono text-muted-foreground">{i + 1}</span>
                    <span className="font-semibold truncate">{k.owner_name}</span>
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">
                      {k.active_drops} {k.active_drops === 1 ? 'drop' : 'drops'} · {k.collected_count} {k.collected_count === 1 ? 'grab' : 'grabs'}
                      {' · '}<span className="text-primary font-mono font-semibold">{k.points ?? 0}{" "}{tr("pts")}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex rounded-xl overflow-hidden border border-border/50">
            {(['crew', 'world'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateSetting('cardDropVisibility', v)}
                aria-pressed={settings.cardDropVisibility === v}
                className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${
                  settings.cardDropVisibility === v
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                {v === 'crew' ? tr("Crew only") : tr("Worldwide")}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Card collection — full-height vertical snap carousel */}
      {settings.collectiblesEnabled && (
        <div className="flex-shrink-0">
          <CollectedCardsFolder spectreBack={tagBuilds ? (sp, shown, assign) => <SpectreTagBack spectre={sp} shown={shown} onAssign={assign} /> : undefined} />
        </div>
      )}

      {/* Blacktank — the crew fuel pot landmark. Portalled out of the page so
          the animated (transformed) wrapper doesn't trap the fixed overlay. */}
      {showBlacktank && createPortal(
        <div className="fixed inset-0 z-50 safe-frame-x bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 pt-[var(--safe-top)] sm:p-6">
          <div className="w-full sm:max-w-md max-h-[min(88dvh,100%)] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border/40 bg-card p-4 pb-[calc(1rem+var(--safe-bottom))]">
            <BlacktankPanel onClose={() => setShowBlacktank(false)} />
          </div>
        </div>,
        document.body,
      )}


      {/* Crew QR — mates scan this to join your crew */}

      {showCrewQr && (
        <div className="fixed inset-0 z-50 safe-frame-x bg-black/85 backdrop-blur-sm flex items-start justify-center p-6 safe-top safe-bottom overflow-y-auto">
          <div className="w-full max-w-xs rounded-2xl border border-border/40 bg-card p-6 text-center space-y-4 my-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em]">{tr("Crew QR")}</h2>
              <button
                type="button"
                onClick={() => setShowCrewQr(false)}
                className="p-2 rounded-lg bg-secondary/60"
                aria-label={tr("Close crew QR")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-white p-4 rounded-xl inline-block">
              <QRCodeSVG value={`${CREW_QR_PREFIX}${crew.code}`} size={190} />
            </div>
            <div>
              <p className="text-lg font-bold break-words">{crew.name}</p>
              <p className="text-sm font-bold tracking-[0.2em] text-muted-foreground">{crew.code}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr("Mates scan this from Join Crew to ride in this crew. Pick another crew below to share its QR.")}
            </p>
            {/* Every crew this rider is in: switch, rename, leave (up to four). */}
            <CrewList />
          </div>
        </div>
      )}
    </div>
  );
}
