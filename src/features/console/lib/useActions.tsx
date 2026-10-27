import type { ComponentType } from 'react';
import { useConsoleNavigate } from './consoleNavigate';
import {
  Play, Pause, Users, UserPlus, Navigation, MapPin, Map as MapIcon, SquareParking, Siren, LifeBuoy, ShieldCheck, Gauge,
  CloudRain, CloudSun, Wind, Camera, Volume2, Radio, TriangleAlert, Ban, Coins, Ship, Mountain, Thermometer, Video, Megaphone,
  Bike, Handshake, Music, Timer, Wrench, History, BarChart3, Globe2, Swords, Gamepad2, Settings as SettingsIcon,
  Route as RouteIcon, Waypoints as RoutePlus, HardDrive,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import { useSettings, type AppSettings } from '@/features/settings';
import { useExperience, placeCategories } from '@/features/experience';
import { useActiveRide, setSoloRoute, clearSoloRoute } from '@/features/ride';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { getSavedPOIs } from '@/features/map/lib/poiStore';
import { requestMapSearch } from '@/features/map/lib/mapConsole';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { chooseRouteTrip, openTripForRoute, legCount, useTrips } from '@/features/ride/lib/trips';
import { useGarage } from '@/features/garage';
import { armAlarm, requestPattern, hasAlarmPattern } from '@/features/alarm';
import { openRescueDrill, requestAutoRescueConsent, askRescue, useRescueAsk, useRescueBridge } from '@/features/rescue';
import { useConvoyState } from '@/features/convoy';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** The rescue R, as rescue is drawn everywhere: a burn-orange disc with a capital R. */
function RescueBadge({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn(className, 'rounded-full bg-[hsl(var(--burn))] text-white flex items-center justify-center text-[11px] font-black leading-none')}>
      R
    </span>
  );
}
import { requestMotionPermission } from '@/features/experience/lib/questions';
import { openRadioOverlay, toggleRadio, useRadioPlayer } from '@/features/radio';
import { useParkedSpot } from '@/lib/parkedSpot';

export type ActionGroup = 'ride' | 'places' | 'vehicles' | 'safety' | 'settings' | 'radio' | 'screens';

/** One thing Blacktop Console can do: a quick action, and a search result. */
export interface ConsoleAction {
  id: string;
  group: ActionGroup;
  label: string;
  /** A small line under the label: a toggle's state, "Ride" / "Navigate" for a place, the voice style. */
  caption?: string;
  Icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** The icon's own colour (quick-search categories keep theirs). */
  color?: string;
  /** A switch: lit while on. */
  on?: boolean;
  /** Burn orange (the alarm). */
  burn?: boolean;
  /**
   * Features it needs that are switched off in Settings (Blacktop Radio, the
   * garage, Blacktop World…): adding or running it asks to switch them on first.
   */
  needs?: { keys: ToggleKey[]; name: string };
  /** Run only by holding it (rescue): a tap does `onTap` instead. */
  hold?: boolean;
  onTap?: () => void;
  run: () => void | Promise<void>;
}

export const GROUP_ORDER: ActionGroup[] = ['ride', 'places', 'vehicles', 'safety', 'settings', 'radio', 'screens'];
export function groupLabel(g: ActionGroup): string {
  switch (g) {
    case 'ride':
      return tr("Ride");
    case 'places':
      return tr("Map");
    case 'vehicles':
      return tr("Vehicles");
    case 'safety':
      return tr("Safety");
    case 'settings':
      return tr("Settings");
    case 'radio':
      return tr("Radio");
    default:
      return tr("Shortcuts");
  }
}

export type ToggleKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

/**
 * Every action available to this rider, worked out from their setup: what they
 * ride and how (solo, group), what's switched on (garage, World, radio), their
 * saved places and vehicles. Things a tap from Home doesn't already reach.
 */
export function useActions(): ConsoleAction[] {
  const navigate = useConsoleNavigate();
  const { settings, updateSetting } = useSettings();
  const exp = useExperience();
  const { startRide, rideState } = useActiveRide();
  const garage = useGarage();
  const radio = useRadioPlayer();
  const parked = useParkedSpot();
  const savedRoutes = useSavedRoutes();
  useTrips(); // a leg done changes the "Leg 2 of 4" on a route's action
  const rescueBridge = useRescueBridge();
  const { recentlySent } = useRescueAsk();
  const { convoy } = useConvoyState();
  const onOff = (on: boolean) => (on ? tr("On") : tr("Off"));
  const out: ConsoleAction[] = [];
  /** What's needed for a feature that's off, or nothing when it's on. */
  const gate = (keys: ToggleKey[], name: string): ConsoleAction['needs'] => {
    const off = keys.filter((k) => settings[k] !== true);
    return off.length ? { keys: off, name } : undefined;
  };

  // ── Ride ──
  const startSolo = () => {
    if (rideState.isActive) return navigate('/ride');
    clearSoloRoute();
    if (startRide(false)) navigate('/ride');
  };
  if (exp.showSolo) out.push({ id: 'ride.start', group: 'ride', label: tr("Start {0}", [exp.terms.Ride]), Icon: Play, run: startSolo });
  if (exp.showGroup) {
    out.push({ id: 'ride.convoy', group: 'ride', label: tr("Start Convoy"), Icon: Users, run: () => navigate('/create-convoy') });
    out.push({ id: 'ride.join', group: 'ride', label: tr("Join Convoy"), Icon: UserPlus, run: () => navigate('/join-convoy') });
  }
  const saved = getSavedPOIs();
  if (exp.showSolo) {
    for (const p of saved) {
      out.push({
        id: `ride.to:${p.id}`,
        group: 'ride',
        label: p.name,
        caption: tr("Ride"),
        Icon: Navigation,
        // As the solo lobby's Navigate: the route set, the ride started, the map guiding on top of it.
        run: () => {
          if (rideState.isActive) return navigate('/ride');
          setSoloRoute({ destination: { lat: p.lat, lng: p.lng, name: p.name }, stops: [] });
          if (!startRide(false)) return;
          navigate('/ride');
          queueMicrotask(() => openBlacktopMap({ lat: p.lat, lng: p.lng, name: p.name }));
        },
      });
    }
  }

  // Saved routes, ridden as saved: through their stops to the end.
  if (exp.showSolo) {
    for (const r of savedRoutes) {
      // A route with stops is a trip: carried on from its next leg.
      const open = openTripForRoute(r.id);
      out.push({
        id: `route.ride:${r.id}`,
        group: 'ride',
        label: r.name,
        caption: open ? tr("Leg {0} of {1}", [open.legsDone + 1, legCount(open)]) : tr("Route"),
        Icon: RouteIcon,
        run: () => {
          if (rideState.isActive) return navigate('/ride');
          const plan = chooseRouteTrip(r);
          setSoloRoute({ destination: plan.destination, stops: plan.stops });
          if (!startRide(false)) return;
          navigate('/ride');
          queueMicrotask(() => openBlacktopMap({ lat: plan.destination.lat, lng: plan.destination.lng, name: plan.destination.name }));
        },
      });
    }
  }

  // ── Map ──
  out.push({ id: 'map.open', group: 'places', label: tr("Open map"), Icon: MapIcon, run: () => openBlacktopMap() });
  out.push({ id: 'route.save', group: 'places', label: tr("Save a route"), Icon: RoutePlus, run: () => navigate('/routes/new') });
  for (const c of placeCategories(exp.vehicles)) {
    out.push({
      id: `map.find:${c.id}`,
      group: 'places',
      label: c.label,
      caption: tr("Map"),
      Icon: c.Icon,
      color: c.color,
      run: () => {
        openBlacktopMap();
        requestMapSearch({ category: c.id });
      },
    });
  }
  for (const p of saved) {
    out.push({ id: `nav.to:${p.id}`, group: 'places', label: p.name, caption: tr("Navigate"), Icon: MapPin, run: () => openBlacktopMap({ lat: p.lat, lng: p.lng, name: p.name }) });
  }
  if (settings.parkedSpotEnabled && parked) {
    out.push({ id: 'map.parked', group: 'places', label: tr("Parked spot"), Icon: SquareParking, run: () => openBlacktopMap({ lat: parked.lat, lng: parked.lng, name: tr("Parked spot") }) });
  }

  // ── Vehicles: the one being ridden (rides, service and the logbook count on it) ──
  const garageGate = gate(['garageEnabled'], tr("Garage"));
  for (const b of garage.bikes) {
    const on = !garageGate && garage.activeBikeId === b.id;
    out.push({ id: `vehicle:${b.id}`, group: 'vehicles', label: b.name, caption: on ? tr("On") : tr("Vehicle"), Icon: exp.VehicleIcon, on, needs: garageGate, run: () => { garage.setActiveBike(b.id); } });
  }

  // ── Safety ──
  // Rescue: held for a second, then "Are you okay?" (RescueAskHost). In a convoy a tap cancels a call already out.
  // A convoy's leader has none, as on the ride screen.
  {
    const inConvoy = rescueBridge.canRequest;
    const pending = inConvoy ? rescueBridge.hasPending : recentlySent;
    if (!(inConvoy && convoy.isLeader)) {
      out.push({
        id: 'safety.rescue',
        group: 'safety',
        label: tr("Request rescue"),
        caption: pending ? (inConvoy ? tr("Cancel rescue request") : tr("Rescue call sent")) : undefined,
        Icon: RescueBadge,
        burn: true,
        hold: true,
        on: pending,
        run: () => {
          if (!pending) askRescue();
        },
        onTap: () => {
          if (pending && inConvoy) void rescueBridge.cancel?.();
          else toast(tr("Hold the R to call for rescue"));
        },
      });
    }
  }
  out.push({ id: 'safety.alarm', group: 'safety', label: tr("Anti-theft alarm"), Icon: Siren, burn: true, run: () => armAlarm() });
  out.push({ id: 'safety.drill', group: 'safety', label: tr("Rescue drill"), Icon: LifeBuoy, run: () => openRescueDrill() });
  out.push({
    id: 'toggle.autoRescueEnabled',
    group: 'safety',
    label: tr("Crash check"),
    caption: onOff(settings.autoRescueEnabled),
    on: settings.autoRescueEnabled,
    Icon: ShieldCheck,
    // Switching it on goes through the same steps as Settings: motion access, then the disclaimer.
    run: async () => {
      if (settings.autoRescueEnabled) return updateSetting('autoRescueEnabled', false);
      if (!(await requestMotionPermission())) return;
      if (await requestAutoRescueConsent()) updateSetting('autoRescueEnabled', true);
    },
  });
  {
    const shown = settings.logPeakTelemetry !== false;
    out.push({
      needs: gate(['speedFocusEnabled'], tr("Live speed readout")),
      id: 'toggle.logPeakTelemetry',
      group: 'safety',
      label: tr("Log Peak Speed & Gs"),
      caption: onOff(shown),
      on: shown,
      Icon: Gauge,
      // Behind the alarm's pattern, as in Settings: hiding needs one to exist, showing needs it drawn.
      run: async () => {
        if (shown) {
          if (!hasAlarmPattern() && !(await requestPattern('set', tr("Set your unlock pattern"), tr("You'll draw it to show your peak figures again.")))) return;
          updateSetting('logPeakTelemetry', false);
          return;
        }
        if (await requestPattern('check', tr("Draw your unlock pattern"), tr("Your pattern shows your peak speed, lean and G again."))) updateSetting('logPeakTelemetry', true);
      },
    });
  }

  // ── Settings: switches, each a tap away here instead of a dig through Settings ──
  const toggle = (key: ToggleKey, label: string, Icon: ConsoleAction['Icon'], show = true) => {
    if (!show) return;
    const on = settings[key] === true;
    out.push({ id: `toggle.${key}`, group: 'settings', label, caption: onOff(on), on, Icon, run: () => updateSetting(key, !on) });
  };
  toggle('weatherOverlayEnabled', tr("Rain radar"), CloudRain);
  toggle('weatherRoutingEnabled', tr("Weather routing"), CloudSun);
  toggle('windOverlayEnabled', tr("Wind on the map"), Wind);
  toggle('trafficCamerasEnabled', tr("Speed cameras"), Camera, exp.motorised);
  toggle('navVoiceEnabled', tr("Spoken Directions"), Volume2);
  const styles = ['standard', 'cockpit', 'rally'] as const;
  const styleName = { standard: tr("Standard"), cockpit: tr("Cockpit"), rally: tr("Rally") };
  out.push({
    id: 'voice.style',
    group: 'settings',
    label: tr("Voice Style"),
    caption: styleName[settings.navVoiceStyle] ?? tr("Standard"),
    Icon: Radio,
    run: () => updateSetting('navVoiceStyle', styles[(styles.indexOf(settings.navVoiceStyle) + 1) % styles.length]),
  });
  toggle('hazardVoiceEnabled', tr("Spoken Hazard Warnings"), TriangleAlert);
  toggle('navAvoidMotorways', tr("Avoid motorways"), Ban);
  toggle('navAvoidTolls', tr("Avoid toll roads"), Coins);
  toggle('navAvoidFerries', tr("Avoid ferries"), Ship);
  toggle('navAvoidUnpaved', tr("Avoid unpaved roads"), Mountain);
  toggle('thermalMode', tr("Thermal / High-Speed Mode"), Thermometer);
  toggle('rideOverlayEnabled', tr("Overlay video"), Video);
  toggle('rideUpdatesEnabled', tr("Spoken ride updates"), Megaphone);
  toggle('setOffPromptEnabled', tr("Ask when I set off"), Bike);
  toggle('proximityEnabled', tr("Nearby riders"), Handshake, exp.showGroup);
  toggle('uiSoundsEnabled', tr("App sounds"), Music);

  // ── Radio ──
  {
    const needs = gate(['radioEnabled'], tr("Blacktop Radio"));
    out.push({ id: 'radio.open', group: 'radio', label: tr("Blacktop Radio"), Icon: Radio, needs, run: () => openRadioOverlay() });
    out.push({
      needs,
      id: 'radio.play',
      group: 'radio',
      label: radio.isPlaying ? tr("Pause") : tr("Play"),
      caption: tr("Radio"),
      Icon: radio.isPlaying ? Pause : Play,
      run: () => void toggleRadio(),
    });
  }

  // ── Shortcuts: screens more than a tap from Home ──
  const go = (id: string, label: string, Icon: ConsoleAction['Icon'], path: string, needs?: ConsoleAction['needs']) => {
    out.push({ id: `go.${id}`, group: 'screens', label, Icon, needs, run: () => navigate(path) });
  };
  const worldGate = gate(['blacktopWorldEnabled'], tr("Blacktop World"));
  go('track', tr("Track Day"), Timer, '/track', gate(['trackPackEnabled'], tr("Track Day")));
  go('garage', tr("Garage"), Wrench, '/garage', garageGate);
  go('history', tr("History"), History, '/history');
  go('stats', tr("Stats"), BarChart3, '/stats');
  go('world', tr("Blacktop World"), Globe2, '/world', worldGate);
  go('crewconvoys', tr("Crew Convoys"), Users, '/crew/convoys', worldGate);
  go('switchback', tr("SwitchBack"), Swords, '/arcade/switchback', gate(['blacktopWorldEnabled', 'collectiblesEnabled'], tr("Blacktop World") + ' + ' + tr("Collecting")));
  go('arcade', tr("Arcade"), Gamepad2, '/arcade', worldGate);
  go('settings', tr("Settings"), SettingsIcon, '/settings');
  go('storage', tr("Storage"), HardDrive, '/storage');

  return out;
}

/** What a new rider starts with, from what they have. */
export function defaultQuickActions(available: ConsoleAction[]): string[] {
  const has = new Set(available.filter((a) => !a.needs).map((a) => a.id));
  const refuel = available.find((a) => a.id.startsWith('map.find:'))?.id;
  return [
    has.has('ride.start') ? 'ride.start' : 'ride.convoy',
    refuel,
    'safety.rescue',
    'safety.alarm',
    'toggle.weatherOverlayEnabled',
    'toggle.navVoiceEnabled',
    has.has('radio.open') ? 'radio.open' : 'go.history',
  ].filter((id): id is string => !!id && has.has(id));
}
