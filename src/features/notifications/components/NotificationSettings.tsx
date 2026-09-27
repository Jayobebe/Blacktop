import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Loader2, Send, Smartphone, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { disablePush, enablePush, refreshPushPermission, sendTestPush, usePush } from '../lib/push';

/** Settings card: turn push notifications on/off for this device and send a test. */
export function NotificationSettings() {
  const push = usePush();
  const navigate = useNavigate();
  const [testing, setTesting] = useState(false);

  // Coming back from the phone's settings: pick up a changed permission.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refreshPushPermission();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshPushPermission);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshPushPermission);
    };
  }, []);

  const test = async (delayed: boolean) => {
    setTesting(true);
    const r = await sendTestPush(delayed);
    setTesting(false);
    if (r.ok) toast.success(delayed ? 'Test on its way' : 'Test notification sent', { description: r.message, duration: delayed ? 10000 : 4000 });
    else toast.error('Test failed', { description: r.message });
  };

  const text = 'text-[13px] text-muted-foreground leading-relaxed';

  if (push.support === 'needs-install') {
    return (
      <div className="space-y-3">
        <p className={text}>
          On iPhone and iPad, notifications only work from the Blacktop app on your Home Screen (iOS 16.4 or newer).
          Add it there, open Blacktop from the new icon, then come back here.
        </p>
        <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => navigate('/install')}>
          <Smartphone className="w-4 h-4 mr-2" /> How to add it to your Home Screen
        </Button>
      </div>
    );
  }
  if (push.support === 'in-frame') {
    return <p className={text}>Open Blacktop in its own tab or from your Home Screen to turn on notifications.</p>;
  }
  if (push.support === 'native-app') {
    return <p className={text}>Notifications aren't available in this version of the app yet.</p>;
  }
  if (push.support === 'unsupported') {
    return (
      <p className={text}>
        This browser can't show notifications. Use Chrome on Android, or the Home Screen app on iPhone (iOS 16.4 or
        newer).
      </p>
    );
  }

  const blocked = push.permission === 'denied';

  return (
    <div className="space-y-3">
      <p className={text}>
        Blacktop can alert this phone even when the app is closed. Which alerts you get will be listed here as
        they're added.
      </p>

      {blocked && (
        <p className="text-[12px] rounded-xl border border-destructive/40 bg-destructive/10 text-foreground px-3 py-2 leading-relaxed">
          Notifications are blocked for Blacktop on this phone. On Android: long-press the Blacktop icon, tap{' '}
          <span className="font-semibold">App info</span> → <span className="font-semibold">Notifications</span> and
          switch them on (in a Chrome tab: tap the icon left of the address, then{' '}
          <span className="font-semibold">Permissions</span>). On iPhone: Settings → Notifications → Blacktop. Then
          come back and turn them on here.
        </p>
      )}

      {push.error && <p className="text-[12px] text-destructive">{push.error}</p>}

      {push.enabled ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => void test(false)} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send test
            </Button>
            <Button variant="ghost" className="h-11 rounded-xl text-muted-foreground" onClick={() => void disablePush()} disabled={push.busy}>
              <BellOff className="w-4 h-4 mr-2" /> Turn off
            </Button>
          </div>
          <Button variant="ghost" className="w-full h-9 rounded-xl text-xs text-muted-foreground" onClick={() => void test(true)} disabled={testing}>
            <Timer className="w-3.5 h-3.5 mr-1.5" /> Test with the app closed (sends in 10 s)
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => void enablePush()}
          disabled={push.busy || blocked}
          className={cn('w-full h-11 font-semibold rounded-xl touch-target bg-accent hover:bg-accent/90 text-accent-foreground')}
        >
          {push.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
          Turn on notifications
        </Button>
      )}
    </div>
  );
}
