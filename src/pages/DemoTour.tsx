import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  CloudRain,
  Flame,
  Gamepad2,
  Gauge,
  Globe2,
  IdCard,
  Lock,
  MapPin,
  Mic,
  Navigation,
  Pause,
  QrCode,
  Radio,
  Receipt,
  RotateCcw,
  Route,
  Shield,
  Siren,
  SkipForward,
  Smartphone,
  Timer,
  Trophy,
  UserRound,
  Users,
  Video,
  Volume2,
  VolumeX,
  Waves,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { sceneCue } from '@/lib/radioFx';
import { warpScreen } from '@/lib/warp';
import { isThermal } from '@/lib/thermal';
import { pilotVoiceReady, primePilotVoice, warmPilotVoice } from '@/lib/pilotVoice';
import { speak, stopSpeaking } from '@/features/map/lib/speech';
import { useExperience } from '@/features/experience';
import { SceneStage, useSceneSound } from '@/components/scene/kit';
import { AlarmScene, ALARM_SECONDS, IntroScene, LiveDataScene } from '@/components/demo/scenesRide';
import { HazardScene, HAZARD_SECONDS, NavigationScene, NAVIGATION_SECONDS, RescueScene, RESCUE_SECONDS } from '@/components/demo/scenesRoads';
import { PillionScene, PILLION_SECONDS, RideTogetherScene, RIDE_TOGETHER_SECONDS } from '@/components/demo/scenesConvoy';
import { AfterRideScene, GarageScene, GARAGE_SECONDS, TrackDayScene, TradingCardsScene } from '@/components/demo/scenesGarage';
import { ArcadeScene, ARCADE_SECONDS } from '@/components/demo/ArcadeScene';
import { BurnScene, ReadyScene, WorldScene } from '@/components/demo/scenesWorld';

/** One cut of a chapter: a scene, played for this long. */
interface Shot {
  Scene: ComponentType;
  seconds: number;
}

interface Chapter {
  id: string;
  title: string;
  /** The line under the title in the lower third. */
  line: string;
  /** What the pause says: one or two sentences. */
  caption: string;
  /** The callouts that land on the card as the film plays: each at its moment (seconds in), as the voice says it. */
  points: { I: LucideIcon; text: string; at: number }[];
  /** The pilot voice over the chapter: each line at its moment (seconds in), timed to the scenes. */
  voice: [number, string][];
  shots: Shot[];
  /** Burn orange for the safety chapters, the accent for the rest. */
  burn?: boolean;
}

/** Crossfade between two shots of one chapter. */
const CUT_MS = 650;
/** Scenes fade out as their loop ends: a chapter pauses this much earlier, on a full frame. */
const END_EARLY = 0.75;
/** How long the chapter's title sits in the lower third. */
const TITLE_SECONDS = 3.4;
/** A line whose moment has long gone (a jump back in the film) isn't read out late. */
const VOICE_LATE = 1.5;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The demo tour (`/demo`, and offered once after onboarding): Blacktop as one
 * short film. Each chapter plays its scene (or two, cut together), its title
 * in a lower third and a pilot's radio voice telling the story as it happens
 * (the downloaded pilot voice, or the phone's own voice in radio style), then
 * pauses on the frame with a caption card that says what it was; Continue (or
 * a tap, Space, Enter, →) carries on, with the app's pixel warp between
 * chapters and a squelch for every caption. Ten chapters, about three minutes
 * straight through; Track Day is offered at the end for the riders who want lap
 * times. The progress bar at the top jumps between chapters. Scenes freeze when
 * paused (`SceneStage`). The speaker button mutes the voice and the sounds.
 */
export default function DemoTour() {
  const navigate = useNavigate();
  const { terms, canLean } = useExperience();
  const [soundOn, setSoundOn] = useSceneSound();

  const main: Chapter[] = useMemo(
    () => [
      {
        id: 'intro',
        title: 'Blacktop',
        line: tr("A companion for every ride"),
        caption: tr("Whatever you ride and wherever you're going, Blacktop records the journey, keeps your group together, watches your back and keeps the story. No account to make: it's ready when you are."),
        points: [
          { I: Route, text: tr("Every journey recorded"), at: 2.4 },
          { I: Users, text: tr("Ride out together"), at: 5.6 },
          { I: Shield, text: tr("Safety built in"), at: 7.6 },
        ],
        voice: [
          [0.4, tr("This is Blacktop.")],
          [2.2, tr("A companion for every ride, whatever you ride.")],
          [5.4, tr("It records the journey, keeps your group together, and watches your back.")],
        ],
        shots: [{ Scene: IntroScene, seconds: 10 }],
      },
      {
        id: 'together',
        title: tr("Ride together"),
        line: tr("Convoys, voice and passengers"),
        caption: tr("Start a convoy and share its code. Everyone gets the same route, sees each other on the map and talks through their intercoms, and a passenger can come along on their own phone. When the ride ends, the convoy's data is wiped from the server."),
        points: [
          { I: QrCode, text: tr("Join with a code or a QR"), at: 1.6 },
          { I: Mic, text: tr("Voice through your intercom"), at: 5.6 },
          { I: UserRound, text: tr("A screen for the passenger"), at: 14.8 },
        ],
        voice: [
          [0.4, tr("Ride together.")],
          [1.6, tr("Start a convoy and share the code. Your crew joins in seconds.")],
          [5.4, tr("Everyone's on the map, on the same route, talking through their intercoms.")],
          [9.0, tr("Someone dropping back? One tap, and the convoy regroups.")],
          [14.6, tr("Riding two up? Your passenger gets a screen of their own, to wave, talk, or ask for a stop.")],
        ],
        shots: [
          { Scene: RideTogetherScene, seconds: RIDE_TOGETHER_SECONDS },
          { Scene: PillionScene, seconds: PILLION_SECONDS },
        ],
      },
      {
        id: 'rescue',
        title: tr("Got your back"),
        line: tr("Crash detection and rescue"),
        caption: tr("A hard knock, then a stop, and Blacktop asks if you're OK. No answer, and it calls for help with your location: your convoy, your crew, riders nearby and your emergency contact. Made it home? One tap texts them you're safe, from your own phone."),
        points: [
          { I: AlertTriangle, text: tr("Asks before it calls"), at: 3.6 },
          { I: MapPin, text: tr("Sends where you are"), at: 7.0 },
          { I: Navigation, text: tr("Routes help straight to you"), at: 10.4 },
        ],
        voice: [
          [0.4, tr("Got your back.")],
          [3.5, tr("A hard knock, then a stop, and Blacktop asks if you're okay.")],
          [6.9, tr("No answer, and it calls for help: your convoy, your crew, riders nearby.")],
          [10.3, tr("And the nearest rider is routed straight to you.")],
        ],
        shots: [{ Scene: RescueScene, seconds: RESCUE_SECONDS }],
        burn: true,
      },
      {
        id: 'lock',
        title: tr("Grabbing fuel?"),
        line: tr("A lock for a quick stop"),
        caption: tr("Paying for fuel or nipping into a shop? Lock up with the anti-theft alarm. A nudge chirps, a proper shove sets off the siren, and only your pattern stops it. Your ride waits, paused, until you're back."),
        points: [
          { I: Siren, text: tr("A siren on the phone's own speaker"), at: 4.6 },
          { I: Lock, text: tr("Only your pattern stops it"), at: 8.4 },
          { I: Pause, text: tr("Your ride waits for you"), at: 9.8 },
        ],
        voice: [
          [0.4, tr("Grabbing fuel?")],
          [1.3, tr("Lock up from the ride screen. The first time, you set a pattern.")],
          [4.6, tr("A nudge gets a chirp. A proper shove sets off the siren.")],
          [8.4, tr("Only your pattern stops it, and your ride waits, paused, till you're back.")],
        ],
        shots: [{ Scene: AlarmScene, seconds: ALARM_SECONDS }],
        burn: true,
      },
      {
        id: 'roads',
        title: tr("Roads worth riding"),
        line: tr("Routes, calls and hazards"),
        caption: tr("Plan a twisty route or a loop from your door; if heavy rain sits on it, take the dry line round it. Then follow it turn by turn in a pilot's radio voice, with speed cameras called out, while riders ahead report hazards so everyone behind is warned in time."),
        points: [
          { I: CloudRain, text: tr("Drier routes"), at: 1.2 },
          { I: Radio, text: tr("Directions in a radio voice"), at: 4.0 },
          { I: AlertTriangle, text: tr("Hazards from the riders ahead"), at: 19.2 },
        ],
        voice: [
          [0.3, tr("Roads worth riding.")],
          [1.1, tr("Heavy rain on the route? Take the dry line round it.")],
          [3.9, tr("Then follow it turn by turn, called out in a pilot's radio voice.")],
          [7.0, tr("Speed cameras are called out before you reach them.")],
          [14.4, tr("Spot a hazard? Report it in two taps.")],
          [19.1, tr("Riders behind are warned in time, and ease off as they pass.")],
        ],
        shots: [
          { Scene: NavigationScene, seconds: NAVIGATION_SECONDS },
          { Scene: HazardScene, seconds: HAZARD_SECONDS },
        ],
      },
      {
        id: 'live',
        title: tr("Your ride, live"),
        line: canLean ? tr("Speed, lean and G-force") : tr("Speed and G-force"),
        caption: canLean
          ? tr("Speed, lean angle and G-force on one screen you can read at a glance, with a mini map of what's coming. Rather keep your peaks to yourself? They can stay private.")
          : tr("Speed and G-force on one screen you can read at a glance, with a mini map of what's coming. Rather keep your peaks to yourself? They can stay private."),
        points: [
          { I: Gauge, text: tr("Speed that glows past your limits"), at: 1.6 },
          ...(canLean ? [{ I: Waves, text: tr("Lean angle, left and right"), at: 3.4 }] : []),
          { I: Zap, text: tr("A G-force circle"), at: 4.6 },
        ],
        voice: [
          [0.4, tr("Your ride, live.")],
          [1.5, canLean ? tr("Speed, lean and G-force, on one screen you can read at a glance.") : tr("Speed and G-force, on one screen you can read at a glance.")],
          [5.4, tr("Rather keep your peaks private? They never have to leave your phone.")],
        ],
        shots: [{ Scene: LiveDataScene, seconds: 10 }],
      },
      {
        id: 'after',
        title: tr("After the ride"),
        line: tr("Receipts, replays and cards"),
        caption: tr("Every {0} ends with a receipt and names itself. Relive it as a 3D flyover, or download an overlay video for your action camera. And your riding builds your vehicle its own trading card, tier by tier.", [terms.ride]),
        points: [
          { I: Receipt, text: tr("A receipt every time"), at: 1.4 },
          { I: Video, text: tr("Flyovers and overlay videos"), at: 6.4 },
          { I: IdCard, text: tr("A card that grows with you"), at: 12.4 },
        ],
        voice: [
          [0.4, tr("After the ride.")],
          [1.3, terms.car ? tr("Every drive prints a receipt, and names itself.") : tr("Every ride prints a receipt, and names itself.")],
          [3.9, tr("Badges for how you rode, and a grade for your corners.")],
          [6.3, tr("Relive it as a 3D flyover, or put your numbers over your camera footage.")],
          [12.4, tr("And your riding builds your vehicle a trading card, tier by tier.")],
        ],
        shots: [
          { Scene: AfterRideScene, seconds: 12 },
          { Scene: TradingCardsScene, seconds: 8 },
        ],
      },
      {
        id: 'crew',
        title: tr("Your crew"),
        line: tr("Blacktop World"),
        caption: tr("Start a crew and light up the globe together, as an anonymous glow, never a pin. Weekly boards and challenges, rides your crew can join or watch live, and an arcade for between rides: BlackGrid card battles, a punch machine and more."),
        points: [
          { I: Globe2, text: tr("Crews on a globe"), at: 1.6 },
          { I: Trophy, text: tr("Boards and challenges"), at: 5.4 },
          { I: Gamepad2, text: tr("An arcade between rides"), at: 10.4 },
        ],
        voice: [
          [0.4, tr("Your crew.")],
          [1.5, tr("Crews light up the globe as an anonymous glow, never a pin.")],
          [5.3, tr("Weekly boards and challenges, and rides your crew can join or watch live.")],
          [10.3, tr("And between rides, the arcade: a punch machine, a traffic run, light trails and BlackGrid card battles.")],
        ],
        shots: [
          { Scene: WorldScene, seconds: 10 },
          { Scene: ArcadeScene, seconds: ARCADE_SECONDS },
        ],
      },
      {
        id: 'garage',
        title: tr("The garage"),
        line: tr("Mecha-Nick and the logbook"),
        caption: tr("Keep your vehicles in Mecha-Nick's garage. Each one has a logbook that writes itself, and service reminders that count down as you ride. Selling up? Hand the logbook over to the new keeper."),
        points: [
          { I: Wrench, text: tr("Reminders that count down"), at: 5.2 },
          { I: BookOpen, text: tr("A logbook that writes itself"), at: 7.4 },
          { I: QrCode, text: tr("Hand it on when you sell"), at: 9.4 },
        ],
        voice: [
          [0.4, tr("The garage.")],
          [1.5, tr("Mecha-Nick looks after your vehicles, logging every trip you make.")],
          [5.1, tr("Service reminders count down, and the logbook writes itself.")],
          [9.2, tr("Selling up? Hand the logbook to the new keeper.")],
        ],
        shots: [{ Scene: GarageScene, seconds: GARAGE_SECONDS }],
      },
      {
        id: 'yours',
        title: tr("Yours alone"),
        line: tr("Private by design"),
        caption: tr("No account, no email, no adverts. Your rides live on your phone, back them up whenever you like, and Burn wipes everything, from the phone and the server, with one hold."),
        points: [
          { I: Shield, text: tr("Nothing to sign up for"), at: 1.4 },
          { I: Smartphone, text: tr("Your rides stay on your phone"), at: 3.4 },
          { I: Flame, text: tr("Burn wipes it all"), at: 5.6 },
        ],
        voice: [
          [0.4, tr("Yours alone.")],
          [1.3, tr("No account to make, no email, no adverts. Your rides live on your phone.")],
          [5.5, tr("And Burn wipes it all, phone and server, with one hold.")],
        ],
        shots: [{ Scene: BurnScene, seconds: 10 }],
        burn: true,
      },
    ],
    [terms.ride, terms.car, canLean],
  );

  const track: Chapter = useMemo(
    () => ({
      id: 'track',
      title: tr("Track Day"),
      line: tr("For the lap-timers"),
      caption: tr("Take it to a circuit: laps timed to the thousandth with sectors, a pit crew on a friend's phone sending pit board calls to your helmet, and records on real circuits around the world."),
      points: [
        { I: Timer, text: tr("Laps and sectors"), at: 1.4 },
        { I: Users, text: tr("A pit crew on a friend's phone"), at: 4.6 },
        { I: Trophy, text: tr("Records on real circuits"), at: 8.4 },
      ],
      voice: [
        [0.4, tr("Track Day.")],
        [1.3, tr("Laps timed to the thousandth, with sectors.")],
        [4.5, tr("A friend's phone becomes your pit crew, with calls spoken in your helmet.")],
        [8.3, tr("And records on real circuits around the world.")],
      ],
      shots: [{ Scene: TrackDayScene, seconds: 12 }],
    }),
    [],
  );

  // Where the film is: a main chapter (0..9), the closing frame (main.length) or Track Day (main.length + 1).
  const CLOSING = main.length;
  const TRACK = main.length + 1;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'caption'>('playing');
  const [elapsed, setElapsed] = useState(0);
  // Skipped before the end: the scene carries on quietly under the caption (frozen early it would show nothing yet).
  const [skipped, setSkipped] = useState(false);
  const chapter = idx === TRACK ? track : idx < main.length ? main[idx] : null;

  const ends = useMemo(() => {
    let sum = 0;
    return (chapter?.shots ?? []).map((s) => (sum += s.seconds));
  }, [chapter]);
  const total = Math.max(0, (ends[ends.length - 1] ?? 0) - END_EARLY);
  // The chapter's points land as the voice gets to them; all of them by the pause.
  const landed = !chapter ? 0 : phase === 'caption' ? chapter.points.length : chapter.points.filter((p) => elapsed >= Math.min(p.at, total)).length;
  const shot = phase === 'caption' ? ends.length - 1 : Math.max(0, ends.findIndex((e) => elapsed < e));

  // The shot that's fading out after a cut.
  const [fading, setFading] = useState<number | null>(null);
  const lastShot = useRef(shot);
  useEffect(() => {
    if (shot === lastShot.current) return;
    const out = lastShot.current;
    lastShot.current = shot;
    setFading(out);
    if (soundOn) sceneCue('whoosh');
    const t = window.setTimeout(() => setFading(null), CUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  // The film's clock: runs while a chapter plays, stops for its caption.
  useEffect(() => {
    if (!chapter || phase !== 'playing') return;
    let raf = 0;
    const startedAt = performance.now() - elapsed * 1000;
    const tick = (now: number) => {
      const e = (now - startedAt) / 1000;
      if (e >= total) {
        setElapsed(total);
        setPhase('caption');
        return;
      }
      setElapsed(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, total]);

  // Each point lands with a soft tick.
  const lastLanded = useRef(0);
  useEffect(() => {
    if (phase === 'playing' && landed > lastLanded.current && soundOn) sceneCue('tap');
    lastLanded.current = phase === 'playing' ? landed : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, phase]);

  // A caption opens like a radio call.
  useEffect(() => {
    if (phase === 'caption' && soundOn) sceneCue('radioIn');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  // Each chapter comes in with a sweep.
  useEffect(() => {
    if (!soundOn) return;
    sceneCue('whoosh');
    if (idx === CLOSING) {
      window.setTimeout(() => sceneCue('success'), 350);
      window.setTimeout(() => speak(tr("That's Blacktop. Let's ride."), { radio: true }), 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // The pilot voice tells the story: each line goes out on the radio as the film reaches it.
  const said = useRef(-1);
  useEffect(() => {
    said.current = -1;
  }, [idx]);
  useEffect(() => {
    if (!chapter || phase !== 'playing' || !soundOn) return;
    const lines = chapter.voice;
    while (said.current + 1 < lines.length && lines[said.current + 1][0] <= elapsed) {
      said.current += 1;
      const [at, line] = lines[said.current];
      if (elapsed - at < VOICE_LATE) speak(line, { radio: true });
    }
  }, [chapter, elapsed, phase, soundOn]);

  // The pilot voice makes each chapter's lines while the one before is on, so they go out on time.
  useEffect(() => {
    if (!pilotVoiceReady()) return;
    warmPilotVoice();
    chapter?.voice.forEach(([, line]) => primePilotVoice(line));
  }, [chapter]);
  useEffect(() => {
    if (phase !== 'caption' || !pilotVoiceReady()) return;
    const next = idx === TRACK ? null : idx + 1 < main.length ? main[idx + 1] : null;
    next?.voice.forEach(([, line]) => primePilotVoice(line));
  }, [phase, idx, main, TRACK]);

  // Nothing talks on after the tour, a chapter change or the sound going off.
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (!soundOn) stopSpeaking();
  }, [soundOn]);

  const go = useCallback(
    (next: number) => {
      stopSpeaking();
      warpScreen();
      lastShot.current = 0;
      setFading(null);
      setElapsed(0);
      setSkipped(false);
      setPhase('playing');
      setIdx(next);
    },
    [],
  );

  const onContinue = () => {
    if (soundOn) sceneCue('radioOut');
    if (idx === TRACK) go(CLOSING);
    else go(idx + 1);
  };
  const onBack = () => {
    if (idx === TRACK) go(CLOSING);
    else if (idx > 0) go(idx - 1);
  };
  /** A tap on the playing film skips to its caption. */
  const skipAhead = () => {
    if (phase !== 'playing' || !chapter) return;
    setSkipped(true);
    setElapsed(total);
    setPhase('caption');
  };
  const close = () => {
    const state = window.history.state as { idx?: number } | null;
    if (state?.idx && state.idx > 0) navigate(-1);
    else navigate('/');
  };

  // Space / Enter / → carry on (or skip ahead), ← goes back, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') onBack();
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        if (idx === CLOSING) return;
        e.preventDefault();
        if (phase === 'playing') skipAhead();
        else onContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const still = isThermal() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const number = idx === TRACK ? '+' : pad(idx + 1);
  const accentVar = chapter?.burn ? 'var(--burn)' : 'var(--accent)';

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col safe-frame no-frost tour-root"
      style={{ ['--tour' as string]: accentVar }}
      data-no-pull
    >
      {/* The film's progress: one segment a chapter, tap one to jump there. */}
      <div className="px-4 pt-3 landscape:pt-2">
        <div className="flex gap-1" role="tablist" aria-label={tr("Tour chapters")}>
          {main.map((c, i) => {
            const fill = i < idx || idx >= CLOSING ? 1 : i === idx ? (phase === 'caption' ? 1 : total ? elapsed / total : 0) : 0;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={c.title}
                onClick={() => go(i)}
                className="tall-hit relative flex-1 h-1 rounded-full bg-white/15 overflow-hidden"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${fill * 100}%`, background: c.burn ? 'hsl(var(--burn))' : 'hsl(var(--accent))' }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2">
          <button type="button" onClick={close} aria-label={tr("Close the tour")} className="glove-hit w-9 h-9 rounded-full frost-accent flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
            {idx === CLOSING ? tr("The end") : idx === TRACK ? tr("Bonus") : tr("{0} of {1}", [idx + 1, main.length])}
          </p>
          <button
            type="button"
            onClick={() => setSoundOn(!soundOn)}
            aria-label={soundOn ? tr("Mute sound") : tr("Play sound")}
            aria-pressed={soundOn}
            className="glove-hit w-9 h-9 rounded-full frost-accent flex items-center justify-center"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {chapter ? (
        <div className="flex-1 min-h-0 flex flex-col landscape:flex-row items-center justify-start gap-4 landscape:gap-6 px-4 pt-[6dvh] landscape:pt-3 pb-3 overflow-y-auto">
          {/* The screen */}
          <div
            key={`stage-${idx}`}
            className="landscape:my-auto tour-stage relative w-full max-w-[min(100%,calc((100dvh_-_14rem)*1.6))] landscape:max-w-[min(62%,calc((100dvh_-_6rem)*1.6))] shrink-0 rounded-2xl overflow-hidden"
          >
            {chapter.shots.map((s, i) => {
              if (i !== shot && i !== fading) return null;
              return (
                <div
                  key={i}
                  className={cn(i === shot ? 'relative' : 'absolute inset-0', i === fading && 'tour-cut-out')}
                  style={i === shot && fading !== null ? { animation: `tour-cut-in ${CUT_MS}ms ease-out both` } : undefined}
                >
                  <SceneStage.Provider value={{ paused: i !== shot || (phase !== 'playing' && !skipped), bare: true, muted: phase !== 'playing' }}>
                    <s.Scene />
                  </SceneStage.Provider>
                </div>
              );
            })}

            {/* A flash of the chapter colour as it starts */}
            {!still && <div key={`flash-${idx}`} className="tour-flash pointer-events-none absolute inset-0" />}

            {/* Lower third: the chapter's number and name */}
            <div
              className={cn(
                'pointer-events-none absolute left-0 bottom-0 right-0 transition-opacity duration-500',
                phase === 'playing' && elapsed < TITLE_SECONDS ? 'opacity-100' : 'opacity-0',
              )}
            >
              {/* A frosted band behind the title only, fading up into the scene so the animation stays clear above it. */}
              <div className="tour-mica absolute inset-x-0 bottom-0 h-full" aria-hidden />
              <div className="relative p-3 sm:p-4">
              <div key={`lt-${idx}`} className="tour-lower flex items-end gap-3">
                <span className="font-mono font-black text-4xl sm:text-5xl leading-none" style={{ color: `hsl(${accentVar})` }}>
                  {number}
                </span>
                <div className="pb-0.5 min-w-0">
                  {/* The intro scene spells out BLACKTOP itself. */}
                  {chapter.id !== 'intro' && <p className="font-black leading-none text-white truncate text-xl sm:text-2xl tracking-tight">{chapter.title}</p>}
                  <p className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-white/70 mt-1 truncate">{chapter.line}</p>
                </div>
              </div>
              </div>
            </div>

            {/* Tap the film to skip ahead to the caption */}
            {phase === 'playing' && (
              <button type="button" onClick={skipAhead} aria-label={tr("Skip ahead")} className="absolute inset-0 w-full h-full cursor-pointer" />
            )}
          </div>

          {/* The card beside (or under) the film: while it plays, the chapter's points land one by one,
              like callouts; when it pauses, the card opens into the caption with Continue. */}
          <div
            key={`cap-${idx}`}
            className="landscape:my-auto tour-caption w-full max-w-md landscape:max-w-sm rounded-3xl border bg-card/95 p-5 short:p-4 shadow-2xl"
            style={{ borderColor: `hsl(${accentVar} / ${phase === 'caption' ? 0.55 : 0.25})` }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: `hsl(${accentVar})` }}>
              {number} · {chapter.line}
            </p>
            <h2 className="text-2xl short:text-xl font-black tracking-tight text-foreground mt-1">{chapter.title}</h2>
            {phase === 'caption' && <p className="tour-point text-sm short:text-xs text-muted-foreground leading-relaxed mt-2 short:mt-1">{chapter.caption}</p>}
            {/* A short landscape screen has room for the points while it plays, or the caption when it pauses. */}
            <ul className={cn('mt-3 short:mt-2 space-y-1.5 short:space-y-1', phase === 'caption' && 'short:hidden')}>
              {chapter.points.map((p, i) =>
                i < landed ? (
                  <li key={i} className="tour-point flex items-center gap-2.5 text-sm text-foreground">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `hsl(${accentVar} / 0.14)` }}>
                      <p.I className="w-3.5 h-3.5" style={{ color: `hsl(${accentVar})` }} />
                    </span>
                    {p.text}
                  </li>
                ) : null,
              )}
            </ul>
            {phase === 'caption' ? (
              <div className="tour-point flex gap-2 mt-5 short:mt-3">
                {idx > 0 && (
                  <Button variant="outline" className="h-12 w-12 shrink-0 rounded-xl" onClick={onBack} aria-label={tr("Back")}>
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                )}
                <Button
                  autoFocus
                  className="h-12 flex-1 rounded-xl text-base font-bold"
                  style={{ background: `hsl(${accentVar})`, color: chapter.burn ? '#fff' : undefined }}
                  onClick={onContinue}
                >
                  {idx === main.length - 1 || idx === TRACK ? tr("Finish") : tr("Continue")}
                </Button>
              </div>
            ) : (
              <button type="button" onClick={skipAhead} className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                <SkipForward className="w-3.5 h-3.5" />
                {tr("Skip ahead")}
              </button>
            )}
          </div>
        </div>
      ) : (
        // The closing frame
        // Auto margins, never justify-center: a column taller than a short screen would lose its top for good.
        <div className="flex-1 min-h-0 flex flex-col landscape:flex-row items-center gap-5 short:gap-4 px-4 py-3 overflow-y-auto">
          <div className="my-auto tour-stage relative w-full max-w-[min(100%,calc((100dvh_-_22rem)*1.6))] landscape:max-w-[min(55%,calc((100dvh_-_6rem)*1.6))] shrink-0 rounded-2xl overflow-hidden">
            <SceneStage.Provider value={{ paused: false, bare: true }}>
              <ReadyScene />
            </SceneStage.Provider>
          </div>
          <div className="my-auto tour-caption w-full max-w-md landscape:max-w-sm text-center landscape:text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">Blacktop</p>
            <h2 className="text-3xl short:text-2xl font-black tracking-tight text-foreground mt-1">{tr("Your Blacktop, your way")}</h2>
            <p className="text-sm short:text-xs text-muted-foreground leading-relaxed mt-2 short:mt-1">
              {tr("Switch on what you want and leave the rest. Everything you've seen is in the app, a tap or two away.")}
            </p>
            <div className="flex flex-col gap-2 mt-5 short:mt-3">
              <Button className="h-12 short:h-10 rounded-xl text-base font-bold" onClick={() => navigate('/')}>
                {tr("Let's ride")}
              </Button>
              <Button variant="outline" className="h-11 short:h-10 rounded-xl gap-2" onClick={() => go(0)}>
                <RotateCcw className="w-4 h-4" />
                {tr("Watch again")}
              </Button>
              {/* Track Day: for the riders who want lap times, not in the main film. */}
              <button
                type="button"
                onClick={() => go(TRACK)}
                className="mt-1 flex items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-3 short:p-2 text-left hover:border-accent/60 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
                  <Timer className="w-5 h-5 text-accent" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-foreground">{tr("Into lap times? See Track Day")}</span>
                  <span className="block text-xs text-muted-foreground">{tr("Timing, a pit crew and circuit records")}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
