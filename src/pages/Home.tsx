import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { useRideHistory, useActiveRide } from '@/features/ride';
import { useConvoyState } from '@/features/convoy';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { History, BarChart3, Settings, Users, UserPlus, User, Play, Download, X, Wrench } from 'lucide-react';
import { BTLogo } from '@/components/BTLogo';
import { HomeGlobe } from '@/components/HomeGlobe';
import { formatDuration, formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { PermissionsPrompt, usePermissionsPrompt } from '@/features/permissions/PermissionsPrompt';
import { openBlacktopMap } from '@/features/map';


export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useRideHistory();
  const { rideState } = useActiveRide();
  const { convoy } = useConvoyState();
  const { settings } = useSettings();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const { show: showPermsPrompt, dismiss: dismissPermsPrompt } = usePermissionsPrompt();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handleGlobePointerDown = () => {
    if (!settings.blacktopWorldEnabled) return;
    longPressFired.current = false;
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
  };
  const handleGlobeClick = () => {
    if (longPressFired.current) return;
    openBlacktopMap();
  };

  // Canvas can't resolve `hsl(var(--accent))`, so look up the literal HSL for
  // the active accent (same approach as BlacktopMap) for the globe's strokes.
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  // The rotating globe sits at the junction where the three ride tiles meet.
  // We measure that point at runtime, position/size the globe there, and mask a
  // matching circle out of each tile (fill + border) so the tiles "curve" around
  // the sphere, with the globe's accent rim tracing the cut.
  const tileColumnRef = useRef<HTMLDivElement>(null);
  const convoyTileRef = useRef<HTMLButtonElement>(null);
  const soloTileRef = useRef<HTMLButtonElement>(null);
  const joinTileRef = useRef<HTMLButtonElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const arcOverlayRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const column = tileColumnRef.current;
    const convoy = convoyTileRef.current;
    const solo = soloTileRef.current;
    const join = joinTileRef.current;
    const globe = globeRef.current;
    const arcSvg = arcOverlayRef.current;
    if (!column || !convoy || !solo || !join || !globe || !arcSvg) return;

    const tiles = [convoy, solo, join];

    const apply = () => {
      const colRect = column.getBoundingClientRect();
      if (colRect.width === 0) return;
      const convoyRect = convoy.getBoundingClientRect();
      const soloRect = solo.getBoundingClientRect();
      const joinRect = join.getBoundingClientRect();

      // Junction: horizontal center of the column; vertically the middle of the
      // gap between the top row (Convoy/Solo) and the Join tile below.
      const cxAbs = colRect.left + colRect.width / 2;
      const cyAbs = (convoyRect.bottom + joinRect.top) / 2;
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

      const cvx = convoyRect.left - colRect.left;
      const cvy = convoyRect.top - colRect.top;
      const cvw = convoyRect.width;
      const cvh = convoyRect.height;

      const slx = soloRect.left - colRect.left;
      const sly = soloRect.top - colRect.top;
      const slw = soloRect.width;
      const slh = soloRect.height;

      arcSvg.innerHTML =
        `<defs>` +
        `<clipPath id='bt-convoy-clip'><rect x='${cvx}' y='${cvy}' width='${cvw}' height='${cvh}' rx='24' ry='24'/></clipPath>` +
        `<clipPath id='bt-solo-clip'><rect x='${slx}' y='${sly}' width='${slw}' height='${slh}' rx='24' ry='24'/></clipPath>` +
        `</defs>` +
        `<circle cx='${cx_col}' cy='${cy_col}' r='${pr}' fill='none' stroke='${accentColor}' stroke-width='3' clip-path='url(#bt-convoy-clip)'/>` +
        `<circle cx='${cx_col}' cy='${cy_col}' r='${pr}' fill='none' stroke='${accentColor}' stroke-width='3' clip-path='url(#bt-solo-clip)'/>`;
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
      tiles.forEach((el) => {
        el.style.webkitMaskImage = '';
        el.style.maskImage = '';
      });
      arcSvg.innerHTML = '';
    };
  }, [accentColor]);

  // Check if app can be installed
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem('install-banner-dismissed');
    if (!isStandalone && !dismissed) {
      setShowInstallBanner(true);
    }
  }, []);

  // Redirect to active ride if one exists
  useEffect(() => {
    if (rideState.isActive) {
      navigate('/ride');
    }
  }, [rideState.isActive, navigate]);

  // Redirect to lobby if in a convoy
  useEffect(() => {
    if (!convoy.isRestoring && convoy.isActive) {
      navigate('/lobby');
    }
  }, [convoy.isActive, convoy.isRestoring, navigate]);

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('install-banner-dismissed', 'true');
  };

  return (
    <div className={`h-screen max-h-screen overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6 transition-[transform,opacity] duration-[340ms] ease-in${isExploding ? ' scale-[2.4] opacity-0' : ''}`}>
      {showPermsPrompt && <PermissionsPrompt onComplete={dismissPermsPrompt} />}

      {/* Install Banner */}
      {showInstallBanner && (
        <div className="mb-3 bg-accent/10 border border-accent/20 rounded-2xl p-3 flex items-center gap-3 animate-slide-down landscape:hidden">
          <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Install Blacktop</p>
            <p className="text-xs text-muted-foreground">Add to home screen for the best experience</p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/install')}
            className="flex-shrink-0 h-8 text-xs px-3 rounded-xl"
          >
            Install
          </Button>
          <button
            onClick={dismissInstallBanner}
            className="p-1.5 rounded-full hover:bg-secondary/50 flex-shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between mb-4 landscape:mb-2 animate-fade-in">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5 landscape:hidden">
            Welcome back
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{profile.name}</h1>
        </div>
        <BTLogo size="md" />
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-4 landscape:gap-3 min-h-0 overflow-hidden">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 landscape:grid-cols-2 gap-2 landscape:w-40 md:landscape:w-48 flex-shrink-0 landscape:content-start">
          {[
            { label: 'Rides', value: stats.totalRides, unit: null },
            { label: 'Distance', value: formatDistance(stats.totalDistance, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
            { label: 'Top Speed', value: formatSpeed(stats.personalTopSpeed, settings.speedUnit), unit: getSpeedLabel(settings.speedUnit) },
            { label: 'Time', value: formatDuration(stats.totalDuration), unit: null },
          ].map((stat, i) => (
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
          {/* Start Buttons Row */}
          <div className="flex gap-3 flex-1">
            <button
              ref={convoyTileRef}
              onClick={() => navigate('/create-convoy')}
              className="flex-1 bg-transparent border-[3px] border-accent text-accent hover:bg-accent/10 rounded-3xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
            >
              <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Users className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
              </div>
              <div className="text-left">
                <span className="text-base font-semibold tracking-tight block text-accent">Convoy</span>
                <span className="text-xs text-accent/70 landscape:hidden">Group ride</span>
              </div>
            </button>

            <button
              ref={soloTileRef}
              onClick={() => navigate('/solo-lobby')}
              className="flex-1 bg-transparent border-[3px] border-accent text-accent hover:bg-accent/10 rounded-3xl flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-glow active:scale-[0.99] touch-target-lg"
            >
              <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <User className="w-5 h-5 landscape:w-4 landscape:h-4 text-accent" />
              </div>
              <div className="text-left">
                <span className="text-base font-semibold tracking-tight block text-accent">Solo</span>
                <span className="text-xs text-accent/70 landscape:hidden">Ride alone</span>
              </div>
            </button>
          </div>

          <button
            ref={joinTileRef}
            onClick={() => navigate('/join-convoy')}
            className="flex-1 bg-card/50 hover:bg-secondary border border-border/30 hover:border-border rounded-3xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.99] touch-target-lg"
          >
            <div className="w-10 h-10 landscape:w-9 landscape:h-9 rounded-xl bg-secondary flex items-center justify-center">
              <UserPlus className="w-5 h-5 landscape:w-4 landscape:h-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="text-base font-semibold tracking-tight block">Join Convoy</span>
              <span className="text-xs text-muted-foreground landscape:hidden">Enter a convoy code</span>
            </div>
          </button>

          {/* Rotating globe — tapping opens the map. Sits above the tiles (z-20)
              so pointer events land here first; the canvas fills the div exactly. */}
          <div
            ref={globeRef}
            onClick={handleGlobeClick}
            onPointerDown={handleGlobePointerDown}
            onPointerUp={cancelLongPress}
            onPointerMove={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute z-20 cursor-pointer rounded-full hover:bg-accent/10 hover:shadow-glow active:scale-95 active:bg-accent/20 transition-all duration-200"
            aria-label="Open map — hold for Blacktop World"
            role="button"
          >
            <HomeGlobe accentColor={accentColor} className="w-full h-full" />
          </div>
          {/* Accent arc overlay: redraws the circular border segment on Convoy + Solo
              tiles that the CSS mask clips away, keeping the accent outline continuous. */}
          <svg ref={arcOverlayRef} className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden="true" />
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex justify-around mt-4 pt-3 border-t border-border/30 animate-slide-up delay-300">
        {[
          { icon: Play, label: 'Demo', onClick: () => navigate('/demo') },
          { icon: Wrench, label: 'Garage', onClick: () => navigate('/garage') },
          { icon: History, label: 'History', onClick: () => navigate('/history') },
          { icon: BarChart3, label: 'Stats', onClick: () => navigate('/stats') },
          { icon: Settings, label: 'Settings', onClick: () => navigate('/settings') },
        ].map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 touch-target text-accent hover:bg-accent/10"
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
