import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { requestMotionAccess } from '@/lib/motionPermission';
import { isNimiqPayHost } from '@/features/tips/lib/walletBridge';

/**
 * /device-check: a developer page (not linked anywhere, not translated) that
 * tests every device feature Blacktop relies on in whatever browser opened it,
 * mainly for checking the Nimiq Pay mini-app WebView. Checks that need a tap
 * (permissions) run from "Run tap checks"; Copy report gives plain text.
 */

type State = 'ok' | 'fail' | 'unknown' | 'running';
type Result = { state: State; detail: string };
type Check = { id: string; label: string; uses: string };

const PASSIVE: Check[] = [
  { id: 'secure', label: 'Secure context (https)', uses: 'GPS, sensors, mic, camera' },
  { id: 'host', label: 'Nimiq Pay host', uses: 'Payments, host language' },
  { id: 'storage', label: 'Local storage', uses: 'Settings, rides, crews' },
  { id: 'persist', label: 'Storage kept since last open', uses: 'Everything saved on the phone' },
  { id: 'idb', label: 'IndexedDB', uses: 'Offline map packs, ride data' },
  { id: 'sw', label: 'Service worker', uses: 'Push notifications' },
  { id: 'push', label: 'Web Push', uses: 'Rescue, crew and weather alerts' },
  { id: 'webrtc', label: 'WebRTC', uses: 'Convoy voice chat' },
  { id: 'webgl', label: 'WebGL', uses: 'Map, backdrop' },
  { id: 'wakeapi', label: 'Wake Lock API', uses: 'Screen on during rides' },
  { id: 'speechapi', label: 'Speech synthesis', uses: 'Turn-by-turn voice' },
];

const TAP: Check[] = [
  { id: 'motion', label: 'Motion sensor events', uses: 'Crash detection, G-force, alarm' },
  { id: 'orientation', label: 'Orientation events', uses: 'Lean angle, alarm' },
  { id: 'location', label: 'Location fix', uses: 'Rides, map, rescue position' },
  { id: 'mic', label: 'Microphone', uses: 'Convoy voice chat' },
  { id: 'camera', label: 'Camera', uses: 'QR scanning' },
  { id: 'wake', label: 'Screen wake lock', uses: 'Screen on during rides' },
  { id: 'audio', label: 'Audio playback', uses: 'Radio calls, alarm, beeps' },
  { id: 'speech', label: 'Speak a phrase', uses: 'Turn-by-turn voice' },
  { id: 'notify', label: 'Notification permission', uses: 'Push alerts' },
];

const LAST_KEY = 'blacktop_devicecheck_last';

const ok = (detail = ''): Result => ({ state: 'ok', detail });
const fail = (detail: string): Result => ({ state: 'fail', detail });
const unknown = (detail: string): Result => ({ state: 'unknown', detail });
const errText = (e: unknown) => {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  // GeolocationPositionError isn't an Error: 1 denied, 2 unavailable, 3 timeout.
  const g = e as { code?: number; message?: string };
  if (typeof g?.code === 'number') return `code ${g.code}: ${g.message || ['', 'denied', 'unavailable', 'timeout'][g.code] || ''}`;
  return String(e);
};

function countEvents(type: 'devicemotion' | 'deviceorientation', ms = 2000): Promise<number> {
  return new Promise((resolve) => {
    // Only events carrying readings count (desktop browsers fire one empty event).
    let n = 0;
    const on = (e: Event) => {
      const m = e as DeviceMotionEvent & DeviceOrientationEvent;
      const a = type === 'devicemotion' ? m.accelerationIncludingGravity?.x : m.beta;
      if (a != null) n++;
    };
    window.addEventListener(type, on);
    setTimeout(() => {
      window.removeEventListener(type, on);
      resolve(n);
    }, ms);
  });
}

async function passiveChecks(): Promise<Record<string, Result>> {
  const r: Record<string, Result> = {};
  r.secure = window.isSecureContext ? ok(location.protocol) : fail(location.protocol);
  const lang = (window as unknown as { nimiqPay?: { language?: string } }).nimiqPay?.language;
  r.host = isNimiqPayHost() ? ok(`language ${lang ?? '?'}`) : unknown('not inside Nimiq Pay');

  try {
    const prev = localStorage.getItem(LAST_KEY);
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    r.storage = ok();
    r.persist = prev ? ok(`last opened ${new Date(prev).toLocaleString()}`) : unknown('first open: close Nimiq Pay fully, reopen and check again');
  } catch (e) {
    r.storage = fail(errText(e));
    r.persist = fail('no storage');
  }

  r.idb = await new Promise<Result>((resolve) => {
    try {
      const req = indexedDB.open('blacktop-devicecheck');
      req.onsuccess = () => {
        req.result.close();
        resolve(ok());
      };
      req.onerror = () => resolve(fail(String(req.error)));
      setTimeout(() => resolve(unknown('no answer in 3 s')), 3000);
    } catch (e) {
      resolve(fail(errText(e)));
    }
  });

  if (!('serviceWorker' in navigator)) r.sw = fail('not supported');
  else {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      r.sw = ok(`${regs.length} registered`);
    } catch (e) {
      r.sw = fail(errText(e));
    }
  }
  r.push = 'PushManager' in window && 'Notification' in window
    ? ok(`permission ${Notification.permission}`)
    : fail('PushManager or Notification missing');
  r.webrtc = typeof RTCPeerConnection === 'function' ? ok() : fail('RTCPeerConnection missing');
  try {
    const c = document.createElement('canvas');
    r.webgl = c.getContext('webgl2') ? ok('webgl2') : c.getContext('webgl') ? ok('webgl1') : fail('no context');
  } catch (e) {
    r.webgl = fail(errText(e));
  }
  r.wakeapi = 'wakeLock' in navigator ? ok() : fail('navigator.wakeLock missing');
  if (!('speechSynthesis' in window)) r.speechapi = fail('missing');
  else {
    const voices = speechSynthesis.getVoices();
    r.speechapi = ok(`${voices.length} voices${voices.length ? '' : ' (may load late)'}`);
  }
  return r;
}

async function tapCheck(id: string): Promise<Result> {
  try {
    switch (id) {
      case 'motion': {
        const granted = await requestMotionAccess();
        const n = await countEvents('devicemotion');
        return n > 0 ? ok(`${n} events in 2 s`) : fail(granted ? 'allowed but no events (move the phone)' : 'not allowed');
      }
      case 'orientation': {
        const n = await countEvents('deviceorientation');
        return n > 0 ? ok(`${n} events in 2 s`) : fail('no events');
      }
      case 'location': {
        if (!('geolocation' in navigator)) return fail('geolocation missing');
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }),
        );
        return ok(`±${Math.round(pos.coords.accuracy)} m`);
      }
      case 'mic': {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        return ok();
      }
      case 'camera': {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        s.getTracks().forEach((t) => t.stop());
        return ok();
      }
      case 'wake': {
        if (!('wakeLock' in navigator)) return fail('API missing');
        const lock = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
        await lock.release();
        return ok();
      }
      case 'audio': {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return fail('AudioContext missing');
        const ctx = new Ctx();
        await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.08;
        osc.frequency.value = 880;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        const state = ctx.state;
        setTimeout(() => void ctx.close(), 400);
        return state === 'running' ? ok('you should hear a beep') : fail(`context ${state}`);
      }
      case 'speech': {
        if (!('speechSynthesis' in window)) return fail('missing');
        return await new Promise<Result>((resolve) => {
          const u = new SpeechSynthesisUtterance('Blacktop radio check');
          u.onend = () => resolve(ok('spoke'));
          u.onerror = (e) => resolve(fail(e.error));
          speechSynthesis.speak(u);
          setTimeout(() => resolve(unknown('no end event in 5 s')), 5000);
        });
      }
      case 'notify': {
        if (!('Notification' in window)) return fail('Notification missing');
        const p = await Notification.requestPermission();
        return p === 'granted' ? ok(p) : fail(p);
      }
    }
    return unknown('not run');
  } catch (e) {
    return fail(errText(e));
  }
}

function Icon({ state }: { state?: State }) {
  if (state === 'running') return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (state === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (state === 'fail') return <XCircle className="w-4 h-4 text-destructive" />;
  return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
}

export default function DeviceCheck() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void passiveChecks().then((r) => setResults((prev) => ({ ...prev, ...r })));
  }, []);

  // One tap runs them in turn (motion first: iOS only grants it straight from a tap).
  const runTaps = async () => {
    setRunning(true);
    for (const c of TAP) {
      setResults((prev) => ({ ...prev, [c.id]: { state: 'running', detail: '' } }));
      const r = await tapCheck(c.id);
      setResults((prev) => ({ ...prev, [c.id]: r }));
    }
    setRunning(false);
  };

  const report = () =>
    [
      `Blacktop device check ${new Date().toISOString()}`,
      navigator.userAgent,
      ...[...PASSIVE, ...TAP].map((c) => {
        const r = results[c.id];
        return `${r?.state ?? 'not run'}\t${c.label}${r?.detail ? ` (${r.detail})` : ''}`;
      }),
    ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      toast.success('Report copied');
    } catch {
      toast.error('Could not copy. Take a screenshot instead.');
    }
  };

  const Row = ({ c }: { c: Check }) => {
    const r = results[c.id];
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
        <div className="pt-0.5"><Icon state={r?.state} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.label}</p>
          <p className="text-[11px] text-muted-foreground">{c.uses}</p>
          {r?.detail && <p className="text-[11px] text-muted-foreground break-words mt-0.5">{r.detail}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] px-4 pb-10 safe-top safe-bottom max-w-lg mx-auto">
      <PageHeader title="Device check" subtitle="What this browser lets Blacktop do" backTo="/" />
      <p className="text-xs text-muted-foreground mb-4 break-words">{navigator.userAgent}</p>

      <div className="rounded-2xl bg-card/50 border border-border/50 px-3 mb-4">
        {PASSIVE.map((c) => <Row key={c.id} c={c} />)}
      </div>

      <Button className="w-full h-12 rounded-2xl mb-3" onClick={runTaps} disabled={running}>
        {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Run tap checks (allow each prompt)
      </Button>
      <p className="text-[11px] text-muted-foreground mb-3">Hold the phone in your hand and move it a little while the motion checks run.</p>

      <div className="rounded-2xl bg-card/50 border border-border/50 px-3 mb-4">
        {TAP.map((c) => <Row key={c.id} c={c} />)}
      </div>

      <Button variant="outline" className="w-full h-12 rounded-2xl" onClick={copy}>
        <Copy className="w-4 h-4 mr-2" />
        Copy report
      </Button>
    </div>
  );
}
