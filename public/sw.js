/* DivineLink service worker v3 — offline-first with asset auto-discovery */
const CACHE = "divinelink-v3";

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
