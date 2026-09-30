import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Siren } from 'lucide-react';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSettings } from '@/features/settings';
import { getActiveRideStatus } from '@/features/ride';
import { Button } from '@/components/ui/button';
import { getAlarm, noteNudge, setAlarmPhase, useAlarm } from '../lib/alarmStore';
import { pinForAlarm, playAlarmChirp as alarmChirp, startAlarmSiren } from '../lib/alarmSound';
import { disarmAlarm } from '../lib/arm';
import { checkAlarmPattern, MIN_PATTERN_DOTS, saveAlarmPattern } from '../lib/pattern';
import { TamperDetector, type TamperEvent } from '../lib/detector';
import { useTamperSensors } from '../hooks/useTamperSensors';
import { PatternLock } from './PatternLock';

/** Exit delay: mount the phone and step away. */
const EXIT_DELAY_S = 5;
/** Entry delay: the owner's chance to unlock before the siren. */
const ENTRY_DELAY_S = 7;
/** Tries while armed: two wrong patterns warn, the third sets the siren off. */
const MAX_TRIES = 3;

/**
 * The anti-theft lock: mounted once in App.tsx, shown over everything (the map
 * included) while the alarm is on. A big red lock on one half (top in
 * portrait, left in landscape), the pattern pad on the other.
 *
 * It goes on <body> at z-10000, above everything else portaled there (dialogs,
 * sheets, the radio bubble, the logbook hand-over), which would otherwise be
 * able to sit on top of it, and be tappable.
 */
export function AlarmOverlay() {
  const alarm = useAlarm();
  if (alarm.phase === 'off') return null;
  return createPortal(alarm.phase === 'rescue' ? <RescueSirenScreen /> : <AlarmScreen />, document.body);
}

/** The siren and a buzz until stopped (the anti-theft alarm, and auto-rescue). */
function useSiren(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const stop = startAlarmSiren();
    const buzz = () => navigator.vibrate?.([500, 250, 500, 250]);
    buzz();
    const id = setInterval(buzz, 1500);
    return () => {
      stop();
      clearInterval(id);
      navigator.vibrate?.(0);
    };
  }, [on]);
}

/** Keeps the screen on while mounted (sensors and the siren stop with the screen). */
function useScreenOn() {
  const wake = useWakeLock();
  useEffect(() => {
    void wake.request();
    return () => {
      void wake.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * After a crash, once auto-rescue has gone out: the siren so people nearby
 * notice, and a screen that says why to whoever picks the phone up. Anyone can
 * stop it.
 */
function RescueSirenScreen() {
  useScreenOn();
  useSiren(true);
  return (
    <div
      data-no-pull
      data-no-ui-sound
      role="alertdialog"
      aria-modal="true"
      aria-label={tr("Crash detected")}
      className="fixed inset-0 z-[10000] pointer-events-auto flex flex-col items-center justify-center gap-4 px-8 bg-black text-center text-foreground select-none animate-fade-in safe-top safe-bottom"
      style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-0 bg-destructive/30 alarm-flash pointer-events-none" />
      <Siren
        className="relative w-24 h-24 text-destructive animate-pulse"
        strokeWidth={1.8}
        style={{ filter: 'drop-shadow(0 0 34px hsl(var(--destructive) / 0.8))' }}
      />
      <h2 className="relative text-4xl font-semibold tracking-tight text-destructive">{tr("Crash detected")}</h2>
      <p className="relative text-base max-w-xs leading-snug">{tr("Someone here may need help. The siren is sounding so people nearby notice.")}</p>
      <Button size="xl" variant="destructive" className="relative mt-4 w-full max-w-xs" onClick={() => disarmAlarm()}>
        {tr("Stop siren")}
      </Button>
    </div>
  );
}

function AlarmScreen() {
  const alarm = useAlarm();
  const phase = alarm.phase;
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // The screen stays on while the lock is up (sensors stop with the screen).
  useScreenOn();
  // Android app: pinned from arming until it's unlocked (not while setting the pattern).
  const pinned = phase !== 'setup';
  useEffect(() => {
    if (!pinned) return;
    pinForAlarm(true);
    return () => pinForAlarm(false);
  }, [pinned]);

  // ── Watching ──
  const detector = useRef<TamperDetector | null>(null);
  useEffect(() => {
    if (phase === 'arming') detector.current = new TamperDetector(settings.alarmSensitivity ?? 'normal');
  }, [phase, settings.alarmSensitivity]);
  const react = (ev: TamperEvent | null) => {
    if (!ev || getAlarm().phase !== 'armed') return;
    if (ev.kind === 'nudge') {
      noteNudge();
      alarmChirp('nudge');
      haptics.medium();
    } else {
      setAlarmPhase('entry', { cause: ev.cause });
    }
  };
  useTamperSensors(
    phase === 'arming' || phase === 'armed',
    (beta, gamma) => {
      const d = detector.current;
      if (!d) return;
      if (getAlarm().phase === 'arming') d.settle(beta, gamma);
      else react(d.orientation(beta, gamma, performance.now()));
    },
    (g) => {
      const d = detector.current;
      if (d && getAlarm().phase === 'armed') react(d.motion(g, performance.now()));
    },
  );

  // ── Timing, beeps and the siren ──
  useSiren(phase === 'alarm');
  useEffect(() => {
    if (phase === 'arming') {
      const id = setTimeout(() => {
        setAlarmPhase('armed');
        alarmChirp('arm');
        haptics.success();
      }, EXIT_DELAY_S * 1000);
      return () => clearTimeout(id);
    }
    if (phase === 'entry') {
      alarmChirp('entry');
      const beep = setInterval(() => alarmChirp('entry'), 600);
      const id = setTimeout(() => setAlarmPhase('alarm'), ENTRY_DELAY_S * 1000);
      return () => {
        clearInterval(beep);
        clearTimeout(id);
      };
    }
  }, [phase]);

  // ── The pattern ──
  const [tone, setTone] = useState<'idle' | 'error' | 'success'>('idle');
  const [clearKey, setClearKey] = useState(0);
  const [firstDraw, setFirstDraw] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const wrong = useRef(0);
  const busy = useRef(false);
  const settleThen = (t: 'error' | 'success', msg: string | null, then?: () => void) => {
    setTone(t);
    setMessage(msg);
    busy.current = true;
    window.setTimeout(
      () => {
        busy.current = false;
        setTone('idle');
        setClearKey((k) => k + 1);
        setMessage(null);
        then?.();
      },
      t === 'success' ? 350 : 900,
    );
  };

  const onPattern = async (p: number[]) => {
    if (busy.current) return;
    if (phase === 'setup') {
      if (p.length < MIN_PATTERN_DOTS) return settleThen('error', tr("Join at least 4 dots"));
      if (!firstDraw) {
        setFirstDraw(p);
        setClearKey((k) => k + 1);
        return;
      }
      if (firstDraw.join() !== p.join()) {
        setFirstDraw(null);
        return settleThen('error', tr("Those didn't match. Start again."));
      }
      await saveAlarmPattern(p);
      haptics.success();
      return settleThen('success', null, () => setAlarmPhase('arming'));
    }
    if (await checkAlarmPattern(p)) {
      haptics.success();
      return settleThen('success', null, () => {
        alarmChirp('disarm');
        disarmAlarm();
        toast(tr("Alarm off"));
      });
    }
    haptics.error();
    const phaseNow = getAlarm().phase;
    if (phaseNow !== 'armed' && phaseNow !== 'entry') return settleThen('error', tr("Wrong pattern"));
    wrong.current += 1;
    const left = MAX_TRIES - wrong.current;
    if (left <= 0) {
      setAlarmPhase('alarm', { cause: 'attempts' });
      return settleThen('error', tr("Wrong pattern"));
    }
    alarmChirp('nudge');
    settleThen('error', left === 1 ? tr("Wrong pattern. 1 try left.") : tr("Wrong pattern. {0} tries left.", [left]));
  };

  // ── Words ──
  const delay = phase === 'arming' ? EXIT_DELAY_S : ENTRY_DELAY_S;
  const left = Math.max(0, Math.ceil((delay * 1000 - (now - alarm.since)) / 1000));
  const countdown = phase === 'arming' || phase === 'entry' ? Math.max(0, 1 - (now - alarm.since) / (delay * 1000)) : null;
  const nudged = phase === 'armed' && now - alarm.nudgeAt < 3000;
  const ride = getActiveRideStatus();
  let title = '';
  let sub = '';
  switch (phase) {
    case 'setup':
      title = tr("Set your unlock pattern");
      sub = firstDraw ? tr("Draw it again to confirm") : tr("Join at least 4 dots. You'll need this pattern to turn the alarm off.");
      break;
    case 'arming':
      title = tr("Arming…");
      sub = tr("Mount the phone and step away. Armed in {0}s.", [left]);
      break;
    case 'armed':
      title = tr("Alarm armed");
      sub = nudged ? tr("Movement detected") : tr("Draw your pattern to unlock");
      break;
    case 'entry':
      title = tr("Movement detected");
      sub = tr("Unlock now. The alarm sounds in {0}s.", [left]);
      break;
    case 'alarm':
      title = tr("ALARM");
      sub = tr("Draw your pattern to stop it");
      break;
  }
  if (message) sub = message;
  const loud = phase === 'entry' || phase === 'alarm';

  return (
    <div
      data-no-pull
      data-no-ui-sound
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[10000] pointer-events-auto flex flex-col landscape:flex-row bg-black text-foreground select-none animate-fade-in"
      style={{ touchAction: 'none' }}
    >
      {phase === 'alarm' && <div className="absolute inset-0 bg-destructive/30 alarm-flash pointer-events-none" />}

      {/* The lock */}
      <section className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-8 pt-10 landscape:pt-4 safe-top text-center">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {countdown != null && (
            <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
              <circle cx={80} cy={80} r={74} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={4} />
              <circle
                cx={80}
                cy={80}
                r={74}
                fill="none"
                stroke="hsl(var(--destructive))"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={`${(465 * countdown).toFixed(1)} 465`}
                style={{ transition: 'stroke-dasharray 250ms linear' }}
              />
            </svg>
          )}
          <Lock
            className={cn('w-24 h-24 text-destructive', loud && 'animate-pulse')}
            strokeWidth={1.8}
            style={{ filter: `drop-shadow(0 0 ${loud ? 34 : 22}px hsl(var(--destructive) / ${loud ? 0.8 : 0.55}))` }}
          />
        </div>
        <h2 className={cn('font-semibold tracking-tight', phase === 'alarm' ? 'text-4xl text-destructive' : 'text-2xl')}>{title}</h2>
        <p className={cn('text-sm max-w-xs leading-snug', nudged || loud ? 'text-warning' : 'text-muted-foreground', message && tone === 'error' && 'text-destructive')}>{sub}</p>
        {ride.isActive && ride.isPaused && phase !== 'setup' && (
          <p className="text-xs text-muted-foreground/80">{tr("Ride paused. Resume it with play after unlocking.")}</p>
        )}
        {(phase === 'setup' || phase === 'arming') && (
          <Button variant="outline" size="sm" className="mt-1" onClick={() => disarmAlarm()}>
            {tr("Cancel")}
          </Button>
        )}
      </section>

      {/* The pattern */}
      <section className="flex-1 min-h-0 flex items-center justify-center p-6 safe-bottom">
        <PatternLock
          onDone={onPattern}
          tone={tone}
          clearKey={clearKey}
          className="w-[min(78vw,300px)] landscape:w-[min(42vw,70vh)]"
        />
      </section>
    </div>
  );
}
