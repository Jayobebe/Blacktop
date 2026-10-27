import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { useRideHistory, useActiveRide, clearSoloRoute, SetOffPrompt } from '@/features/ride';
import { useConvoyState } from '@/features/convoy';
import { clearRideRole } from '@/features/pillion';
import { isRacerRunning } from '@/features/track/lib/racerPhase';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { History, BarChart3, Settings, Users, UserPlus, Wrench, Route, Zap, QrCode, ScanLine, Bike, UserRound } from 'lucide-react';
import { HomeRadioDock } from '@/features/radio';
// The globe (d3-geo, topojson and the world's land) and the Enterprise cards load
// after Home: they kept ~180 KB out of the first load.
const HomeGlobe = lazy(() => import('@/components/HomeGlobe').then((m) => ({ default: m.HomeGlobe })));
const EnterpriseWorkspaceCard = lazy(() => import('@/features/enterprise/components/EnterpriseWorkspaceCard').then((m) => ({ default: m.EnterpriseWorkspaceCard })));
// Blacktop Console, the card left of Home: loaded when first needed, so it adds nothing to Home's first load.
// The tuner strip in the header's place: loaded on its own so what it reads (card drops, fuel prices) stays out of Home's first load.
const HomeTuner = lazy(() => import('@/components/HomeTuner'));
const BlacktopConsole = lazy(() => import('@/features/console/components/Console').then((m) => ({ default: m.BlacktopConsole })));
const EnterpriseDoorway = lazy(() => import('@/features/enterprise/components/EnterpriseDoorway').then((m) => ({ default: m.EnterpriseDoorway })));
import { formatSpeed, getDistanceLabel, getSpeedLabel, formatCompactCount, formatCompactDistance, formatCompactDuration } from '@/lib/format';
import { openBlacktopMap, clearMapDestination, useGuidanceActive, useMapOverlay } from '@/features/map';
import { useExperience } from '@/features/experience';
import { haptics } from '@/lib/haptics';
import { sceneCue, uiCue } from '@/lib/radioFx';
import { cn } from '@/lib/utils';
import { notchedTilePath } from '@/lib/notchedTile';
import { SwipeDeck, SwipeDeckPips } from '@/components/SwipeDeck';
import { SlidingPill } from '@/components/SlidingPill';
import { WhatsNewCard } from '@/components/WhatsNew';
import { settleForNewRider, useWhatsNew } from '@/lib/whatsNew';
import { useEnterprise } from '@/features/enterprise/hooks/useEnterprise';
import { HomeStickers, useArranging } from '@/features/stickers';
import { GlobeBanner } from '@/components/GlobeBanner';
import { PageTips } from '@/features/guide';
import { TourOffer } from '@/components/TourOffer';
import { WARP_SWITCH_MS, startWarp } from '@/lib/warp';
import { isThermal } from '@/lib/thermal';

import { tr } from '@/lib/i18n';
import { useConsoleNews, refreshConsoleNews } from '@/features/console/lib/news';
import { PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';

/**
 * The deck card Home was left on, in memory only (a fresh launch opens on Home):
 * a page opened from Blacktop Console, whose back button goes straight to Home
 * (a new history entry with no state), lands back on the Console. Only within
 * ten minutes, and never once a ride has started (its receipt flies into the
 * History button on the Home card).
 */
let leftOn: { key: string; at: number } | null = null;
const RETURN_MS = 10 * 60_000;

export default function Home() {
  const peaksHidden = usePeaksHidden();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useRideHistory();
  const { rideState, startRide } = useActiveRide();
  const { convoy } = useConvoyState();
  const { settings } = useSettings();
  const exp = useExperience();

  // The deck: Blacktop Console (search, quick actions, notifications) to the left
  // of the consumer home, then each mounted enterprise workspace, then the
  // Doorway (scan / enter a code). Tracked by key so mounting or removing a
  // workspace never lands the rider on the wrong card.
  const enterprise = useEnterprise();
  const guiding = useGuidanceActive();
  // What's new: nothing to catch up on for a rider who set up after the newest release; otherwise Settings glows until the list is opened.
  useEffect(() => settleForNewRider(profile.createdAt), [profile.createdAt]);
  const whatsNew = useWhatsNew();
  // Arranging stickers: drags belong to the stickers, not the deck.
  const arrangingStickers = useArranging() && settings.collectiblesEnabled;
  const deckLocked = rideState.isActive || guiding || arrangingStickers;
  const mapOpen = useMapOverlay().isOpen;
  const deckKeys = ['console', 'home', ...enterprise.workspaces.map((w) => `ws:${w.org.id}`), 'doorway'];
  // Something new on Blacktop Console (notifications not seen, rain on its way): its pip glows.
  const consoleNews = useConsoleNews();
  useEffect(() => refreshConsoleNews(), []);
  // Back from a package demo page returns to the Doorway (history state).
  const location = useLocation();
  const [deckKey, setDeckKey] = useState<string>(() => {
    // Back (the history entry remembers its card, below), else where Home was just left.
    const back = (location.state as { deck?: string } | null)?.deck;
    if (back === 'doorway' || back === 'console') return back;
    if (!back && leftOn?.key === 'console' && Date.now() - leftOn.at < RETURN_MS && !rideState.isActive) return 'console';
    return enterprise.activeWorkspaceId ? `ws:${enterprise.activeWorkspaceId}` : 'home';
  });
  // The card on screen is written into this history entry (no change of address, so no warp),
  // so Back from anything opened on the Console comes back to the Console.
  useEffect(() => {
    try {
      const st = window.history.state as { usr?: Record<string, unknown> | null } | null;
      if (st && typeof st === 'object' && st.usr?.deck !== deckKey) {
        window.history.replaceState({ ...st, usr: { ...(st.usr ?? {}), deck: deckKey } }, '');
      }
    } catch {
      // Only a convenience.
    }
  }, [deckKey]);
  const rideActiveRef = useRef(rideState.isActive);
  rideActiveRef.current = rideState.isActive;
  const deckKeyRef = useRef(deckKey);
  deckKeyRef.current = deckKey;
  useEffect(
    () => () => {
      leftOn = rideActiveRef.current ? null : { key: deckKeyRef.current, at: Date.now() };
    },
    [],
  );
  const deckIndex = Math.max(0, deckKeys.indexOf(deckKey));
  // Stickers are arranged on the consumer home, whichever card the deck was on.
  useEffect(() => {
    if (arrangingStickers) setDeckKey('home');
  }, [arrangingStickers]);
  const goToDeck = (i: number) => {
    const key = deckKeys[i] ?? 'home';
    setDeckKey(key);
    haptics.tick();
    enterprise.switchWorkspace(key.startsWith('ws:') ? key.slice(3) : null);
  };
  // A scan or code (new or already mounted) asks the deck to show that workspace.
  useEffect(() => {
    if (enterprise.focusTick === 0) return;
    setDeckKey(enterprise.activeWorkspaceId ? `ws:${enterprise.activeWorkspaceId}` : 'home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterprise.focusTick]);
  // The card on screen was disconnected (or its guest pass ran out): back home.
  useEffect(() => {
    if (!deckKeys.includes(deckKey)) setDeckKey('home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKeys.join('|')]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // The globe is one button with two jobs. A tap opens whichever it's set to (the map, or
  // Blacktop World); holding it switches between them. Its colour and the band orbiting it say which.
  const [globeChoice, setGlobeChoice] = useState<'map' | 'world'>(() => {
    try {
      return localStorage.getItem('blacktop_globe_mode') === 'world' ? 'world' : 'map';
    } catch {
      return 'map';
    }
  });
  const globeMode: 'map' | 'world' = settings.blacktopWorldEnabled ? globeChoice : 'map';
  const switchGlobe = () => {
    const next = globeMode === 'map' ? 'world' : 'map';
    setGlobeChoice(next);
    try {
      localStorage.setItem('blacktop_globe_mode', next);
    } catch {
      // Kept for this visit only.
    }
    haptics.medium();
    if (settings.uiSoundsEnabled !== false) {
      uiCue(next === 'world' ? 'on' : 'off');
      setTimeout(() => sceneCue('whoosh'), 60);
    }
    // Let go of the squeeze into a fast spin; the colour blends over it and the word changes mid-turn.
    setGlobeHeld(false);
    setGlobeBurst((n) => n + 1);
    setBandDim(true);
    window.setTimeout(() => {
      setBandWord(next);
      setBandDim(false);
    }, 420);
  };
  // Held: the globe is squeezed down over the hold, and springs back when it lets go.
  const [globeHeld, setGlobeHeld] = useState(false);
  const [globeBurst, setGlobeBurst] = useState(0);
  // The band's word follows the mode, a beat late when the mode is changed by a hold.
  const [bandWord, setBandWord] = useState<'map' | 'world'>(globeMode);
  const [bandDim, setBandDim] = useState(false);
  useEffect(() => {
    if (!settings.blacktopWorldEnabled) setBandWord('map');
  }, [settings.blacktopWorldEnabled]);

  const handleGlobePointerDown = (e: React.PointerEvent) => {
    if (!settings.blacktopWorldEnabled) return;
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    setGlobeHeld(true);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      longPressTimer.current = null;
      switchGlobe();
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
    setGlobeHeld(false);
  };
  const handleGlobePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current || !longPressTimer.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    // Only cancel if the finger actually slid (10px tolerance for natural jitter).
    if (dx * dx + dy * dy > 100) cancelLongPress();
  };
  const handleGlobeClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (globeMode === 'map') {
      openBlacktopMap();
      return;
    }
    // Into Blacktop World through the warp (components/WarpOverlay): it opens from the globe and
    // covers the screen while the page changes underneath, and World clears it once it has drawn.
    if (settings.uiSoundsEnabled !== false) {
      uiCue('tap');
      setTimeout(() => sceneCue('whoosh'), 70);
    }
    const still = isThermal() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      navigate('/world');
      return;
    }
    const g = globeRef.current?.getBoundingClientRect();
    startWarp(g ? g.left + g.width / 2 : window.innerWidth / 2, g ? g.top + g.height / 2 : window.innerHeight / 2);
    // The page changes underneath once the slingshot has covered it.
    setTimeout(() => navigate('/world'), WARP_SWITCH_MS);
  };


  // Home adapts to the rider's setup: solo-only riders never see convoy tiles,
  // group-only riders never see solo, and the vehicle picks icons + wording.
  const SoloIcon = exp.VehicleIcon;
  const convoyTile = { key: 'convoy', icon: Users, label: exp.rideMode === 'group' ? tr("Start Convoy") : tr("Convoy"), sub: tr("Group {0}", [exp.terms.ride]), onClick: () => navigate('/create-convoy') };
  const soloTile = {
    key: 'solo',
    icon: SoloIcon,
    label: exp.rideMode === 'solo' ? tr("Start {0}", [exp.terms.Ride]) : tr("Solo"),
    sub: exp.rideMode === 'solo' ? (settings.autoRescueEnabled ? tr("Tracking, stats and rescue") : tr("Tracking and stats")) : tr("{0} alone", [exp.terms.Ride]),
    onClick: () => (quickStart ? startRideNow() : navigate('/solo-lobby')),
  };
  const primaryTiles = [...(exp.showGroup ? [convoyTile] : []), ...(exp.showSolo ? [soloTile] : [])];
  const singleTop = primaryTiles.length === 1;
  // Track Pack: racer shows the pairing QR, pit crew scans it. Remembered per device.
  // Pared-back Home (solo only, no Track Pack: Start, Plan a Route, Track Day
  // and the globe): no lobby in the way. Start begins tracking straight away,
  // Plan a Route opens the lobby (destination, route options), the globe the map.
  const quickStart = !exp.showGroup && !settings.trackPackEnabled;
  const showTrack = settings.trackPackEnabled || quickStart;
  const startRideNow = () => {
    if (rideState.isActive) {
      navigate('/ride');
      return;
    }
    clearSoloRoute(); // a free ride: no leftover destination from an earlier plan
    if (startRide(false)) navigate('/ride');
  };
  const [trackRole, setTrackRoleState] = useState<'racer' | 'pit'>(() => {
    try {
      return localStorage.getItem('bt.track_role') === 'pit' ? 'pit' : 'racer';
    } catch {
      return 'racer';
    }
  });
  const setTrackRole = (r: 'racer' | 'pit') => {
    haptics.tick();
    setTrackRoleState(r);
    try {
      localStorage.setItem('bt.track_role', r);
    } catch {
      /* per-session is fine */
    }
  };
  const openTrack = () => {
    haptics.light();
    navigate(trackRole === 'pit' ? '/track?role=pit' : '/track');
  };
  const trackRoleToggle = (compact: boolean) => (
    <div
      role="radiogroup"
      aria-label={tr("Track role")}
      onClick={(e) => e.stopPropagation()}
      className={cn('relative flex rounded-xl border border-accent/40 bg-background/60 p-0.5', compact ? 'text-[10px]' : 'text-[11px]')}
    >
      <SlidingPill />
      {([
        { id: 'racer', label: tr("Racer"), Icon: QrCode },
        { id: 'pit', label: tr("Pit crew"), Icon: ScanLine },
      ] as const).map(({ id, label, Icon }) => (
        <span
          key={id}
          role="radio"
          aria-checked={trackRole === id}
          tabIndex={0}
          onClick={() => setTrackRole(id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTrackRole(id)}
          className={cn(
            'tall-hit relative z-[1] flex items-center gap-1 rounded-lg font-semibold cursor-pointer transition-colors duration-300',
            compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5',
            trackRole === id ? 'text-accent-foreground' : 'text-accent/80',
          )}
        >
          <Icon className="w-3 h-3 landscape:group-data-[room=tight]/tile:hidden" />
          {label}
        </span>
      ))}
    </div>
  );

  // Join Convoy: riding the bike, or on the back of it. Remembered per device,
  // like the Track Day role; the join page reads it from the link.
  const [joinRole, setJoinRoleState] = useState<'operator' | 'pillion'>(() => {
    try {
      return localStorage.getItem('bt.join_role') === 'pillion' ? 'pillion' : 'operator';
    } catch {
      return 'operator';
    }
  });
  const setJoinRole = (r: 'operator' | 'pillion') => {
    haptics.tick();
    setJoinRoleState(r);
    try {
      localStorage.setItem('bt.join_role', r);
    } catch {
      /* per-session is fine */
    }
  };
  const joinRoleToggle = (
    <div
      role="radiogroup"
      aria-label={tr("Joining as")}
      onClick={(e) => e.stopPropagation()}
      className="relative flex rounded-xl border border-accent/40 bg-background/60 p-0.5 text-[10px] landscape:text-[10px]"
    >
      <SlidingPill />
      {([
        { id: 'operator', label: tr("Operator"), Icon: Bike },
        { id: 'pillion', label: tr("Passenger"), Icon: UserRound },
      ] as const).map(({ id, label, Icon }) => (
        <span
          key={id}
          role="radio"
          aria-checked={joinRole === id}
          tabIndex={0}
          onClick={() => setJoinRole(id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setJoinRole(id)}
          className={cn(
            'tall-hit relative z-[1] flex items-center gap-1 rounded-lg font-semibold cursor-pointer transition-colors duration-300 px-1.5 py-1',
            joinRole === id ? 'text-accent-foreground' : 'text-accent/80',
          )}
        >
          <Icon className="w-3 h-3 landscape:group-data-[room=tight]/tile:hidden" />
          {label}
        </span>
      ))}
    </div>
  );

  const secondaryTile = exp.showGroup
    ? { icon: UserPlus, label: tr("Join Convoy"), sub: tr("Enter a convoy code"), onClick: () => navigate(joinRole === 'pillion' ? '/join-convoy?role=pillion' : '/join-convoy') }
    : { icon: Route, label: tr("Plan a Route"), sub: exp.motorised ? tr("Weather, cameras and loops") : tr("Weather and loop routes"), onClick: () => (quickStart ? navigate('/solo-lobby') : openBlacktopMap()) };

  // Speed only makes the cut for riders who said they care about it.
  const quickStats = [
    { label: exp.terms.Rides, value: formatCompactCount(stats.totalRides), unit: null },
    { label: tr("Distance"), value: formatCompactDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
    ...(settings.speedFocusEnabled
      ? [{ label: tr("Top Speed"), value: peaksHidden ? PEAK_HIDDEN : formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: peaksHidden ? null : getSpeedLabel(settings.speedUnit) }]
      : []),
    { label: tr("Time"), value: formatCompactDuration(stats.totalDuration), unit: null },
  ];

  const navItems = [
    ...(settings.garageEnabled ? [{ icon: Wrench, label: tr("Garage"), onClick: () => navigate('/garage') }] : []),
    { icon: History, label: tr("History"), onClick: () => navigate('/history'), nav: 'history' },
    { icon: BarChart3, label: tr("Stats"), onClick: () => navigate('/stats') },
    { icon: Settings, label: tr("Settings"), onClick: () => navigate('/settings'), glow: whatsNew.unread },
  ];

  // Canvas can't resolve `hsl(var(--accent))`, so look up the literal HSL for
  // the active accent (same approach as BlacktopMap) for the globe's strokes.
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;
  const secondHsl = settings.thermalMode ? undefined : ACCENT_COLORS.find((c) => c.id === settings.secondaryAccentColor)?.hsl;
  // The globe and its band swap the two accents to say map or World: the map is the main accent's globe in
  // the second accent's band, World the other way round. With one accent (or Thermal mode, all white) both
  // are the main one and only the word says which.
  const mainHsl = (settings.thermalMode ? '0 0% 100%' : accentHsl).trim();
  const otherHsl = (secondHsl ?? mainHsl).trim();
  const globeHsl = globeMode === 'world' ? otherHsl : mainHsl;
  const globeColor = `hsl(${globeHsl.split(/\s+/).join(', ')})`;
  const bandHsl = globeMode === 'world' ? mainHsl : otherHsl;

  // The rotating globe sits at the junction where the three ride tiles meet.
  // We measure that point at runtime, position/size the globe there, and mask a
  // matching circle out of each tile (fill + border) so the tiles "curve" around
  // the sphere, with the globe's accent rim tracing the cut.
  const tileColumnRef = useRef<HTMLDivElement>(null);
  const topATileRef = useRef<HTMLButtonElement>(null);
  const topBTileRef = useRef<HTMLButtonElement>(null);
  const bottomTileRef = useRef<HTMLDivElement>(null);
  const trackTileRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const arcOverlayRef = useRef<SVGSVGElement>(null);
  /** Portrait's own Track Day tile under the others: not notched, but outlined the same way. */
  const portraitTrackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const column = tileColumnRef.current;
    // Top row has one tile (solo-only / group-only) or two (both).
    const topTiles = [topATileRef.current, topBTileRef.current].filter((el): el is HTMLButtonElement => !!el);
    const join = bottomTileRef.current;
    const globe = globeRef.current;
    const arcSvg = arcOverlayRef.current;
    if (!column || topTiles.length === 0 || !join || !globe || !arcSvg) return;

    // In landscape the Track tile sits beside Join, so it's notched too. It's
    // hidden in portrait, so which tiles to notch is decided on every layout
    // pass (rotating the phone shows or hides it without a re-render).
    const trackTile = trackTileRef.current;
    const allTiles: HTMLElement[] = [...topTiles, join, ...(trackTile ? [trackTile] : [])];
    const clearMask = (el: HTMLElement) => {
      el.style.webkitMaskImage = '';
      el.style.maskImage = '';
      el.classList.remove('globe-tile');
    };

    const apply = () => {
      const colRect = column.getBoundingClientRect();
      if (colRect.width === 0) return;
      const trackShown = !!trackTile && trackTile.getClientRects().length > 0;
      if (trackTile && !trackShown) clearMask(trackTile);
      const bottomTiles: HTMLElement[] = [join, ...(trackShown ? [trackTile!] : [])];
      const tiles: HTMLElement[] = [...topTiles, ...bottomTiles];
      const topRects = topTiles.map((el) => el.getBoundingClientRect());
      const joinRect = join.getBoundingClientRect();

      // Junction: horizontal center of the column; vertically the middle of the
      // gap between the top row (Convoy/Solo) and the Join tile below.
      const cxAbs = colRect.left + colRect.width / 2;
      const cyAbs = (topRects[0].bottom + joinRect.top) / 2;
      const r = Math.max(42, Math.min(99, Math.min(colRect.width, colRect.height) * 0.15));

      globe.style.width = `${r * 2}px`;
      globe.style.height = `${r * 2}px`;
      globe.style.left = `${cxAbs - colRect.left - r}px`;
      globe.style.top = `${cyAbs - colRect.top - r}px`;

      // Cut the notch out of every tile so the globe sits in it, its two corners where the circle meets the
      // tile's edges rounded like the tile's own (lib/notchedTile). The same shape, inset by half a stroke, is
      // drawn as the tile's outline below, so its straight edges, curves and the notch are one line of one
      // width (the tile's CSS border is hidden: .globe-tile in index.css).
      const pr = r + 14; // notch radius: 14px padding around the globe rim
      const FILLET = 12;
      const outlines: { x: number; y: number; d: string }[] = [];
      tiles.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const o = { x: cxAbs - rect.left, y: cyAbs - rect.top };
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24;
        const shape = notchedTilePath(w, h, radius, o, pr, FILLET);
        // Stretched to the box exactly (viewBox, no aspect), so no edge pixel is part see-through.
        const svg =
          `<svg xmlns='http://www.w3.org/2000/svg' width='${Math.ceil(w)}' height='${Math.ceil(h)}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>` +
          `<path fill='white' fill-rule='evenodd' d='${shape.d}'/></svg>`;
        const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        el.style.webkitMaskImage = url;
        el.style.maskImage = url;
        el.style.webkitMaskRepeat = 'no-repeat';
        el.style.maskRepeat = 'no-repeat';
        el.style.webkitMaskSize = '100% 100%';
        el.style.maskSize = '100% 100%';
        // Pressed, these brighten instead of shrinking: a scaled tile's notch slid off the
        // globe and away from its outline (see .globe-tile in index.css).
        el.classList.add('globe-tile');
        outlines.push({ x: rect.left - colRect.left, y: rect.top - colRect.top, d: notchedTilePath(w, h, radius, o, pr, FILLET, 0.75).d });
      });

      // Portrait: a tile's content keeps clear of the notch. Where it would run under it, the content moves away
      // from the side the notch bites (down for the tile below the globe, up for the ones above it), then steps
      // down in size until it fits (small phones: at 320 px "Join Convoy" ran under the globe).
      const portrait = !window.matchMedia('(orientation: landscape)').matches;
      const reach = pr + 3; // clear of the notch's outline
      const EDGE = 4; // content keeps this far inside its tile too
      const clashes = (el: HTMLElement) => {
        const t = el.getBoundingClientRect();
        return Array.from(el.children).some((c) => {
          if (getComputedStyle(c).position === 'absolute') return false;
          const b = c.getBoundingClientRect();
          if (!b.width || !b.height) return false;
          if (b.top < t.top + EDGE || b.bottom > t.bottom - EDGE || b.left < t.left + EDGE || b.right > t.right - EDGE) return true;
          const nx = Math.min(Math.max(cxAbs, b.left), b.right);
          const ny = Math.min(Math.max(cyAbs, b.top), b.bottom);
          return Math.hypot(nx - cxAbs, ny - cyAbs) < reach;
        });
      };
      const contentOf = (el: HTMLElement) => Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement && getComputedStyle(c).position !== 'absolute');
      const ZOOMS = [1, 0.92, 0.84, 0.76, 0.7];
      /** The biggest size whose content clears the notch, with as little shift away from it as that needs. */
      const fit = (el: HTMLElement): { z: number; pad: number; side: 'top' | 'bottom' | null } => {
        const rect = el.getBoundingClientRect();
        const side = cyAbs < rect.top ? 'top' : cyAbs > rect.bottom ? 'bottom' : null;
        const most = side ? Math.min(rect.height * 0.75, side === 'top' ? cyAbs + reach - rect.top : rect.bottom - (cyAbs - reach)) : 0;
        const set = (z: number, pad: number) => {
          contentOf(el).forEach((c) => (c.style.zoom = z === 1 ? '' : String(z)));
          el.style.paddingTop = side === 'top' && pad ? `${pad}px` : '';
          el.style.paddingBottom = side === 'bottom' && pad ? `${pad}px` : '';
        };
        for (const z of ZOOMS) {
          for (let pad = 0; ; pad = Math.min(most, pad + 2)) {
            set(z, pad);
            if (!clashes(el)) return { z, pad, side };
            if (pad >= most) break;
          }
        }
        set(ZOOMS[ZOOMS.length - 1], most);
        return { z: ZOOMS[ZOOMS.length - 1], pad: most, side };
      };
      tiles.forEach((el) => {
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        contentOf(el).forEach((c) => (c.style.zoom = ''));
      });
      delete join.dataset.psplit;
      if (portrait) {
        // Join Convoy with its switch: stacked if that fits at full size, else split like landscape (label left,
        // switch right) and fitted again.
        const fitJoin = () => {
          if (!exp.showGroup) return fit(join);
          const stacked = fit(join);
          if (stacked.z === 1) return stacked;
          join.dataset.psplit = '';
          return fit(join);
        };
        const fits = tiles.map((el) => ({ el, ...(el === join ? fitJoin() : fit(el)) }));
        // The tiles above the globe share one size, so Convoy and Solo match.
        const top = fits.filter((f) => f.side === 'bottom');
        if (top.length > 1) {
          const z = Math.min(...top.map((f) => f.z));
          top.forEach((f) => {
            if (f.z === z) return;
            contentOf(f.el).forEach((c) => (c.style.zoom = z === 1 ? '' : String(z)));
            for (let pad = 0; pad <= f.el.getBoundingClientRect().height * 0.75; pad += 2) {
              f.el.style.paddingBottom = pad ? `${pad}px` : '';
              if (!clashes(f.el)) break;
            }
          });
        }
      }

      // Portrait's Track Day tile: the same outline, without a notch.
      const pTrack = portraitTrackRef.current;
      if (pTrack && pTrack.getClientRects().length) {
        const rect = pTrack.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(pTrack).borderTopLeftRadius) || 24;
        const far = { x: -1e4, y: -1e4 };
        outlines.push({ x: rect.left - colRect.left, y: rect.top - colRect.top, d: notchedTilePath(rect.width, rect.height, radius, far, 0, 0, 0.75).d });
      }

      // In landscape the notch takes a bite out of the bottom tiles' middle. Tell each how much
      // room its label has (where the label's top line sits), so it can drop its icon, then tighten its switch,
      // rather than slide under the globe (a small phone, or one whose notch narrows the page).
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      bottomTiles.forEach((el) => {
        if (!landscape) {
          delete el.dataset.room;
          return;
        }
        const rect = el.getBoundingClientRect();
        const dy = rect.top + rect.height * 0.3 - cyAbs;
        const chord = Math.abs(dy) < pr ? Math.sqrt(pr * pr - dy * dy) : 0;
        const left = cxAbs - chord - rect.left;
        const right = rect.right - (cxAbs + chord);
        // Join alone with its switch: the label left of the globe and the switch right of it, so the narrower side counts.
        if (el.dataset.split !== undefined) {
          const room = Math.min(left, right);
          el.dataset.room = room < 150 ? 'tight' : room < 185 ? 'snug' : 'wide';
          return;
        }
        // Join beside Track: each is centred in the part of its tile the globe leaves (Join left of it, Track right).
        if (trackShown) {
          const room = el === join ? left : right;
          el.dataset.room = room < 190 ? 'tight' : room < 215 ? 'snug' : 'wide';
          return;
        }
        const room = right;
        el.dataset.room = room < 205 ? 'tight' : room < 250 ? 'snug' : 'wide';
      });

      // Each tile's outline, in the column's coordinates.
      const colW = colRect.width;
      const colH = colRect.height;
      arcSvg.setAttribute('width', String(colW));
      arcSvg.setAttribute('height', String(colH));
      arcSvg.setAttribute('viewBox', `0 0 ${colW} ${colH}`);
      const svgNS = 'http://www.w3.org/2000/svg';
      const paths = outlines.map(({ x, y, d }) => {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('transform', `translate(${x} ${y})`);
        p.setAttribute('fill', 'none');
        p.setAttribute('fill-rule', 'evenodd');
        p.setAttribute('stroke', accentColor);
        p.setAttribute('stroke-width', '1.5');
        p.setAttribute('stroke-linejoin', 'round');
        return p;
      });
      arcSvg.replaceChildren(...paths);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(column);
    window.addEventListener('resize', apply);
    // Re-measure once the slide-up animation settles to absorb late layout shifts.
    const settleTimer = window.setTimeout(apply, 700);
    column.addEventListener('animationend', apply);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      window.clearTimeout(settleTimer);
      column.removeEventListener('animationend', apply);
      allTiles.forEach(clearMask);
      arcSvg.innerHTML = '';
    };
  }, [accentColor, exp.rideMode, showTrack]);

  // Clear any stale map destination when returning to the home screen so it
  // doesn't bleed into the next session.
  useEffect(() => {
    clearMapDestination();
  }, []);

  // Redirect to active ride if one exists
  useEffect(() => {
    if (rideState.isActive) {
      // A Track Pack session runs on its own timing screen.
      navigate(isRacerRunning() ? '/track' : '/ride');
    }
  }, [rideState.isActive, navigate]);

  // Redirect to lobby if in a convoy; outside one, the pillion role no longer
  // applies (next convoy starts as operator unless chosen again on Join).
  useEffect(() => {
    if (convoy.isRestoring) return;
    if (convoy.isActive) navigate('/lobby');
    else clearRideRole();
  }, [convoy.isActive, convoy.isRestoring, navigate]);

  const deckPips = deckLocked ? null : (
    <SwipeDeckPips
      className="mt-2 flex-none"
      count={deckKeys.length}
      index={deckIndex}
      onSelect={goToDeck}
      labels={[tr("Blacktop Console"), tr("Home"), ...enterprise.workspaces.map((w) => w.org.name), tr("Blacktop Enterprise")]}
      // Notifications not seen yet: a mark on Console's pip.
      marks={[consoleNews]}
    />
  );

  return (
    <div
      className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6"
      // Home never scrolls; if focusing a field inside the deck makes the
      // browser scroll it anyway, snap it back so the padding stays put.
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop || el.scrollLeft) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      }}
    >

      {/* "On the move?": the app is open on Home and the rider has set off. */}
      <SetOffPrompt
        active={
          !!settings.setOffPromptEnabled && deckKey === 'home' && !rideState.isActive && !convoy.isActive &&
          !guiding && !mapOpen && !arrangingStickers && !isRacerRunning()
        }
        motorised={exp.motorised}
        startLabel={exp.showSolo ? tr("Start {0}", [exp.terms.Ride]) : tr("Start Convoy")}
        onStart={() => {
          if (!exp.showSolo) {
            navigate('/create-convoy');
            return;
          }
          clearSoloRoute(); // a free ride, as the pared-back Home's Start is
          if (startRide(false)) navigate('/ride');
        }}
        onOpenMap={() => openBlacktopMap()}
      />

      {/* First-time tips: only what isn't obvious here. Not while arranging stickers or off on another card. */}
      <PageTips
        page="home"
        when={deckKey === 'home' && !arrangingStickers && !rideState.isActive}
        tips={[
          {
            target: '[data-sticker-hole]',
            text: settings.blacktopWorldEnabled
              ? tr("The globe is one button with two jobs. Tap it to open the map. Hold it to switch to Blacktop World, then tap to go in.")
              : tr("Tap the globe to open the map."),
          },
          { target: '[data-tip="home-tuner"]', text: tr("The tuner: things worth knowing today. Drag it to turn it, tap to open one, hold it to choose what's on it.") },
          { target: '[role="tablist"]', text: tr("Swipe sideways, or tap these dots, for Blacktop Enterprise: a workspace from your school, dealer, workshop or team.") },
        ]}
      />
      <PageTips
        page="home-console"
        when={deckKey === 'home' && !arrangingStickers && !rideState.isActive}
        tips={[{ target: '[role="tablist"]', text: tr("Swipe the other way for Blacktop Console: live cards, quick actions, search and your notifications.") }]}
      />
      {/* Just set up: offer the two-minute tour once (the tips wait for it). */}
      <TourOffer blocked={deckKey !== 'home' || arrangingStickers || rideState.isActive} />
      {/* After an update: what's new, once (held back while riding, in a convoy, guided or arranging stickers). */}
      <WhatsNewCard when={deckKey === 'home' && !arrangingStickers && !rideState.isActive && !convoy.isActive && !guiding && !mapOpen} />
      {/* Things nobody finds by themselves: a set of its own, so riders past the first tips still get it. */}
      <PageTips
        page="home-more"
        when={deckKey === 'home' && !arrangingStickers && !rideState.isActive}
        tips={[{ target: '[data-radio-dock]', text: tr("Blacktop Radio. Tap it for your stations, or drag it out to keep it floating over every page.") }]}
      />

      {/* Swipe deck: the consumer home (with its header and nav), then each
          enterprise workspace and the Doorway, which fill the whole screen.
          Locked while riding or guided. */}
      <SwipeDeck
        className="flex-1 min-h-0"
        index={deckIndex}
        onIndexChange={goToDeck}
        locked={deckLocked}
        slides={[
          {
            key: 'console',
            node: (
              <Suspense fallback={<div className="flex-1 min-h-0" />}>
                <BlacktopConsole active={deckKey === 'console'} footer={deckPips} />
              </Suspense>
            ),
          },
          {
            key: 'home',
            node: (
              <>
                {/* Header: the tuner strip (components/HomeTuner), the radio docked at its end (the strip takes the
                    whole row without Blacktop Radio). The name, crash check and the alarm live on the Console now. */}
                <header className="flex items-center gap-2 mb-4 landscape:mb-2 animate-fade-in">
                  <h1 className="sr-only">{profile.name}</h1>
                  <Suspense fallback={<div className="flex-1 min-w-0 h-12 rounded-2xl border border-accent/35 bg-card/60" />}>
                    <HomeTuner active={deckKey === 'home' && !mapOpen} className="flex-1 min-w-0" />
                  </Suspense>
                  <HomeRadioDock />
                </header>
                  <div className="flex-1 flex flex-col landscape:flex-row gap-4 landscape:gap-3 min-h-0 overflow-hidden">
                    {/* Quick Stats: a row in portrait, a tower down the left in landscape */}
                    <div
                      className="grid grid-cols-[repeat(var(--stat-cols),minmax(0,1fr))] landscape:grid-cols-1 landscape:grid-rows-[repeat(var(--stat-cols),minmax(0,1fr))] gap-2 landscape:w-40 md:landscape:w-48 flex-shrink-0"
                      style={{ ['--stat-cols' as string]: quickStats.length }}
                    >
                      {quickStats.map((stat, i) => (
                        <div 
                          key={stat.label}
                          className="bg-card/50 rounded-2xl p-2 md:p-3 landscape:px-3 border border-border/30 animate-scale-in landscape:flex landscape:flex-col landscape:justify-center min-w-0"
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5 landscape:tracking-wider landscape:break-words landscape:leading-tight">{stat.label}</p>
                          <p className="text-base md:text-lg font-mono font-bold tracking-tighter leading-tight">
                            {stat.value}
                            {stat.unit && <span className="text-[10px] md:text-xs text-muted-foreground/70 ml-0.5 font-normal">{stat.unit}</span>}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Ride Buttons */}
                    <div ref={tileColumnRef} className="relative flex-1 flex flex-col gap-3 animate-slide-up delay-200">
                      {/* Start Buttons Row — one or two primary tiles depending on ride mode */}
                      <div className="flex gap-3 flex-1">
                        {primaryTiles.map((tile, i) => (
                          <button
                            key={tile.key}
                            ref={i === 0 ? topATileRef : topBTileRef}
                            data-sticker-surface
                            onClick={() => {
                              haptics.light();
                              tile.onClick();
                            }}
                            className={cn(
                              'pressable flex-1 bg-card/50 border-[1.5px] border-accent text-accent hover:bg-accent/10 rounded-3xl flex items-center justify-center gap-3 hover:shadow-glow touch-target-lg',
                              // One wide tile: in landscape the globe sits dead centre, so push the label left of it.
                              singleTop && 'landscape:justify-start landscape:pl-8'
                            )}
                          >
                            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                              <tile.icon className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent-2" />
                            </div>
                            <div className="text-left">
                              <span className="text-base font-semibold tracking-tight block text-foreground">{tile.label}</span>
                              <span className="text-xs text-muted-foreground landscape:hidden">{tile.sub}</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Bottom row: Join (plus Track in landscape, making four tiles around the globe) */}
                      <div className="flex gap-3 flex-1">
                        <div
                          ref={bottomTileRef}
                          data-sticker-surface
                          data-split={exp.showGroup && !showTrack ? '' : undefined}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            haptics.light();
                            secondaryTile.onClick();
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            secondaryTile.onClick();
                          }}
                          className={cn(
                            'group/tile pressable flex-1 bg-card/50 border-[1.5px] border-accent hover:bg-accent/10 hover:shadow-glow rounded-3xl flex items-center justify-center gap-3 touch-target-lg cursor-pointer',
                            // Portrait on a small phone (set by the fit below the globe): the label left and the switch right, as landscape does.
                            'data-[psplit]:justify-between data-[psplit]:px-4',
                            // With Track beside it the globe is on this tile's right corner, so the label is centred in the rest.
                            // Alone, the globe sits over its centre: the label goes left of it and the
                            // operator / passenger switch right of it.
                            showTrack
                              ? 'landscape:justify-center landscape:pl-4 landscape:pr-16 landscape:data-[room=tight]:pr-12'
                              : exp.showGroup
                                ? 'landscape:justify-between landscape:px-6 landscape:data-[room=tight]:px-3'
                                : 'landscape:justify-end landscape:pr-8 landscape:data-[room=tight]:pr-3'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center landscape:group-data-[room=snug]/tile:hidden landscape:group-data-[room=tight]/tile:hidden group-data-[psplit]/tile:hidden">
                              <secondaryTile.icon className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent-2" />
                            </div>
                            <div className="text-left flex flex-col items-start gap-1">
                              <span className="text-base font-semibold tracking-tight block">{secondaryTile.label}</span>
                              {/* Join Convoy: operator or passenger, like Track Day's racer / pit crew. */}
                              {exp.showGroup ? (
                                <div className={cn(!showTrack && 'landscape:hidden', 'group-data-[psplit]/tile:hidden')}>{joinRoleToggle}</div>
                              ) : (
                                <span className="text-xs text-muted-foreground landscape:hidden">{secondaryTile.sub}</span>
                              )}
                            </div>
                          </div>
                          {exp.showGroup && <div className={cn('hidden group-data-[psplit]/tile:block', !showTrack && 'landscape:block')}>{joinRoleToggle}</div>}
                        </div>
                        {showTrack && (
                          <div
                            ref={trackTileRef}
                            data-sticker-surface
                            role="button"
                            tabIndex={0}
                            onClick={openTrack}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openTrack()}
                            className="group/tile pressable hidden landscape:flex flex-1 bg-card/50 border-[1.5px] border-accent hover:bg-accent/10 hover:shadow-glow rounded-3xl items-center justify-center gap-3 pr-4 pl-16 data-[room=tight]:pl-12 touch-target-lg cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center landscape:group-data-[room=snug]/tile:hidden landscape:group-data-[room=tight]/tile:hidden">
                              <Zap className="w-4 h-4 text-accent-2" />
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-base font-semibold tracking-tight text-foreground">{tr("Track")}</span>
                              {trackRoleToggle(true)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Track Pack (portrait): trims the bottom off Join, sits above the nav bar */}
                      {showTrack && (
                        <div
                          data-sticker-surface
                          role="button"
                          tabIndex={0}
                          onClick={openTrack}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openTrack()}
                          ref={portraitTrackRef}
                          className="pressable landscape:hidden flex-none h-16 bg-card/50 border-[1.5px] border-accent drawn-outline hover:bg-accent/10 rounded-3xl flex items-center gap-3 px-4 cursor-pointer"
                        >
                          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-accent-2" />
                          </div>
                          <span className="flex-1 text-base font-semibold tracking-tight text-foreground">{tr("Track Day")}</span>
                          {trackRoleToggle(false)}
                        </div>
                      )}

                      {/* Stickers from the vault, on the buttons only (cut at their edges and round the globe). */}
                      {settings.collectiblesEnabled && <HomeStickers columnRef={tileColumnRef} />}

                      {/* Rotating globe — tapping opens the map. Sits above the tiles (z-20)
                          so pointer events land here first; the canvas fills the div exactly. */}
                      <div
                        ref={globeRef}
                        data-sticker-hole
                        onClick={handleGlobeClick}
                        onPointerDown={handleGlobePointerDown}
                        onPointerUp={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onPointerMove={handleGlobePointerMove}
                        onContextMenu={(e) => e.preventDefault()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleGlobeClick();
                          }
                        }}
                        tabIndex={0}
                        className="hold-target absolute z-20 cursor-pointer rounded-full [@media(hover:hover)]:hover:bg-accent/10 [@media(hover:hover)]:hover:shadow-glow active:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        // Squeezed down over the hold; let go with a little overshoot as the spin kicks in.
                        style={{ transform: `scale(${globeHeld ? 0.8 : 1})`, transition: globeHeld ? 'transform 500ms cubic-bezier(0.3, 0, 0.6, 1), background-color 200ms, box-shadow 200ms' : 'transform 420ms cubic-bezier(0.2, 1.7, 0.4, 1), background-color 200ms, box-shadow 200ms' }}
                        aria-label={!settings.blacktopWorldEnabled ? tr("Open map") : globeMode === 'map' ? tr("Open the map. Hold to switch to Blacktop World.") : tr("Open Blacktop World. Hold to switch to the map.")}
                        role="button"
                      >
                        <GlobeBanner layer="back" word={bandWord === 'world' ? tr("World") : tr("Map")} color={bandHsl} />
                        <Suspense fallback={null}>
                          <HomeGlobe accentColor={globeColor} burst={globeBurst} className="relative w-full h-full" />
                        </Suspense>
                        <GlobeBanner layer="front" word={bandWord === 'world' ? tr("World") : tr("Map")} color={bandHsl} dim={bandDim} burst={globeBurst} />
                      </div>
                      {/* Accent arc overlay: redraws the circular border segment on Convoy + Solo
                          tiles that the CSS mask clips away, keeping the accent outline continuous. */}
                      <svg ref={arcOverlayRef} className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden="true" />
                    </div>
                  </div>
                {deckPips}
                {/* Bottom Navigation */}
                <nav className="flex justify-around mt-2 pt-3 border-t border-border/30 animate-slide-up delay-300">
                  {navItems.map(({ icon: Icon, label, onClick, ...item }) => (
                    <button
                      key={label}
                      data-nav={'nav' in item ? item.nav : undefined}
                      onClick={() => {
                        haptics.tick();
                        onClick();
                      }}
                      className={cn('pressable flex flex-col items-center gap-1 p-2 rounded-xl touch-target hover:bg-accent/10', 'glow' in item && item.glow && 'news-glow')}
                    >
                      <Icon className="w-5 h-5 text-accent-2" />
                      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                    </button>
                  ))}
                </nav>
              </>
            ),
          },
          ...enterprise.workspaces.map((w) => ({
            key: `ws:${w.org.id}`,
            node: (
              <>
                <Suspense fallback={<div className="flex-1 min-h-0" />}>
                  <EnterpriseWorkspaceCard session={w} className="flex-1 min-h-0" />
                </Suspense>
                {deckPips}
              </>
            ),
          })),
          {
            key: 'doorway',
            node: (
              <>
                <Suspense fallback={<div className="flex-1 min-h-0" />}>
                  <EnterpriseDoorway className="flex-1 min-h-0" />
                </Suspense>
                {deckPips}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
