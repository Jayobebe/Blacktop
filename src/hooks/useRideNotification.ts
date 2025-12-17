import { useEffect, useRef, useCallback } from 'react';

interface UseRideNotificationOptions {
  isActive: boolean;
  title?: string;
  body?: string;
}

export function useRideNotification({ 
  isActive, 
  title = 'Blacktop Active',
  body = 'Return to Blacktop' 
}: UseRideNotificationOptions) {
  const notificationRef = useRef<Notification | null>(null);
  const permissionGranted = useRef(false);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('[Notification] Not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      permissionGranted.current = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      permissionGranted.current = permission === 'granted';
      return permissionGranted.current;
    }

    return false;
  }, []);

  const showNotification = useCallback(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    // Close existing notification
    if (notificationRef.current) {
      notificationRef.current.close();
    }

    try {
      notificationRef.current = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'blacktop-ride', // Prevents duplicate notifications
        requireInteraction: true, // Keep notification visible until user interacts
        silent: true, // Don't play sound
      });

      notificationRef.current.onclick = () => {
        // Focus the window/tab when notification is clicked
        window.focus();
        notificationRef.current?.close();
      };

      console.log('[Notification] Shown');
    } catch (err) {
      console.error('[Notification] Failed to show:', err);
    }
  }, [title, body]);

  const hideNotification = useCallback(() => {
    if (notificationRef.current) {
      notificationRef.current.close();
      notificationRef.current = null;
      console.log('[Notification] Hidden');
    }
  }, []);

  // Request permission and show/hide notification based on active state
  useEffect(() => {
    if (isActive) {
      requestPermission().then((granted) => {
        if (granted) {
          showNotification();
        }
      });
    } else {
      hideNotification();
    }

    return () => {
      hideNotification();
    };
  }, [isActive, requestPermission, showNotification, hideNotification]);

  // Re-show notification when page visibility changes (user switches away)
  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isActive) {
        // User switched away, ensure notification is visible
        showNotification();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, showNotification]);

  return {
    requestPermission,
    showNotification,
    hideNotification,
  };
}
