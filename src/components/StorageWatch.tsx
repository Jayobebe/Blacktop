import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { notify } from '@/lib/inbox';
import { getActiveRideStatus } from '@/features/ride';
import { bytesText, storageEstimate } from '@/lib/storageEstimate';

const WARNED_KEY = 'blacktop_storage_warned';
/** Warned under this share of Blacktop's room left on the phone. */
const LOW_SHARE = 0.1;

/**
 * Low storage, said inside the app only (never a push): when less than a tenth
 * of the room the phone gives Blacktop is left, a notice with a button to the
 * Storage page, kept in Blacktop Console's notifications too. Checked once the
 * app has settled after launch and on coming back to it, at most once a day,
 * and never mid-ride (it waits for the next check).
 */
export function StorageWatch() {
  const navigate = useNavigate();
  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible' || getActiveRideStatus().isActive) return;
      const day = new Date().toISOString().slice(0, 10);
      try {
        if (localStorage.getItem(WARNED_KEY) === day) return;
      } catch {
        return;
      }
      busy = true;
      try {
        const est = await storageEstimate();
        if (!est || est.quota <= 0) return;
        const left = Math.max(0, est.quota - est.usage);
        if (left / est.quota >= LOW_SHARE) return;
        try {
          localStorage.setItem(WARNED_KEY, day);
        } catch {
          /* warned again next time */
        }
        const title = tr("Storage nearly full");
        const body = tr("Blacktop has {0} left on this phone. Clear old videos or map packs to make room.", [bytesText(left)]);
        notify({ kind: 'storage', title, body, url: '/storage' });
        toast.warning(title, { description: body, action: { label: tr("Storage"), onClick: () => navigate('/storage') } });
      } finally {
        busy = false;
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    const first = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(() => void check(), { timeout: 5000 }) : void check()), 8000);
    const onShow = () => void check();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [navigate]);
  return null;
}
