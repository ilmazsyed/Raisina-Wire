// Raisina Wire service worker.
// The build replaces __BUILD_ID__ and __PRECACHE__ (see vite.config.js), so every deploy
// installs a fresh copy of the app shell, all edition text and artwork.
const BUILD = "__BUILD_ID__";
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `rw-shell-${BUILD}`;
const DATA_CACHE = "rw-data";      // last good copy of live wire, markets, coverage, events
const READ_CACHE = "rw-reader";    // reader-view articles recently opened
const SAVED_CACHE = "rw-saved";    // articles the reader saved for later
const FONT_CACHE = "rw-fonts";
const KEEP = [SHELL_CACHE, DATA_CACHE, READ_CACHE, SAVED_CACHE, FONT_CACHE];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE)));
  // First install activates at once; later versions wait until the reader chooses to update.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  const msg = event.data || {};
  if (msg.type === "SKIP_WAITING") self.skipWaiting();
  if (msg.type === "SAVE_ARTICLE" && typeof msg.url === "string" && msg.url.startsWith("/api/read?")) {
    event.waitUntil(fetch(msg.url).then(r => r.ok ? caches.open(SAVED_CACHE).then(c => c.put(msg.url, r)) : null).catch(() => {}));
  }
});

// Breaking-news alerts: pushes carry no payload; show the latest alert from the server.
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let alert = null;
    try { alert = (await fetch("/api/alerts/latest", { cache: "no-store" }).then(r => r.json())).alert; } catch { /* offline */ }
    await self.registration.showNotification(alert?.title || "Raisina Wire", {
      body: alert?.body || "New on Raisina Wire", icon: "/icon-192.png", badge: "/favicon.png", tag: "rw-alert", renotify: true,
      data: { url: alert?.url || "/" }
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (win) { await win.focus(); return win.navigate(url).catch(() => self.clients.openWindow(url)); }
    return self.clients.openWindow(url);
  })());
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

// Network first; on failure serve the last good copy, flagged so the page can say it is offline.
async function networkFirst(request, cacheName, { wait = 6000, max = 40 } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([fetch(request), timeout(wait)]);
    if (response.ok) {
      const copy = new Response(await response.clone().blob(), { status: response.status, headers: new Headers(response.headers) });
      copy.headers.set("x-rw-cached-at", new Date().toISOString());
      await cache.put(request, copy);
      trim(cacheName, max);
    }
    return response;
  } catch {
    const cached = await cache.match(request) || await caches.match(request, { cacheName: SAVED_CACHE });
    if (!cached) return new Response(JSON.stringify({ error: "offline", offline: true }), { status: 503, headers: { "content-type": "application/json", "x-rw-offline": "1" } });
    const headers = new Headers(cached.headers); headers.set("x-rw-offline", "1");
    return new Response(await cached.blob(), { status: 200, headers });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(r => { if (r.ok || r.type === "opaque") cache.put(request, r.clone()); return r; }).catch(() => cached);
  return cached || network;
}

const LIVE_DATA = ["/api/wire", "/api/markets", "/api/live", "/api/events", "/api/community/posts", "/api/community/stats", "/api/config", "/api/articles", "/api/media"];

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/read") event.respondWith(networkFirst(request, READ_CACHE, { wait: 10000, max: 60 }));
    else if (LIVE_DATA.includes(url.pathname) || url.pathname.startsWith("/api/live/") || url.pathname.startsWith("/api/articles/")) event.respondWith(networkFirst(request, DATA_CACHE, { wait: 6000, max: 40 }));
    return; // accounts and admin always go to the network
  }

  if (request.mode === "navigate") {
    if (url.pathname.startsWith("/admin")) return;
    event.respondWith((async () => {
      try { return await Promise.race([fetch(request), timeout(5000)]); }
      catch { return (await caches.match(url.pathname === "/" ? "/" : request)) || caches.match("/"); }
    })());
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE));
});
