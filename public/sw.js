/* DivineLink service worker v4 — offline-first + push notifications */
const CACHE = "divinelink-v4";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      fetch("/index.html")
        .then((r) => r.text())
        .then((text) => {
          const assets = [...text.matchAll(/\/assets\/[^"'\s]+/g)].map((m) => m[0]);
          return c.addAll(["/", "/index.html", "/manifest.json", ...new Set(assets)]).catch(() => {});
        })
        .catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) =>
      Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;

  if (r.mode === "navigate") {
    e.respondWith(
      fetch(r)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(r, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  e.respondWith(
    caches.match(r).then((cached) => {
      if (cached) return cached;
      return fetch(r)
        .then((res) => {
          if (res.status === 200) {
            caches.open(CACHE).then((c) => c.put(r, res.clone())).catch(() => {});
          }
          return res;
        })
        .catch(() => new Response("", { status: 503 }));
    })
  );
});

/* ---- Push notification handling ---- */
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "DivineLink", body: e.data ? e.data.text() : "Nouvelle notification" };
  }

  const title = data.title || "DivineLink Rappel";
  const options = {
    body: data.body || "",
    icon: data.icon || "/placeholder.svg",
    badge: data.badge || "/placeholder.svg",
    tag: data.tag || "divinelink-notification",
    data: data.data || {},
    actions: data.actions || [
      { action: "open", title: "Ouvrir" },
      { action: "dismiss", title: "Fermer" },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();

  if (e.action === "dismiss") return;

  // Open or focus the app
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If there's already a window open, focus it
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow("/");
    })
  );
});
