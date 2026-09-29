import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { useRideHistory, useActiveRide, clearSoloRoute } from '@/features/ride';
import { useConvoyState } from '@/features/convoy';
import { clearRideRole } from '@/features/pillion';
import { getRacerState } from '@/features/track';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { History, BarChart3, Settings, Users, UserPlus, Wrench, Route, Zap, QrCode, ScanLine } from 'lucide-react';
import { HomeRadioDock } from '@/features/radio';
import { HomeGlobe } from '@/components/HomeGlobe';
import { formatSpeed, getDistanceLabel, getSpeedLabel, formatCompactCount, formatCompactDistance, formatCompactDuration } from '@/lib/format';
import { PermissionsPrompt, usePermissionsPrompt } from '@/features/permissions/PermissionsPrompt';
import { openBlacktopMap, clearMapDestination, useGuidanceActive } from '@/features/map';
import { SafetyStatusCard } from '@/features/rescue';
import { useExperience } from '@/features/experience';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { SwipeDeck, SwipeDeckPips } from '@/components/SwipeDeck';
import { useEnterprise, EnterpriseDoorway, EnterpriseWorkspaceCard } from '@/features/enterprise';

import { tr } from '@/lib/i18n';

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useRideHistory();
  const { rideState, startRide } = useActiveRide();
  const { convoy } = useConvoyState();
  const { settings } = useSettings();
  const exp = useExperience();
  const [isExploding, setIsExploding] = useState(false);
  const { show: showPermsPrompt, dismiss: dismissPermsPrompt } = usePermissionsPrompt();

  // The deck: the consumer home, then each mounted enterprise workspace, then
  // the Doorway (scan / enter a code). Tracked by key so mounting or removing a
  // workspace never lands the rider on the wrong card.
  const enterprise = useEnterprise();
  const guiding = useGuidanceActive();
  const deckLocked = rideState.isActive || guiding;
  const deckKeys = ['home', ...enterprise.workspaces.map((w) => `ws:${w.org.id}`), 'doorway'];
  const [deckKey, setDeckKey] = useState<string>(() =>
    enterprise.activeWorkspaceId ? `ws:${enterprise.activeWorkspaceId}` : 'home',
  );
  const deckIndex = Math.max(0, deckKeys.indexOf(deckKey));
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

  const handleGlobePointerDown = (e: React.PointerEvent) => {
    if (!settings.blacktopWorldEnabled) return;
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setIsExploding(true);
      setTimeout(() => navigate('/world'), 320);
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  };
  const handleGlobePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current || !longPressTimer.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    // Only cancel if the finger actually slid (10px tolerance for natural jitter).
    if (dx * dx + dy * dy > 100) cancelLongPress();
  };
  const handleGlobeClick = () => {
    if (longPressFired.current) return;
    openBlacktopMap();
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
  const showTrack = settings.trackPackEnabled;
  // Pared-back Home (solo only, no Track Pack: just Start, Plan a Route and the
  // globe): no lobby in the way. Start begins tracking straight away, Plan a
  // Route opens the lobby (destination, route options), the globe the map.
  const quickStart = !exp.showGroup && !showTrack;
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
      className={cn('flex rounded-xl border border-accent/40 bg-background/60 p-0.5', compact ? 'text-[10px]' : 'text-[11px]')}
    >
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
            'flex items-center gap-1 rounded-lg font-semibold cursor-pointer transition-colors',
            compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5',
            trackRole === id ? 'bg-accent text-accent-foreground' : 'text-accent/80',
          )}
        >
          <Icon className="w-3 h-3" />
          {label}
        </span>
      ))}
    </div>
  );

  const secondaryTile = exp.showGroup
    ? { icon: UserPlus, label: tr("Join Convoy"), sub: tr("Enter a convoy code"), onClick: () => navigate('/join-convoy') }
    : { icon: Route, label: tr("Plan a Route"), sub: exp.motorised ? tr("Weather, cameras and loops") : tr("Weather and loop routes"), onClick: () => (quickStart ? navigate('/solo-lobby') : openBlacktopMap()) };

  // Speed only makes the cut for riders who said they care about it.
  const quickStats = [
    { label: exp.terms.Rides, value: formatCompactCount(stats.totalRides), unit: null },
    { label: tr("Distance"), value: formatCompactDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
    ...(settings.speedFocusEnabled
      ? [{ label: tr("Top Speed"), value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) }]
      : []),
    { label: tr("Time"), value: formatCompactDuration(stats.totalDuration), unit: null },
  ];

  const navItems = [
    ...(settings.garageEnabled ? [{ icon: Wrench, label: tr("Garage"), onClick: () => navigate('/garage') }] : []),
    { icon: History, label: tr("History"), onClick: () => navigate('/history') },
    { icon: BarChart3, label: tr("Stats"), onClick: () => navigate('/stats') },
    { icon: Settings, label: tr("Settings"), onClick: () => navigate('/settings') },
  ];

  // Canvas can't resolve `hsl(var(--accent))`, so look up the literal HSL for
  // the active accent (same approach as BlacktopMap) for the globe's strokes.
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  // The rotating globe sits at the junction where the three ride tiles meet.
  // We measure that point at runtime, position/size the globe there, and mask a
  // matching circle out of each tile (fill + border) so the tiles "curve" around
  // the sphere, with the globe's accent rim tracing the cut.
  const tileColumnRef = useRef<HTMLDivElement>(null);
  const topATileRef = useRef<HTMLButtonElement>(null);
  const topBTileRef = useRef<HTMLButtonElement>(null);
  const bottomTileRef = useRef<HTMLButtonElement>(null);
  const trackTileRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const arcOverlayRef = useRef<SVGSVGElement>(null);

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

      // Cut a true circle out of every tile so the globe sits in a circular notch.
      // Per-tile SVG mask (evenodd path): outer rect = shown, inner circle = cut.
      // Two 180° arcs form the circle path (a full arc from a point to itself is degenerate).
      const pr = r + 14; // notch radius: 14px padding around the globe rim
      tiles.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const cx = cxAbs - rect.left;
        const cy = cyAbs - rect.top;
        const w = rect.width;
        const h = rect.height;
        const hole = `M${cx + pr},${cy} A${pr},${pr} 0 1 0 ${cx - pr},${cy} A${pr},${pr} 0 1 0 ${cx + pr},${cy} Z`;
        const svg =
          `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
          `<path fill='white' fill-rule='evenodd' d='M0,0H${w}V${h}H0Z ${hole}'/></svg>`;
        const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        el.style.webkitMaskImage = url;
        el.style.maskImage = url;
        el.style.webkitMaskRepeat = 'no-repeat';
        el.style.maskRepeat = 'no-repeat';
        // Pin the mask to the tile's exact box (some WebViews round the SVG's
        // intrinsic size, shifting the notch by a pixel).
        el.style.webkitMaskSize = '100% 100%';
        el.style.maskSize = '100% 100%';
      });

      // Carry the accent border around the circular cut on Convoy + Solo tiles.
      // The CSS mask above clips away the buttons' own accent border where the
      // circle overlaps; this SVG overlay restores it as a circle stroke clipped
      // to each tile's rounded-rect bounds so it stays inside the tile corners.
      const colW = colRect.width;
      const colH = colRect.height;
      arcSvg.setAttribute('width', String(colW));
      arcSvg.setAttribute('height', String(colH));
      arcSvg.setAttribute('viewBox', `0 0 ${colW} ${colH}`);

      const cx_col = cxAbs - colRect.left;
      const cy_col = cyAbs - colRect.top;

      const svgNS = 'http://www.w3.org/2000/svg';

      const mkClipRect = (id: string, x: number, y: number, w: number, h: number) => {
        const cp = document.createElementNS(svgNS, 'clipPath');
        cp.setAttribute('id', id);
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
        r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
        r.setAttribute('rx', '24'); r.setAttribute('ry', '24');
        cp.appendChild(r);
        return cp;
      };

      const mkCircle = (clipId: string) => {
        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', String(cx_col)); c.setAttribute('cy', String(cy_col));
        c.setAttribute('r', String(pr)); c.setAttribute('fill', 'none');
        c.setAttribute('stroke', accentColor); c.setAttribute('stroke-width', '2');
        c.setAttribute('clip-path', `url(#${clipId})`);
        return c;
      };

      const defs = document.createElementNS(svgNS, 'defs');
      // Every tile carries an accent border now, so every tile gets its arc.
      const arcs = [...topRects, ...bottomTiles.map((el) => el.getBoundingClientRect())].map((rect, i) => {
        const id = `bt-top-clip-${i}`;
        defs.appendChild(mkClipRect(id, rect.left - colRect.left, rect.top - colRect.top, rect.width, rect.height));
        return mkCircle(id);
      });

      arcSvg.replaceChildren(defs, ...arcs);
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
      navigate(getRacerState().phase === 'running' ? '/track' : '/ride');
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
      labels={[tr("Home"), ...enterprise.workspaces.map((w) => w.org.name), tr("Blacktop Enterprise")]}
    />
  );

  return (
    <div
      className={`h-dvh max-h-dvh overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6 transition-[transform,opacity] duration-[340ms] ease-in${isExploding ? ' scale-[2.4] opacity-0' : ''}`}
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
      {showPermsPrompt && <PermissionsPrompt onComplete={dismissPermsPrompt} />}

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
            key: 'home',
            node: (
              <>
                {/* Header */}
                {/* Header: name · crash rescue status (fills the gap; full span without radio) · radio */}
                <header className="flex items-center gap-3 mb-4 landscape:mb-2 animate-fade-in">
                  <div className="min-w-0 max-w-[45%] shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5 landscape:hidden">
                      {tr("Welcome back")}
                    </p>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{profile.name}</h1>
                  </div>
                  {/* Riders who said no to crash rescue in setup aren't nagged about it. */}
                  <div className="flex-1 min-w-0 flex justify-end">
                    {(settings.autoRescueEnabled || !exp.configured) && <SafetyStatusCard compact />}
                  </div>
                  <HomeRadioDock />
                </header>
                  <div className="flex-1 flex flex-col landscape:flex-row gap-4 landscape:gap-3 min-h-0 overflow-hidden">
                    {/* Quick Stats */}
                    <div
                      className="grid grid-cols-[repeat(var(--stat-cols),minmax(0,1fr))] landscape:grid-cols-2 landscape:[&>*:last-child:nth-child(odd)]:col-span-2 gap-2 landscape:w-40 md:landscape:w-48 flex-shrink-0 landscape:content-start"
                      style={{ ['--stat-cols' as string]: quickStats.length }}
                    >
                      {quickStats.map((stat, i) => (
                        <div 
                          key={stat.label}
                          className="bg-card/50 rounded-2xl p-2 md:p-3 border border-border/30 animate-scale-in"
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">{stat.label}</p>
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
                            onClick={() => {
                              haptics.light();
                              tile.onClick();
                            }}
                            className={cn(
                              'pressable flex-1 bg-card/50 border-2 border-accent text-accent hover:bg-accent/10 rounded-3xl flex items-center justify-center gap-3 hover:shadow-glow touch-target-lg',
                              // One wide tile: in landscape the globe sits dead centre, so push the label left of it.
                              singleTop && 'landscape:justify-start landscape:pl-8'
                            )}
                          >
                            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                              <tile.icon className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
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
                        <button
                          ref={bottomTileRef}
                          onClick={() => {
                            haptics.light();
                            secondaryTile.onClick();
                          }}
                          className={cn(
                            'pressable flex-1 bg-card/50 border-2 border-accent hover:bg-accent/10 hover:shadow-glow rounded-3xl flex items-center justify-center gap-3 touch-target-lg',
                            // The globe sits over this tile's centre in landscape, so the label moves right of it;
                            // with Track beside it the globe is on its right corner, so the label goes left.
                            showTrack ? 'landscape:justify-start landscape:pl-6' : 'landscape:justify-end landscape:pr-8'
                          )}
                        >
                          <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                            <secondaryTile.icon className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
                          </div>
                          <div className="text-left">
                            <span className="text-base font-semibold tracking-tight block">{secondaryTile.label}</span>
                            <span className="text-xs text-muted-foreground landscape:hidden">{secondaryTile.sub}</span>
                          </div>
                        </button>
                        {showTrack && (
                          <div
                            ref={trackTileRef}
                            role="button"
                            tabIndex={0}
                            onClick={openTrack}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openTrack()}
                            className="pressable hidden landscape:flex flex-1 bg-card/50 border-2 border-accent hover:bg-accent/10 hover:shadow-glow rounded-3xl items-center justify-end gap-3 pr-6 touch-target-lg cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                              <Zap className="w-4 h-4 text-accent" />
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
                          role="button"
                          tabIndex={0}
                          onClick={openTrack}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openTrack()}
                          className="pressable landscape:hidden flex-none h-16 bg-card/50 border-2 border-accent hover:bg-accent/10 hover:shadow-glow rounded-3xl flex items-center gap-3 px-4 cursor-pointer"
                        >
                          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-accent" />
                          </div>
                          <span className="flex-1 text-base font-semibold tracking-tight text-foreground">{tr("Track Day")}</span>
                          {trackRoleToggle(false)}
                        </div>
                      )}

                      {/* Rotating globe — tapping opens the map. Sits above the tiles (z-20)
                          so pointer events land here first; the canvas fills the div exactly. */}
                      <div
                        ref={globeRef}
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
                        className="absolute z-20 cursor-pointer rounded-full hover:bg-accent/10 hover:shadow-glow active:scale-95 active:bg-accent/20 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label={settings.blacktopWorldEnabled ? tr("Open map — hold for Blacktop World") : tr("Open map")}
                        role="button"
                      >
                        <HomeGlobe accentColor={accentColor} className="w-full h-full" />
                      </div>
                      {/* Accent arc overlay: redraws the circular border segment on Convoy + Solo
                          tiles that the CSS mask clips away, keeping the accent outline continuous. */}
                      <svg ref={arcOverlayRef} className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden="true" />
                    </div>
                  </div>
                {deckPips}
                {/* Bottom Navigation */}
                <nav className="flex justify-around mt-2 pt-3 border-t border-border/30 animate-slide-up delay-300">
                  {navItems.map(({ icon: Icon, label, onClick }) => (
                    <button
                      key={label}
                      onClick={() => {
                        haptics.tick();
                        onClick();
                      }}
                      className="pressable flex flex-col items-center gap-1 p-2 rounded-xl touch-target hover:bg-accent/10"
                    >
                      <Icon className="w-5 h-5 text-accent" />
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
                <EnterpriseWorkspaceCard session={w} className="flex-1 min-h-0" />
                {deckPips}
              </>
            ),
          })),
          {
            key: 'doorway',
            node: (
              <>
                <EnterpriseDoorway className="flex-1 min-h-0" />
                {deckPips}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
