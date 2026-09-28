import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Mic, Camera, Bell, CheckCircle2, XCircle, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { enablePush, getPushState, usePush } from '@/features/notifications';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

type Status = 'pending' | 'granted' | 'denied';
const STORAGE_KEY = 'blacktop_permissions_prompted_v1';

interface PermState {
  location: Status;
  mic: Status;
  camera: Status;
  notifications: Status;
}

interface Props {
  onComplete: () => void;
}

export function PermissionsPrompt({ onComplete }: Props) {
  const [perms, setPerms] = useState<PermState>({
    location: 'pending',
    mic: 'pending',
    camera: 'pending',
    notifications: 'pending',
  });
  const push = usePush();
  const [busy, setBusy] = useState<keyof PermState | null>(null);

  const requestLocation = async () => {
    setBusy('location');
    try {
      await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
      );
      setPerms(p => ({ ...p, location: 'granted' }));
    } catch {
      setPerms(p => ({ ...p, location: 'denied' }));
    } finally {
      setBusy(null);
    }
  };

  const requestMic = async () => {
    setBusy('mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPerms(p => ({ ...p, mic: 'granted' }));
    } catch {
      setPerms(p => ({ ...p, mic: 'denied' }));
    } finally {
      setBusy(null);
    }
  };

  const requestCamera = async () => {
    setBusy('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(t => t.stop());
      setPerms(p => ({ ...p, camera: 'granted' }));
    } catch {
      setPerms(p => ({ ...p, camera: 'denied' }));
    } finally {
      setBusy(null);
    }
  };

  const requestNotifications = async () => {
    setBusy('notifications');
    const ok = await enablePush();
    const { permission, error } = getPushState();
    setPerms(p => ({ ...p, notifications: ok || permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'pending' }));
    // Permission granted but the server isn't ready: it retries on the next launch.
    if (!ok && permission === 'granted' && error) toast(error, { description: tr("Blacktop will finish setting them up next time you open it.") });
    setBusy(null);
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    onComplete();
  };

  const Row = ({
    icon: Icon,
    title,
    desc,
    status,
    onRequest,
    busyHere,
  }: {
    icon: React.ElementType;
    title: string;
    desc: string;
    status: Status;
    onRequest?: () => void;
    busyHere: boolean;
  }) => (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all',
        status === 'granted'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : status === 'denied'
          ? 'bg-destructive/10 border-destructive/30'
          : 'bg-card border-border'
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          status === 'granted' ? 'bg-emerald-500/20' : status === 'denied' ? 'bg-destructive/20' : 'bg-accent/20'
        )}
      >
        <Icon
          className={cn(
            'w-5 h-5',
            status === 'granted' ? 'text-emerald-400' : status === 'denied' ? 'text-destructive' : 'text-accent'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {status === 'granted' ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
      ) : status === 'denied' ? (
        <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
      ) : !onRequest ? null : (
        <Button size="sm" variant="outline" onClick={onRequest} disabled={busyHere} className="flex-shrink-0 h-8">
          {busyHere ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("Allow")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4 safe-top safe-bottom">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent/15 flex items-center justify-center">
            <Shield className="w-6 h-6 text-accent" />
          </div>
          <h2 className="text-xl font-semibold">{tr("Quick setup")}</h2>
          <p className="text-xs text-muted-foreground">
            {tr("Grant access so features work when you need them. You can change these later in device settings.")}
          </p>
        </div>

        <div className="space-y-3">
          <Row
            icon={MapPin}
            title={tr("Location")}
            desc={tr("Track speed, distance and convoy position during rides")}
            status={perms.location}
            onRequest={requestLocation}
            busyHere={busy === 'location'}
          />
          <Row
            icon={Mic}
            title={tr("Microphone")}
            desc={tr("Voice chat with your convoy")}
            status={perms.mic}
            onRequest={requestMic}
            busyHere={busy === 'mic'}
          />
          <Row
            icon={Camera}
            title={tr("Camera")}
            desc={tr("Scan QR codes to join convoys")}
            status={perms.camera}
            onRequest={requestCamera}
            busyHere={busy === 'camera'}
          />
          {(push.support === 'supported' || push.support === 'needs-install') && (
            <Row
              icon={Bell}
              title={tr("Notifications")}
              desc={
                push.support === 'supported'
                  ? tr("Alerts from Blacktop, even when the app is closed")
                  : tr("On iPhone, add Blacktop to your Home Screen first, then turn them on in Settings")
              }
              status={perms.notifications}
              onRequest={push.support === 'supported' ? requestNotifications : undefined}
              busyHere={busy === 'notifications'}
            />
          )}
        </div>

        <Button onClick={finish} className="w-full h-12 rounded-2xl text-base font-semibold touch-target">
          {tr("Continue")}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          {tr("Denied permissions can be re-enabled later from your device settings.")}
        </p>
      </div>
    </div>
  );
}

export function usePermissionsPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
  }, []);
  return { show, dismiss: () => setShow(false) };
}
