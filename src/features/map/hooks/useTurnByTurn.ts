import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteResult } from '../lib/routing';
import {
  bearingAt,
  buildNavRoute,
  nearestTurnAlong,
  lowerFirst,
  maneuverText,
  navProgress,
  snapToRoute,
  spokenDistance,
  type DistanceUnit,
  type NavManeuver,
  type NavProgress,
  type NavRoute,
} from '../lib/navigation';
import { tr } from '@/lib/i18n';
import { speak, stopSpeaking, setVoiceStyle, type VoiceStyle } from '../lib/speech';
import { buildPacenotes } from '../lib/pacenotes';
import { warmPilotVoice } from '@/lib/pilotVoice';
import { OFF_ROUTE_M, RerouteWatch } from '../lib/rerouteRules';

/** Within this of a stop or the destination counts as there. */
const ARRIVE_M = 30;

interface Options {
  route: RouteResult | null;
  userLocation: { lat: number; lng: number } | null;
  speedMph: number;
  /** Guidance is running. Off-route detection runs regardless. */
  active: boolean;
  /** Read the prompts aloud (Spoken Directions setting). */
  voice: boolean;
  /** Standard, radio (cockpit), or radio plus rally corner calls. */
  voiceStyle?: VoiceStyle;
  unit: DistanceUnit;
  /** The rider's heading while moving (degrees), or null: for telling a rider riding the route backwards. */
  heading?: () => number | null;
  /**
   * One entry per leg end: the stop's name, or null for a via point
   * (twisty leg, loop point, weather detour) that isn't announced.
   */
  stops: (string | null)[];
  onOffRoute: () => void;
  /** Rider reached the end of leg `index` (not the last leg). */
  onStopReached: (index: number) => void;
}

export interface TurnByTurn {
  nav: NavRoute | null;
  progress: NavProgress | null;
  arrived: boolean;
  /** Text for a manoeuvre, with the right stop name for arrivals. */
  describe: (m: NavManeuver) => string;
}

export function useTurnByTurn({ route, userLocation, speedMph, active, voice, voiceStyle = 'standard', unit, heading, stops, onOffRoute, onStopReached }: Options): TurnByTurn {
  const viaKey = stops.map((s) => (s == null ? '1' : '0')).join('');
  const nav = useMemo(
    () => (route ? buildNavRoute(route, viaKey.split('').map((c) => c === '1')) : null),
    [route, viaKey],
  );
  const pacenotes = useMemo(() => buildPacenotes(nav), [nav]);
  const styleRef = useRef(voiceStyle);
  useEffect(() => {
    styleRef.current = voiceStyle;
    setVoiceStyle(voiceStyle);
  }, [voiceStyle]);
  const noteIdxRef = useRef(0);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [arrived, setArrived] = useState(false);

  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const cbRef = useRef({ onOffRoute, onStopReached, heading });
  cbRef.current = { onOffRoute, onStopReached, heading };

  const describe = (m: NavManeuver, spoken = false) => {
    const legs = nav?.legEnds.length ?? 1;
    return maneuverText(m, {
      spoken,
      stopName: m.type === 'arrive' ? stopsRef.current[m.leg] ?? null : null,
      finalStop: m.leg === legs - 1,
    });
  };

  // Per-route state, reset whenever a new route arrives.
  const hintRef = useRef<number | null>(null);
  const stagesRef = useRef<Map<number, number>>(new Map());
  const lastNextRef = useRef<number>(-1);
  const stopsDoneRef = useRef<Set<number>>(new Set());
  /** Legs the rider has been matched onto: a stop only counts once its own leg has been ridden. */
  const legsSeenRef = useRef<Set<number>>(new Set());
  const arrivedRef = useRef(false);
  /** When to ask for a new route (lib/rerouteRules): off route, a missed turn, the wrong way. */
  const watchRef = useRef(new RerouteWatch());
  useEffect(() => {
    hintRef.current = null;
    watchRef.current.newRoute();
    stagesRef.current = new Map();
    lastNextRef.current = -1;
    stopsDoneRef.current = new Set();
    legsSeenRef.current = new Set();
    arrivedRef.current = false;
    noteIdxRef.current = 0;
    setArrived(false);
    setProgress(null);
  }, [nav]);

  // Speak only for guidance the rider has started, and not for the fixes
  // that arrived before it started.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (!active) lastNextRef.current = -1;
  }, [active]);
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
    if (!voice) stopSpeaking();
  }, [voice]);
  // Radio-style directions: start the pilot voice before the first turn.
  useEffect(() => {
    if (active && voice && voiceStyle !== 'standard') warmPilotVoice();
  }, [active, voice, voiceStyle]);
  // Prompts still advance while muted, so switching the voice back on doesn't
  // replay turns already passed.
  // Directions follow the rider's voice style (plain for Standard); lib/speech.
  const say = (text: string, opts?: { interrupt?: boolean }) => {
    if (voiceRef.current) speak(text, { ...opts, kind: 'nav' });
  };

  useEffect(() => {
    if (!nav || !userLocation) return;
    const snap = snapToRoute(nav, userLocation, hintRef.current);
    // Before the first good match, don't let a far-off fix set the hint.
    if (snap.offset < OFF_ROUTE_M || hintRef.current == null) hintRef.current = snap.along;
    const along = hintRef.current;
    const p = navProgress(nav, along, snap.offset);
    setProgress(p);
    // Once there, riding around the car park isn't "off route".
    if (arrivedRef.current) return;
    const now = Date.now();

    // ── Off the plan → ask for a new one (rerouteRules: off route, a missed turn, the wrong way) ──
    const reason = watchRef.current.feed({
      now,
      offset: snap.offset,
      along,
      speed: Math.max(0, speedMph) * 0.44704,
      heading: cbRef.current.heading?.() ?? null,
      lineBearing: bearingAt(nav, along),
      nearestTurn: nearestTurnAlong(nav, along),
    });
    if (reason) {
      if (activeRef.current && nav.maneuvers.length) say(tr("Rerouting"), { interrupt: true });
      cbRef.current.onOffRoute();
      return;
    }

    // ── Stops and arrival ──
    // In order, and each only from its own leg: a match that lands further along (a route that comes back
    // past here) can't count the stops before it as reached.
    if (snap.offset < OFF_ROUTE_M) {
      const leg = nav.legEnds.findIndex((e) => along <= e);
      legsSeenRef.current.add(leg < 0 ? nav.legEnds.length - 1 : leg);
    }
    for (let i = 0; i < nav.legEnds.length - 1; i++) {
      if (stopsDoneRef.current.has(i)) continue;
      if (legsSeenRef.current.has(i) && along >= nav.legEnds[i] - ARRIVE_M && snap.offset < OFF_ROUTE_M) {
        stopsDoneRef.current.add(i);
        cbRef.current.onStopReached(i);
      }
      break;
    }
    if (!arrivedRef.current && p.remainingMeters <= ARRIVE_M && snap.offset < OFF_ROUTE_M && nav.length > ARRIVE_M * 2) {
      arrivedRef.current = true;
      setArrived(true);
    }

    // ── Voice prompts ──
    if (!activeRef.current) return;
    const v = Math.max(0, speedMph) * 0.44704;

    // Rally corner calls: each bend once, ~5 s ahead, skipped near a junction
    // (the turn prompt covers it) and when a call was missed well behind.
    if (styleRef.current === 'rally' && pacenotes.length) {
      const lead = Math.min(250, Math.max(70, v * 5));
      let k = noteIdxRef.current;
      while (k < pacenotes.length && pacenotes[k].along < along - 10) k++;
      if (k < pacenotes.length && pacenotes[k].along - along <= lead) {
        const note = pacenotes[k];
        const nearTurn = p.next && p.next.type !== 'arrive' && Math.abs(p.next.along - note.along) < 50;
        if (!nearTurn) say(note.text);
        k++;
      }
      noteIdxRef.current = k;
    }

    if (!p.next) return;
    const m = p.next;
    const d = p.distanceToNext;
    const far = Math.min(2000, Math.max(300, v * 30));
    const near = Math.min(200, Math.max(40, v * 7));
    const stage = stagesRef.current.get(m.index) ?? 0;
    const text = describe(m, true);

    if (m.type === 'arrive') {
      if (d <= ARRIVE_M + 10 && stage < 2) {
        stagesRef.current.set(m.index, 2);
        const where = stopsRef.current[m.leg];
        say(m.leg === nav.legEnds.length - 1 ? (where ? tr("You have arrived at {0}", [where]) : tr("You have arrived")) : where ? tr("You've reached {0}", [where]) : tr("You've reached your stop"), {
          interrupt: true,
        });
      } else if (d <= far && d > near && stage < 1) {
        stagesRef.current.set(m.index, 1);
        say(tr("In {0}, {1}", [spokenDistance(d, unit), lowerFirst(text)]));
      }
    } else if (d <= near && stage < 2) {
      stagesRef.current.set(m.index, 2);
      let line = text;
      if (p.then) {
        stagesRef.current.set(p.then.index, 1);
        line = tr("{0}, then {1}", [line, lowerFirst(describe(p.then, true))]);
      }
      say(line, { interrupt: true });
    } else if (d <= far && d > near + 30 && stage < 1) {
      stagesRef.current.set(m.index, 1);
      say(tr("In {0}, {1}", [spokenDistance(d, unit), lowerFirst(text)]));
    } else if (m.index !== lastNextRef.current && d > 3000) {
      // A long way to the next turn: say so once, so silence doesn't read as lost.
      const road = styleRef.current === 'standard' ? nav.maneuvers[m.index - 1]?.name || '' : '';
      say(road ? tr("Continue on {0} for {1}", [road, spokenDistance(d, unit)]) : tr("Continue for {0}", [spokenDistance(d, unit)]));
    }
    lastNextRef.current = m.index;
    // Keyed on the coordinates, not the object, so a fresh object with the
    // same fix doesn't re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, userLocation?.lat, userLocation?.lng]);

  return { nav, progress, arrived, describe: (m) => describe(m) };
}
