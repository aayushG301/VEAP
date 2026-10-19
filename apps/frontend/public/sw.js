/* VEAP service worker: cache the app shell, and keep the last Tier 1 scan per QR for offline use. Never caches Tier 2/3 data. */
const SHELL = "veap-shell-v2";
const TIER1 = "veap-tier1-v2";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/favicon.svg", "/logo.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (/^\/api\/v1\/emergency\/[^/]+$/.test(url.pathname)) { // Tier 1 only (no /record)
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(TIER1).then((c) => c.put(url.pathname, copy)); } return r; })
      .catch(() => caches.open(TIER1).then((c) => c.match(url.pathname)).then((r) => r || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") { e.respondWith(fetch(e.request).catch(() => caches.match("/"))); return; }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok && url.origin === location.origin) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return r; })));
});
