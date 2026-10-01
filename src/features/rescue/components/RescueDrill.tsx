import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Siren, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/features/settings';
import { useCrew } from '@/features/crew/useCrew';
import { useDiscordIntegration } from '@/features/integrations/discord';
import { usePush } from '@/features/notifications';
import { useExperience } from '@/features/experience';
import { requestMotionAccess } from '@/lib/motionPermission';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { CrashCheckPrompt } from './CrashCheckPrompt';
import { useSafetyStatus } from '../hooks/useSafetyStatus';
import { rescueReach } from '../lib/reach';
import { cleanPhone } from '../lib/emergencyText';
import { closeDrill, drillListeners, isDrillOpen, openRescueDrill } from '../lib/drillStore';

/** The drill's countdown (a real crash check waits 5 minutes). */
const DRILL_SECONDS = 15;

type Phase = 'intro' | 'check' | 'result';
type Line = { state: 'ok' | 'warn' | 'off'; text: string };

/** Readings that carry numbers in the last 1.5 s (desktop browsers fire one empty event). */
function motionWorks(): Promise<boolean> {
  return new Promise((resolve) => {
    let n = 0;
    const on = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity?.x != null) n++;
    };
    window.addEventListener('devicemotion', on);
    setTimeout(() => {
      window.removeEventListener('devicemotion', on);
      resolve(n > 3);
    }, 1500);
  });
}

/** Settings → Safety and the Home safety sheet (which closes itself via `onOpen`). */
export function RescueDrillButton({ className, onOpen }: { className?: string; onOpen?: () => void }) {
  return (
    <Button
      variant="outline"
      className={cn('w-full h-11 rounded-2xl', className)}
      onClick={() => {
        onOpen?.();
        openRescueDrill();
      }}
    >
      <Siren className="w-4 h-4 mr-2" />
      {tr("Run a rescue drill")}
    </Button>
  );
}

/**
 * A practice run of crash detection. Plays the real "Are you okay?" screen on a short countdown
 * (labelled as a drill), then checks what a real one depends on (crash
 * detection on, motion sensors and location working, notifications) and lists
 * who a real call would reach. Nothing is sent, nothing sounds the siren.
 */
export function RescueDrillHost() {
  const open = useSyncExternalStore(
    (l) => {
      drillListeners.add(l);
      return () => drillListeners.delete(l);
    },
    isDrillOpen,
    () => false,
  );
  // Nothing runs (no Discord, push or crew reads) until a drill is opened.
  return open ? <RescueDrillScreens onClose={closeDrill} /> : null;
}

function RescueDrillScreens({ onClose }: { onClose: () => void }) {
  const [phase, setPhaseState] = useState<Phase>('intro');
  const setPhase = (p: Phase | null) => {
    if (p) setPhaseState(p);
    else onClose();
  };
  const [answered, setAnswered] = useState<'okay' | 'timeout' | null>(null);
  const [motion, setMotion] = useState<boolean | null>(null);
  const { settings } = useSettings();
  const status = useSafetyStatus();
  const crew = useCrew();
  const push = usePush();
  const { integration } = useDiscordIntegration();
  const { showGroup } = useExperience();

  // Escape (and Android's back button, which sends it to open dialogs) ends the drill.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async () => {
    // From the tap: iOS only grants motion access (and plays the caution tone) from one.
    const allowed = await requestMotionAccess();
    setMotion(null);
    setAnswered(null);
    setPhase('check');
    void (allowed ? motionWorks() : Promise.resolve(false)).then(setMotion);
  };

  const finish = (how: 'okay' | 'timeout') => {
    setAnswered(how);
    setPhase('result');
  };

  const reach = rescueReach(settings);
  const lines: Line[] = [
    settings.autoRescueEnabled
      ? { state: 'ok', text: tr("Crash detection is on.") }
      : { state: 'warn', text: tr("Crash detection is off. Turn it on for this to happen by itself after a crash.") },
    motion == null
      ? { state: 'off', text: tr("Checking the motion sensors…") }
      : motion
        ? { state: 'ok', text: tr("Motion sensors are working.") }
        : { state: 'warn', text: tr("No motion sensor readings. Crash detection can't feel a crash on this phone right now.") },
    status.location === 'denied'
      ? { state: 'warn', text: tr("Location is blocked, so a rescue call can't say where you are.") }
      : status.location === 'granted'
        ? { state: 'ok', text: tr("Location is allowed, so a rescue call includes where you are.") }
        : { state: 'off', text: tr("Location is checked when you start a ride.") },
    push.enabled
      ? { state: 'ok', text: tr("Notifications are on, so you'll hear when someone else calls for help.") }
      : { state: 'off', text: tr("Notifications are off, so you won't hear when someone else calls for help.") },
  ];

  const who: string[] = [];
  if (showGroup && reach.convoy) who.push(tr("Everyone in your convoy, when you're riding in one"));
  if (reach.crew) for (const c of crew.crews) who.push(c.name);
  if (reach.discord && integration) who.push(tr("Discord: {0}", [integration.server_name || tr("Connected")]));
  if (reach.nearbyKm) who.push(tr("Riders within {0} km who've opted in to help", [reach.nearbyKm]));
  if (cleanPhone(settings.emergencyContactPhone ?? '')) {
    const name = settings.emergencyContactName?.trim();
    who.push(name ? tr("{0}, by a text you send from the crash screen", [name]) : tr("Your emergency contact, by a text you send from the crash screen"));
  }

  return (
    <>
      {phase === 'check' &&
        createPortal(
          <>
            <CrashCheckPrompt
              timeoutSec={DRILL_SECONDS}
              onImFine={() => finish('okay')}
              onSendNow={() => finish('timeout')}
              onTimeout={() => finish('timeout')}
            />
            <div className="fixed top-0 inset-x-0 z-[61] flex justify-center safe-top pointer-events-none" role="dialog" data-state="open" aria-label={tr("Rescue drill")}>
              <span className="mt-3 rounded-full bg-accent text-accent-foreground px-4 py-1.5 text-xs font-black tracking-widest">
                {tr("DRILL · NOTHING IS SENT")}
              </span>
            </div>
          </>,
          document.body,
        )}

      {(phase === 'intro' || phase === 'result') &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 backdrop-blur-md p-4 safe-top safe-bottom animate-fade-in" role="dialog" aria-modal="true" data-state="open">
            <div className="w-full max-w-md max-h-full overflow-y-auto rounded-3xl bg-card border border-border p-5 shadow-2xl">
              {phase === 'intro' ? (
                <>
                  <h2 className="text-xl font-bold mb-1">{tr("Rescue drill")}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {tr("See what happens after a crash, without anything being sent. The crash check counts down from {0} seconds: answer it, or let it run out.", [DRILL_SECONDS])}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12" onClick={() => setPhase(null)}>
                      {tr("Cancel")}
                    </Button>
                    <Button className="flex-1 h-12" onClick={start}>
                      {tr("Start drill")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-1">{tr("Drill finished")}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {answered === 'okay'
                      ? tr("You answered, so a real crash check would stop there.")
                      : tr("No answer in time. For real, the siren would sound and a rescue call would go out.")}
                  </p>

                  <ul className="space-y-2.5 mb-4">
                    {lines.map((l) => (
                      <li key={l.text} className="flex items-start gap-2.5 text-sm">
                        {l.state === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                        ) : l.state === 'warn' ? (
                          <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                        ) : (
                          <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                        )}
                        <span>{l.text}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{tr("A real call would reach")}</p>
                  {who.length ? (
                    <ul className="text-sm space-y-1 mb-4">
                      {who.map((w) => (
                        <li key={w} className="truncate">· {w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-destructive mb-4">{tr("Nobody. Choose who rescue calls reach in Settings → Safety.")}</p>
                  )}

                  <p className="text-xs text-muted-foreground mb-4">{tr("Nothing was sent.")}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12" onClick={start}>
                      {tr("Run again")}
                    </Button>
                    <Button className="flex-1 h-12" onClick={() => setPhase(null)}>
                      {tr("Done")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
