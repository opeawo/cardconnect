// CardConnect minimal service worker.
//
// Goal: meet the PWA installability requirement (a registered SW that has
// a fetch handler) without breaking the live app or interfering with the
// API. We do NOT cache /api requests, and we always go to the network for
// HTML to avoid serving stale builds. Static assets are cache-first.

const VERSION = "v1";
const STATIC_CACHE = `cc-static-${VERSION}`;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // best-effort precache; ignore failures so install doesn't abort
      await Promise.allSettled(APP_SHELL.map((u) => cache.add(u)));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API calls or the proxy port path.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/port/")) return;

  // For navigations and HTML, always try the network first so users see
  // the latest build. Fall back to cache only when offline.
  const isHtml = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");
  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match("/index.html") || Response.error();
        }
      })(),
    );
    return;
  }

  // For static assets (JS/CSS/images/fonts), cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (res.type === "basic" || res.type === "cors")) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
