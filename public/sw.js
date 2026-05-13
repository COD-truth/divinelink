/* DivineLink service worker v5 — cache-first + stale-while-revalidate */
const CACHE = "divinelink-v5";

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

  // Navigation: serve cached index.html immediately, revalidate in background
  if (r.mode === "navigate") {
    e.respondWith(
      caches.match("/index.html").then((cached) => {
        const networkFetch = fetch(r).then((res) => {
          if (res.status === 200) {
            caches.open(CACHE).then((c) => c.put(r, res.clone())).catch(() => {});
            caches.open(CACHE).then((c) => c.put("/index.html", res.clone())).catch(() => {});
          }
          return res;
        }).catch(() => null);

        return cached || networkFetch || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  // Assets: cache-first, background revalidate
  e.respondWith(
    caches.match(r).then((cached) => {
      const networkFetch = fetch(r).then((res) => {
        if (res.status === 200) {
          caches.open(CACHE).then((c) => c.put(r, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => null);

      // Return cache immediately, update in background
      if (cached) {
        e.waitUntil(networkFetch);
        return cached;
      }
      return networkFetch || new Response("", { status: 503 });
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

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    })
  );
});
