import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeCrew } from '@/features/crew/useCrew';
import { schedulePushResync, syncPush } from '../lib/push';

const RESYNC_EVERY_MS = 60 * 60 * 1000;

/**
 * Mounted once inside the router. Keeps this device's push registration
 * current (on launch, when the crew changes, and hourly while in use; the
 * ride history reports each ride's end point for weather alerts), and routes a tapped
 * notification inside the running app (the worker posts the path instead of
 * reloading the page).
 */
export function PushBridge() {
  const navigate = useNavigate();
  const lastSync = useRef(Date.now());

  useEffect(() => {
    void syncPush();
    const unsubscribe = subscribeCrew(() => schedulePushResync());
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastSync.current < RESYNC_EVERY_MS) return;
      lastSync.current = Date.now();
      schedulePushResync(0);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
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
