import { useNavigate } from 'react-router-dom';
import { Fuel, HeartPulse, CalendarDays, HardDrive, LayoutGrid, Route, Waypoints, Grid3x3, Square, Undo2, Search, Bell, Sparkles, ChevronRight, Bike, Users, Mic, Map as MapIcon, LifeBuoy, Wrench, IdCard, Globe2, Gamepad2, Shield, Radio, Timer, Languages, Siren, Music, Lock, Smartphone, Clapperboard, Gauge, ParkingSquare, TriangleAlert, Building2, Save, Video, MoveDiagonal, Crosshair, Sticker, Lightbulb, Thermometer, Eye, type LucideIcon } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { type Release, type ReleaseIcon } from '@/lib/whatsNew';

const ICON: Record<ReleaseIcon, LucideIcon> = {
  medical: HeartPulse,
  fuel: Fuel,
  calendar: CalendarDays,
  storage: HardDrive,
  console: LayoutGrid,
  trip: Route,
  route: Waypoints,
  pixels: Grid3x3,
  shape: Square,
  back: Undo2,
  search: Search,
  bell: Bell,
  ride: Bike,
  convoy: Users,
  voice: Mic,
  map: MapIcon,
  rescue: LifeBuoy,
  garage: Wrench,
  cards: IdCard,
  globe: Globe2,
  arcade: Gamepad2,
  crew: Shield,
  radio: Radio,
  track: Timer,
  language: Languages,
  alarm: Siren,
  sound: Music,
  privacy: Lock,
  phone: Smartphone,
  tour: Clapperboard,
  speed: Gauge,
  parking: ParkingSquare,
  hazard: TriangleAlert,
  enterprise: Building2,
  backup: Save,
  video: Video,
  lean: MoveDiagonal,
  gauge: Crosshair,
  sticker: Sticker,
  tips: Lightbulb,
  battery: Thermometer,
  eye: Eye,
};

/** One release's lines, each with its icon and, where it has one, its link. */
export function ReleaseLines({ release, onGo }: { release: Release; onGo?: () => void }) {
  const navigate = useNavigate();
  return (
    <ul className="space-y-2.5">
      {release.lines.map((l, i) => {
        const I = ICON[l.icon] ?? Sparkles;
        return (
          <li key={i} className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <I className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0 text-sm leading-snug pt-1">
              {l.text}
              {l.to && l.link && (
                <button
                  type="button"
                  onClick={() => {
                    onGo?.();
                    navigate(l.to!);
                  }}
                  className="mt-1 flex items-center gap-0.5 text-xs font-semibold text-accent"
                >
                  {l.link} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

