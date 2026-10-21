/* ============================================================
   DivineLink Service Worker
   Strategy: NETWORK-FIRST for the HTML shell (so a fresh build's
   index — with current chunk hashes — always wins when online),
   cache-first for hashed static assets. Offline fallback page.

   CACHE_NAME MUST contain the literal "divinelink-BUILD_VERSION":
   the deploy stamps it with a unique version each build so the
   browser sees a changed SW, updates, and drops the stale cache.
   ============================================================ */

const CACHE_NAME = "divinelink-BUILD_VERSION";

/* Static shell — always precached on install */
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon-16.png",
];

/* ── Install: precache shell ─────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      /* Precache static shell first */
      await cache.addAll(PRECACHE_URLS).catch(() => {});

      /* Also discover and cache all hashed JS/CSS assets from index.html */
      try {
        const res = await fetch("/index.html");
        const text = await res.text();
        const assetPaths = [...text.matchAll(/\/assets\/[^"'\s>]+/g)].map((m) => m[0]);
        const unique = [...new Set(assetPaths)];
        await cache.addAll(unique).catch(() => {});
      } catch {
        /* Offline at install time — assets will be cached on first real load */
      }
    })
  );
  /* Activate immediately without waiting for old SW to release clients */
  self.skipWaiting();
});

/* ── Activate: delete stale caches ──────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  /* Take control of all open tabs immediately, then reload them so new code is visible */
  self.clients.claim().then(() => {
    self.clients.matchAll({ type: "window" }).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
  });
});

/* ── Fetch: cache-first for assets, stale-while-revalidate for pages ── */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Only handle GET requests from our own origin */
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Skip Chrome extension and dev tool requests */
  if (url.pathname.startsWith("/__") || url.pathname.startsWith("/chrome-extension")) return;

  /* ── Navigation requests (page loads) — NETWORK-FIRST ─────────
     Always try to fetch the fresh index.html so a device online
     gets the CURRENT build's chunk references (no stale index →
     no "failed to fetch dynamically imported module"). Fall back
     to the cached shell only when the network is unavailable. */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(request);
          if (networkRes && networkRes.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("/index.html", networkRes.clone()).catch(() => {});
            return networkRes;
          }
        } catch { /* offline — fall through to cache */ }
        const cached = await caches.match("/index.html");
        if (cached) return cached;
        const offlinePage = await caches.match("/offline.html");
        return offlinePage || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      })()
    );
    return;
  }

  /* ── Static assets (JS, CSS, images, fonts) ───────────────── */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      /* Background revalidate */
      const networkPromise = fetch(request)
        .then(async (res) => {
          if (res.ok || res.status === 0) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        /* Serve from cache instantly; update in background */
        event.waitUntil(networkPromise);
        return cached;
      }

      /* Not cached — fetch from network */
      const res = await networkPromise;
      return res || new Response("", { status: 503 });
    })()
  );
});

/* ── Push notifications ──────────────────────────────────────── */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "DivineLink",
      body: event.data ? event.data.text() : "Nouvelle notification",
    };
  }

  const title = data.title || "DivineLink Rappel";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "divinelink-notification",
    data: data.data || {},
    actions: data.actions || [
      { action: "open", title: "Ouvrir" },
      { action: "dismiss", title: "Fermer" },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ──────────────────────────────────────── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow("/");
      })
  );
});
