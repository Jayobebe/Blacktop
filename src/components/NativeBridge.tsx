import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isNativeApp } from '@/lib/platform';
import { isAlarmOn } from '@/features/alarm';
import { closeBlacktopMap, isBlacktopMapOpen } from '@/features/map';
import { closeRadioOverlay, isRadioOverlayOpen } from '@/features/radio';

/**
 * Android's back button in the native app (without a listener it closes the
 * app from any screen). Closes the top thing first: an open dialog or sheet,
 * then the radio, then the map; otherwise goes back a screen, and from Home
 * sends the app to the background. Does nothing while the anti-theft lock is
 * up (only the pattern opens it). Renders nothing; not used on the web.
 */
export function NativeBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = App.addListener('backButton', () => {
      if (isAlarmOn()) return;
      // Dialogs, sheets and menus (Radix) close on Escape.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      if (isRadioOverlayOpen()) return closeRadioOverlay();
      if (isBlacktopMapOpen()) return closeBlacktopMap();
      if (pathRef.current === '/') {
        void App.minimizeApp();
        return;
      }
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [navigate]);

  return null;
}

/**
 * blacktoplive.com links that open the installed app (Android App Links, iOS
 * Universal Links: convoy and crew joins, Enterprise codes, rescue pages) go
 * to that page in the app. Renders nothing; not used on the web.
 */
export function NativeLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = App.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        if (u.hostname === 'blacktoplive.com' || u.hostname === 'www.blacktoplive.com') navigate(u.pathname + u.search + u.hash);
      } catch {
        /* not a link we handle */
      }
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [navigate]);
  return null;
}
