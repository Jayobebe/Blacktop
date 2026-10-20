// Blacktop notifications worker.
//
// Handles push messages and notification taps only. It has no fetch handler
// and caches nothing, so it can never serve a stale build (the reason the old
// app-shell worker in /sw.js was retired).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Every push is also kept for the app's notification centre (Blacktop Command): saved in
// the `blacktop-inbox` database, which the app reads when it opens (src/lib/inbox.ts), and
// an open app is told straight away. Burn deletes the database with the app's others.
function keepForInbox(entry) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("blacktop-inbox", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pending", { autoIncrement: true });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("pending", "readwrite");
        tx.objectStore("pending").add(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function tellOpenApps() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((w) => w.postMessage({ type: "bt-push-inbox" }));
}

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

  const title = typeof msg.title === "string" && msg.title ? msg.title : "Blacktop";
  // Every push must show a notification (iOS revokes permission otherwise).
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      keepForInbox({ title, body: options.body, url: options.data.url, tag: options.tag || "", at: Date.now() }).then(tellOpenApps),
    ]),
  );
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
