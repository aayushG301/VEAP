/*
 * VEAP service worker.
 *
 *  - Pre-caches the app shell so the interface opens with no connection.
 *  - Keeps the last successfully fetched *Tier 1* (public) emergency profile per QR
 *    so a responder can still read the critical basics offline.
 *  - Tier 2 / Tier 3 records, auth, OTP and every other /api/ response stay
 *    network-only and are never stored.
 *  - A failed (non-2xx) response never replaces a good cached copy.
 *  - Cache names are versioned; obsolete caches are deleted on activate.
 *
 * The rules here mirror src/lib/offline.ts (a service worker cannot import app code);
 * tests/offline.test.tsx asserts the two stay in sync.
 */
const VERSION = "v3";
const SHELL_CACHE = "veap-shell-" + VERSION;
const TIER1_CACHE = "veap-tier1-" + VERSION;
const KEEP = [SHELL_CACHE, TIER1_CACHE];
const SHELL_ASSETS = ["/", "/favicon.svg", "/logo.svg", "/manifest.webmanifest"];
const TIER1_PATH = /^\/api\/v1\/emergency\/[A-Za-z0-9._~-]+$/;
const isApi = (pathname) => pathname.indexOf("/api/") === 0;

/* ---------- install: warm the app shell ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Pre-cache one by one: a single unreachable asset must not abort the install.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            const res = await fetch(asset, { cache: "reload" });
            if (res && res.ok) await cache.put(asset, res);
          } catch {
            /* not reachable right now — the shell still works while online */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

/* ---------- activate: drop caches from older versions ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => KEEP.indexOf(n) === -1).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/* ---------- explicit cleanup requests from the page (logout / clear local data) ---------- */
self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "clear-tier1") event.waitUntil(caches.delete(TIER1_CACHE));
  else if (type === "clear-offline") event.waitUntil(Promise.all(KEEP.map((n) => caches.delete(n))));
});

const offlineResponse = () =>
  new Response(
    JSON.stringify({
      error: "offline",
      offline: true,
      message: "You are offline and no saved copy of this profile is available on this device.",
    }),
    { status: 503, headers: { "content-type": "application/json" } },
  );

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // writes (login, OTP, reports) are never cached

  const url = new URL(request.url);

  /* 1) Tier 1 emergency profile only: network-first, last saved copy as fallback. */
  if (url.origin === self.location.origin && TIER1_PATH.test(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          // Store only a successful response — never overwrite a good copy with an error.
          if (res && res.ok) {
            const copy = res.clone();
            caches
              .open(TIER1_CACHE)
              .then((c) => c.put(url.pathname, copy))
              .catch(() => {});
          }
          return res;
        } catch {
          const cached = await caches.open(TIER1_CACHE).then((c) => c.match(url.pathname)).catch(() => null);
          if (!cached) return offlineResponse();
          // Mark the saved copy so the page can label it an offline, unverified snapshot instead of live data.
          const headers = new Headers(cached.headers);
          headers.set("X-VEAP-Offline", "1");
          return new Response(await cached.arrayBuffer(), { status: cached.status, statusText: cached.statusText, headers });
        }
      })(),
    );
    return;
  }

  /* 2) Every other API call is online-only and is never intercepted or stored. */
  if (isApi(url.pathname)) return;

  /* 3) App shell navigation: fresh build wins, cached shell when offline. */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const shell = await caches.match("/");
          return shell || new Response("Offline", { status: 503, headers: { "content-type": "text/html" } });
        }
      })(),
    );
    return;
  }

  /* 4) Static assets: cache-first, then network (successful same-origin responses are stored). */
  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((c) => c.put(request, copy))
            .catch(() => {});
        }
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
