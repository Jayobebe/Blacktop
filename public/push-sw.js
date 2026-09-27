// Blacktop notifications worker.
//
// Handles push messages and notification taps only. It has no fetch handler
// and caches nothing, so it can never serve a stale build (the reason the old
// app-shell worker in /sw.js was retired).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : "" };
  }

  const options = {
    body: typeof msg.body === "string" ? msg.body : "",
    icon: "/pwa-192x192.png",
    data: { url: typeof msg.url === "string" ? msg.url : "/" },
    timestamp: Date.now(),
  };
  if (typeof msg.tag === "string" && msg.tag) {
    options.tag = msg.tag;
    options.renotify = true; // buzz again when a newer one replaces it
  }
  if (msg.urgent) {
    options.requireInteraction = true; // stays until dismissed
    options.vibrate = [400, 150, 400, 150, 400];
  }

  // Every push must show a notification (iOS revokes permission otherwise).
  event.waitUntil(self.registration.showNotification(typeof msg.title === "string" && msg.title ? msg.title : "Blacktop", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // Route inside the running app rather than reloading it (a reload
        // would interrupt an active ride).
        open.postMessage({ type: "bt-push-open", path: target.pathname + target.search + target.hash });
        await open.focus();
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
