import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { syncPush } from '../lib/push';

/**
 * Mounted once inside the router: keeps this device's push subscription
 * current on launch, and routes a tapped notification inside the running app
 * (the notifications worker posts the path instead of reloading the page).
 */
export function PushBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    void syncPush();
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; path?: string } | null;
      if (d?.type === 'bt-push-open' && typeof d.path === 'string' && d.path.startsWith('/')) navigate(d.path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}
