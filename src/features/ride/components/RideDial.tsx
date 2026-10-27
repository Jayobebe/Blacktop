import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Camera, Minus, Plus, ScanEye, Users, Wind } from 'lucide-react';
import { useHazardWarning, HAZARD_BY_KIND, hazardColor } from '@/features/hazards';
import { useProximityState } from '@/features/proximity';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { metresText } from '@/lib/units';
import { useNavShare } from '@/features/map/lib/navShare';
import { useWindWarning, windColour } from '@/features/map/lib/windWarning';
import { windText } from '@/lib/units';
import { ManeuverIcon } from '@/features/map/components/ManeuverIcon';
import type { MiniMapMember } from './RideMiniMap';

const RideMiniMap = lazy(() => import('./RideMiniMap'));

// Which face is up: whichever the rider left facing them, kept for the next ride
// (`blacktop_ride_dial`). One store shared by the portrait and landscape dials (both
// are mounted), so turning the phone shows the same face; each used to keep its own.
const FACE_KEY = 'blacktop_ride_dial';
let rideFace: 'g' | 'map' = (() => {
  try {
    return localStorage.getItem(FACE_KEY) === 'map' ? 'map' : 'g';
  } catch {
    return 'g';
  }
})();
const faceListeners = new Set<() => void>();
const setRideFace = (f: 'g' | 'map') => {
  rideFace = f;
  try {
    localStorage.setItem(FACE_KEY, f);
  } catch {
    /* kept for this launch */
  }
  faceListeners.forEach((l) => l());
};
const subscribeFace = (l: () => void) => {
  faceListeners.add(l);
  return () => faceListeners.delete(l);
};
const ZOOM_KEY = 'blacktop_minimap_zoom';
const ZOOM_MIN = 12;
const ZOOM_MAX = 18;
const ZOOM_DEFAULT = 15;

function readZoom() {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(z) && z >= ZOOM_MIN && z <= ZOOM_MAX ? z : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

interface Props {
  /** The G meter, when the rider has it on; without it the dial is the mini map alone. */
  gauge: ReactNode | null;
  position: { lat: number; lng: number } | null;
  members: MiniMapMember[];
  accent: string;
  distanceUnit: 'miles' | 'km';
  /** A rescue call from someone in the convoy, where they are. */
  rescueAt?: { lat: number; lng: number } | null;
  /** This rider's convoy, so its own riders don't count as "nearby". */
  convoyId?: string | null;
  className?: string;
}

/** What the pill between the zoom buttons shows: the most important thing ahead. */
interface Pill {
  key: string;
  colour: string;
  icon: ReactNode;
  text: string;
}

/** How far a nearby rider (not in this convoy) can be and still be worth the pill. */
const NEARBY_PILL_M = 1500;
/** A camera stays in the pill this long after it was announced at most. */
const CAMERA_PILL_MS = 2 * 60_000;

/**
 * The round dial on the ride screen: the G meter, or the mini map in its
 * place. With the G meter on, a tap turns the dial over to the map and back
 * (a flip; the G meter keeps measuring underneath, its peaks are the ride's).
 * The mini map follows the rider heading-up with the route and the convoy,
 * has + and − on its shoulders (the zoom is remembered), and the next turn
 * between them; the full map is the ride screen's map button.
 */
export function RideDial({ gauge, position, members, accent, distanceUnit, rescueAt, convoyId, className }: Props) {
  const face = useSyncExternalStore(subscribeFace, () => rideFace, () => 'g' as const);
  const showing: 'g' | 'map' = gauge ? face : 'map';
  // The map loads the first time it's shown, and stays (flipping back is instant).
  const [mapLoaded, setMapLoaded] = useState(showing === 'map');
  useEffect(() => {
    if (showing === 'map') setMapLoaded(true);
  }, [showing]);

  const [zoom, setZoom] = useState(readZoom);
  const changeZoom = (by: number) => {
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + by));
      try {
        localStorage.setItem(ZOOM_KEY, String(next));
      } catch {
        /* kept for this ride */
      }
      return next;
    });
  };

  // Heading from the rider's own track: only once they've moved far enough for it to mean something.
  const [heading, setHeading] = useState<number | null>(null);
  const from = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    if (!from.current) {
      from.current = position;
      return;
    }
    if (metres(from.current, position) >= 12) {
      setHeading(bearing(from.current, position));
      from.current = position;
    }
  }, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = useNavShare();

  const flip = () => {
    if (!gauge) return;
    setRideFace(showing === 'g' ? 'map' : 'g');
  };

  const hazard = useHazardWarning();
  const wind = useWindWarning();
  const proximity = useProximityState();

  // A camera counts until it's been passed: the closest it got, and it's gone once the rider is 40 m past that.
  const cameraClosest = useRef<{ at: number; d: number } | null>(null);
  const cameraDistance = (() => {
    const cam = nav.camera;
    if (!cam || !position || Date.now() - cam.at > CAMERA_PILL_MS) return null;
    const d = metres(position, cam);
    const seen = cameraClosest.current?.at === cam.at ? cameraClosest.current : null;
    const closest = Math.min(seen?.d ?? d, d);
    cameraClosest.current = { at: cam.at, d: closest };
    return d > closest + 40 || d > 700 ? null : d;
  })();

  /**
   * The pill, most important first: someone in the convoy calling for rescue,
   * a hazard reported ahead, side gusts ahead, a camera ahead, the next turn, then the nearest
   * rider outside the convoy. Solo and convoy alike; each in its own colour.
   */
  const pill: Pill | null = (() => {
    const dist = (m: number) => metresText(m, 1, distanceUnit);
    if (rescueAt && position) {
      return {
        key: 'rescue',
        colour: 'hsl(var(--burn))',
        icon: <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[hsl(var(--burn))] text-[8px] font-black leading-none text-white">R</span>,
        text: dist(metres(position, rescueAt)),
      };
    }
    if (hazard) {
      const type = HAZARD_BY_KIND[hazard.hazard.kind];
      const Icon = type?.icon;
      return { key: `hazard-${hazard.hazard.id}`, colour: hazardColor(hazard.hazard.kind), icon: Icon ? <Icon className="h-3.5 w-3.5" /> : null, text: dist(hazard.distance) };
    }
    if (wind) {
      return { key: `wind-${wind.id}`, colour: windColour(wind.level), icon: <Wind className="h-3.5 w-3.5" />, text: `${windText(wind.crossKmh)} · ${dist(wind.distance)}` };
    }
    if (cameraDistance != null && nav.camera) {
      const Icon = nav.camera.type === 'speed' ? Camera : ScanEye;
      const limit = nav.camera.maxspeed ? ` · ${nav.camera.maxspeed}` : '';
      return { key: 'camera', colour: '#ef4444', icon: <Icon className="h-3.5 w-3.5" />, text: dist(cameraDistance) + limit };
    }
    if (nav.next && nav.distanceToNext != null) {
      return { key: 'turn', colour: accent, icon: <ManeuverIcon m={nav.next} className="h-3.5 w-3.5" />, text: dist(nav.distanceToNext) };
    }
    const near = proximity.riders
      .filter((r) => !convoyId || r.convoyId !== convoyId)
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    if (near && near.distanceM <= NEARBY_PILL_M) {
      return { key: 'nearby', colour: '#38bdf8', icon: <Users className="h-3.5 w-3.5" />, text: dist(near.distanceM) };
    }
    return null;
  })();

  return (
    <div data-tip="ride-dial" className={cn('relative aspect-square [perspective:800px]', className)}>
      <div
        className={cn('absolute inset-0 transition-transform duration-500 ease-out motion-reduce:transition-none [transform-style:preserve-3d]', gauge && showing === 'map' && '[transform:rotateY(180deg)]')}
      >
        {/* The G meter. */}
        {gauge && (
          <button
            type="button"
            onClick={flip}
            aria-label={tr("Show the mini map")}
            className={cn(
              'absolute inset-0 [backface-visibility:hidden] transition-[opacity,visibility] duration-0',
              showing === 'map' ? 'invisible opacity-0 delay-200' : 'visible opacity-100',
            )}
          >
            {gauge}
          </button>
        )}
        {/* The mini map, on the back. */}
        <div
          className={cn(
            'absolute inset-0 [backface-visibility:hidden] transition-[opacity,visibility] duration-0',
            // On the back of the G meter; on its own (no G meter) it faces front.
            gauge && '[transform:rotateY(180deg)]',
            showing === 'map' ? 'visible opacity-100' : 'invisible opacity-0 delay-200',
          )}
        >
          <div
            role={gauge ? 'button' : undefined}
            tabIndex={gauge ? 0 : undefined}
            aria-label={gauge ? tr("Show the G meter") : tr("Map")}
            onClick={flip}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') flip();
            }}
            className="absolute left-[10%] top-[10%] h-[80%] w-[80%] overflow-hidden rounded-full border-2 border-accent/60 bg-[rgb(12,12,14)] shadow-lg isolate"
          >
            {mapLoaded && (
              <Suspense fallback={null}>
                <RideMiniMap position={position} heading={heading} zoom={zoom} route={nav.route} members={members} accent={accent} active={showing === 'map'} />
              </Suspense>
            )}
            {/* The rider: always the middle of the map, pointing the way they're going (up). */}
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 drop-shadow" aria-hidden>
              <path d="M12 3 L19 20 L12 16 L5 20 Z" fill={accent} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          {/* Zoom on the shoulders, like a pair of (rounded) horns. */}
          {(
            [
              { by: -1, Icon: Minus, label: tr("Zoom out"), side: 'left-[4%]' },
              { by: 1, Icon: Plus, label: tr("Zoom in"), side: 'right-[4%]' },
            ] as const
          ).map(({ by, Icon, label, side }) => (
            <button
              key={by}
              type="button"
              aria-label={label}
              onClick={(e) => {
                e.stopPropagation();
                changeZoom(by);
              }}
              disabled={by < 0 ? zoom <= ZOOM_MIN : zoom >= ZOOM_MAX}
              className={cn('glove-hit absolute top-[2%] flex h-8 w-8 items-center justify-center rounded-lg frost-accent text-accent disabled:opacity-40', side)}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          {/* The next turn, between the horns. */}
          {showing === 'map' && pill && (
            <div
              key={pill.key}
              className="pointer-events-none absolute left-1/2 top-[1%] flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-bold text-white shadow animate-fade-in"
              style={{
                // A faded wash of the thing's own colour over the dark, its edge a little stronger.
                backgroundColor: `color-mix(in srgb, ${pill.colour} 30%, rgb(12 12 14 / 0.9))`,
                borderColor: `color-mix(in srgb, ${pill.colour} 60%, transparent)`,
                color: 'white',
              }}
            >
              <span style={{ color: pill.colour }} className="flex">{pill.icon}</span>
              <span className="font-mono">{pill.text}</span>
            </div>
          )}
          <p className="pointer-events-none absolute -bottom-1 left-0 right-0 text-center text-[7px] text-muted-foreground/60">{tr("© OpenStreetMap")}</p>
        </div>
      </div>
    </div>
  );
}
