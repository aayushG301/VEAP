import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/lib/auth";
import { ToastProvider } from "../src/components/Toast";
import {
  ALLOWED_CACHES,
  OFFLINE_CACHE_VERSION,
  SHELL_ASSETS,
  SHELL_CACHE,
  TIER1_CACHE,
  TIER1_PATH_RE,
  isCacheableTier1Response,
  isConnectivityFailure,
  isTier1EmergencyPath,
  obsoleteCaches,
} from "../src/lib/offline";

// Read the real service-worker source so its rules can be compared with (and executed against) src/lib/offline.ts.
const swPath = [resolve(process.cwd(), "public/sw.js"), resolve(process.cwd(), "apps/frontend/public/sw.js")].find(existsSync);
if (!swPath) throw new Error("could not locate public/sw.js for the service-worker tests");
const swSource = readFileSync(swPath, "utf8");
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/* =========================================================================
 * 1. The offline rules module — what may be stored and when a cached copy may be shown.
 * ========================================================================= */
describe("offline rules (src/lib/offline.ts)", () => {
  it("uses versioned cache names and permits only the shell + Tier 1 caches", () => {
    expect(SHELL_CACHE).toBe(`veap-shell-${OFFLINE_CACHE_VERSION}`);
    expect(TIER1_CACHE).toBe(`veap-tier1-${OFFLINE_CACHE_VERSION}`);
    expect(ALLOWED_CACHES).toEqual([SHELL_CACHE, TIER1_CACHE]);
  });

  it("matches only the public Tier 1 emergency path, never the Tier 2/3 record path", () => {
    expect(isTier1EmergencyPath("/api/v1/emergency/abc.DEF_ghi-123")).toBe(true);
    expect(isTier1EmergencyPath("/api/v1/emergency/abc/record")).toBe(false); // Tier 2 / 3
    expect(isTier1EmergencyPath("/api/v1/emergency/abc/record/")).toBe(false);
    expect(isTier1EmergencyPath("/api/v1/auth/login")).toBe(false);
    expect(isTier1EmergencyPath("/api/v1/emergency/")).toBe(false);
  });

  it("only accepts successful, non-opaque responses as cacheable", () => {
    expect(isCacheableTier1Response(new Response("{}", { status: 200 }))).toBe(true);
    expect(isCacheableTier1Response(new Response("{}", { status: 410 }))).toBe(false); // revoked
    expect(isCacheableTier1Response(new Response("{}", { status: 423 }))).toBe(false); // locked
    expect(isCacheableTier1Response(new Response("{}", { status: 500 }))).toBe(false); // failed
    expect(isCacheableTier1Response({ ok: false, status: 0, type: "opaque" })).toBe(false);
    expect(isCacheableTier1Response(null)).toBe(false);
  });

  it("treats only connectivity problems as eligible for a cached fallback", () => {
    expect(isConnectivityFailure(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isConnectivityFailure(new Error("x"), false)).toBe(true); // the device is offline
    expect(isConnectivityFailure({ status: 503, code: "offline" }, true)).toBe(true); // service-worker marker
    // Authoritative answers must never be masked by cached data — a revoked QR is not "offline".
    for (const status of [400, 401, 403, 404, 410, 423, 429]) expect(isConnectivityFailure({ status }, true)).toBe(false);
  });

  it("computes obsolete caches for a service-worker update", () => {
    expect(obsoleteCaches([SHELL_CACHE, TIER1_CACHE, "veap-shell-v2", "veap-tier1-v2", "workbox-precache"]))
      .toEqual(["veap-shell-v2", "veap-tier1-v2", "workbox-precache"]);
    expect(obsoleteCaches(ALLOWED_CACHES.slice())).toEqual([]);
  });

  it("keeps public/sw.js in step with these rules", () => {
    expect(swSource).toContain(`const VERSION = "${OFFLINE_CACHE_VERSION}"`);
    expect(swSource).toContain('"veap-shell-"');
    expect(swSource).toContain('"veap-tier1-"');
    expect(swSource).toContain(TIER1_PATH_RE.source); // the same Tier 1 path regex
    for (const asset of SHELL_ASSETS) expect(swSource).toContain(`"${asset}"`);
  });
});

/* =========================================================================
 * 2. The service worker itself, run against a small Cache Storage mock.
 * ========================================================================= */
type Handler = (event: any) => void;
function loadServiceWorker(fetchImpl: (req: any, init?: any) => Promise<Response> | Response) {
  const listeners: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (k: any) => (typeof k === "string" ? k : k.url);
  const storeOf = (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name)!; };

  const caches = {
    async open(name: string) {
      const store = storeOf(name);
      return {
        async put(key: any, res: Response) { store.set(keyOf(key), res); },
        async match(key: any) { return store.get(keyOf(key)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
    async match(key: any) {
      for (const store of stores.values()) { const hit = store.get(keyOf(key)); if (hit) return hit; }
      return undefined;
    },
  };

  const fakeSelf: any = {
    location: { origin: "http://localhost" },
    addEventListener(type: string, fn: Handler) { (listeners[type] ||= []).push(fn); },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  // A service worker cannot import app code, so it is evaluated from source with injected globals.
  new Function("self", "caches", "fetch", "Response", "URL", swSource)(fakeSelf, caches, fetchImpl, Response, URL);

  const run = async (type: string, event: any) => {
    const waits: Promise<any>[] = [];
    event.waitUntil = (p: Promise<any>) => waits.push(p);
    for (const fn of listeners[type] || []) fn(event);
    await Promise.all(waits);
  };
  const dispatchFetch = async (request: any): Promise<Response | null> => {
    const captured: Promise<Response>[] = [];
    for (const fn of listeners.fetch || []) fn({ request, respondWith: (p: Promise<Response>) => captured.push(p), waitUntil: () => {} });
    return captured.length ? await captured[0] : null;
  };
  return {
    caches, stores,
    emitInstall: () => run("install", {}),
    emitActivate: () => run("activate", {}),
    emitMessage: (data: any) => run("message", { data }),
    dispatchFetch,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("service worker: offline app shell", () => {
  it("pre-caches the shell on install and serves it for navigations while offline", async () => {
    let online = true;
    const shell = () => new Response("<!doctype html><title>VEAP shell</title>", { status: 200, headers: { "content-type": "text/html" } });
    const sw = loadServiceWorker(async (req: any) => {
      if (!online) throw new TypeError("Failed to fetch");
      const url = typeof req === "string" ? req : req.url;
      if ((SHELL_ASSETS as readonly string[]).includes(url)) return shell();
      throw new TypeError("Failed to fetch");
    });
    await sw.emitInstall();
    expect(sw.stores.get(SHELL_CACHE)?.has("/")).toBe(true);

    online = false;
    const res = await sw.dispatchFetch({ method: "GET", url: "http://localhost/dashboard", mode: "navigate" });
    expect(res?.ok).toBe(true);
    expect(await res!.text()).toContain("VEAP shell");
  });
});

describe("service worker: Tier 1 caching is safe", () => {
  const token = "a".repeat(22) + "." + "b".repeat(20);
  const path = `/api/v1/emergency/${token}`;
  const url = `http://localhost${path}`;
  const good = () => new Response(JSON.stringify({ tier: 1, data: { fullName: "Asha Verma", bloodGroup: "O-" } }), { status: 200, headers: { "content-type": "application/json" } });

  it("stores a successful Tier 1 response and serves it when the network is down", async () => {
    let mode: "ok" | "down" = "ok";
    const sw = loadServiceWorker(async () => { if (mode === "down") throw new TypeError("Failed to fetch"); return good(); });
    const live = await sw.dispatchFetch({ method: "GET", url });
    expect(live?.status).toBe(200);
    await tick();
    expect(sw.stores.get(TIER1_CACHE)?.has(path)).toBe(true);

    mode = "down";
    const cached = await sw.dispatchFetch({ method: "GET", url });
    expect(cached?.status).toBe(200);
    expect(await cached!.json()).toMatchObject({ tier: 1 });
  });

  it("never overwrites a good copy with a failed response", async () => {
    let impl: (r: any, i?: any) => Response = () => good();
    const sw = loadServiceWorker(async (r, i) => impl(r, i));
    await sw.dispatchFetch({ method: "GET", url });
    await tick();
    const stored = sw.stores.get(TIER1_CACHE)!.get(path);

    // the backend now answers 500 for the same QR — the good copy must survive
    impl = () => new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    expect((await sw.dispatchFetch({ method: "GET", url }))?.status).toBe(500);
    await tick();
    expect(sw.stores.get(TIER1_CACHE)!.get(path)).toBe(stored);

    // and an offline scan still returns the earlier good copy
    impl = () => { throw new TypeError("Failed to fetch"); };
    const offline = await sw.dispatchFetch({ method: "GET", url });
    expect(offline?.status).toBe(200);
    expect(await offline!.json()).toMatchObject({ data: { fullName: "Asha Verma" } });
  });

  it("returns an explicit offline marker when nothing is cached", async () => {
    const sw = loadServiceWorker(async () => { throw new TypeError("Failed to fetch"); });
    const r = await sw.dispatchFetch({ method: "GET", url });
    expect(r?.status).toBe(503);
    expect(await r!.json()).toMatchObject({ error: "offline", offline: true });
  });

  it("marks a served-from-cache copy so the page can never mistake it for live data", async () => {
    let mode: "ok" | "down" = "ok";
    const sw = loadServiceWorker(async () => { if (mode === "down") throw new TypeError("Failed to fetch"); return good(); });
    await sw.dispatchFetch({ method: "GET", url });
    await tick();
    mode = "down";
    const cached = await sw.dispatchFetch({ method: "GET", url });
    expect(cached?.status).toBe(200);
    expect(cached?.headers.get("X-VEAP-Offline")).toBe("1");
  });

  it("never intercepts or stores Tier 2 / Tier 3 record requests", async () => {
    const recPath = `/api/v1/emergency/${token}/record`;
    const sw = loadServiceWorker(async () => new Response(JSON.stringify({ tier: 2, data: { medications: ["Warfarin"] } }), { status: 200 }));
    const r = await sw.dispatchFetch({ method: "GET", url: `http://localhost${recPath}` });
    expect(r).toBeNull(); // not handled: the request goes straight to the network
    await tick();
    expect(sw.stores.get(TIER1_CACHE)?.has(recPath) ?? false).toBe(false);
  });

  it("never caches non-GET writes or auth responses", async () => {
    const sw = loadServiceWorker(async () => new Response("{}", { status: 200 }));
    expect(await sw.dispatchFetch({ method: "POST", url })).toBeNull();
    expect(await sw.dispatchFetch({ method: "GET", url: "http://localhost/api/v1/auth/login" })).toBeNull();
    await tick();
    expect(sw.stores.get(TIER1_CACHE)?.size ?? 0).toBe(0);
  });

  it("deletes obsolete caches on activate and keeps the current ones", async () => {
    const sw = loadServiceWorker(async () => new Response("{}", { status: 200 }));
    await sw.caches.open("veap-shell-v2");
    await sw.caches.open("veap-tier1-v2");
    await sw.caches.open("some-stale-cache");
    await sw.caches.open(TIER1_CACHE);
    await sw.emitActivate();
    const names = await sw.caches.keys();
    expect(names).toContain(TIER1_CACHE);
    expect(names).not.toContain("veap-shell-v2");
    expect(names).not.toContain("veap-tier1-v2");
    expect(names).not.toContain("some-stale-cache");
  });

  it("clears the saved Tier 1 copies on an explicit cleanup request", async () => {
    const sw = loadServiceWorker(async () => good());
    await sw.dispatchFetch({ method: "GET", url });
    await tick();
    expect(sw.stores.get(TIER1_CACHE)?.has(path)).toBe(true);
    await sw.emitMessage({ type: "clear-tier1" });
    expect(await sw.caches.keys()).not.toContain(TIER1_CACHE);
  });
});

/* =========================================================================
 * 3. The emergency page: cached vs live, and the offline messages a responder sees.
 * ========================================================================= */
const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TOKEN = "a".repeat(22) + "." + "b".repeat(20);
const PROFILE_UPDATED_AT = Date.now() - 3_600_000;
const tier1Body = {
  tier: 1,
  profileUpdatedAt: PROFILE_UPDATED_AT,
  risk: { level: "low" },
  data: {
    fullName: "Asha Verma",
    bloodGroup: "O-",
    allergies: ["Penicillin"],
    emergencyInstructions: "EpiPen in left pocket",
    emergencyContacts: [{ name: "Ravi", phone: "+91 98765 43210", relationship: "Brother" }],
  },
};

function renderEmergency(route: (url: string, init?: any) => Response | undefined) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.endsWith("/auth/refresh")) return json(401, { error: "no_refresh" });
    const out = route(url, init);
    if (out) return out;
    throw new TypeError("Failed to fetch"); // unreachable backend by default
  });
  return render(<MemoryRouter initialEntries={[`/e/${TOKEN}`]}><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></MemoryRouter>);
}

describe("emergency page: offline access", () => {
  it("shows a previously fetched Tier 1 profile offline, with the freshness warning and an unverified badge", async () => {
    localStorage.setItem(`veap:tier1:${TOKEN}`, JSON.stringify({ at: Date.now() - 120_000, data: tier1Body, updatedAt: PROFILE_UPDATED_AT }));
    renderEmergency(() => undefined);

    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    const banner = await screen.findByTestId("offline-banner");
    expect(banner).toHaveTextContent("Offline — showing saved information");
    expect(banner).toHaveTextContent("Profile last updated:");
    expect(banner).toHaveTextContent("Saved on this device:");
    expect(banner).toHaveTextContent("revocation cannot be checked while offline");

    // The cached copy is clearly marked as unverified — never as a live-valid Level 1 badge.
    expect(screen.getByText("Unverified — offline copy")).toBeInTheDocument();
    expect(screen.queryByText("Level 1 · Public")).toBeNull();
  });

  it("shows an unavailable message for a first-time scan with no saved copy", async () => {
    renderEmergency(() => undefined);
    expect(await screen.findByText("No saved profile available")).toBeInTheDocument();
    expect(screen.getByText(/no saved copy of this emergency profile/i)).toBeInTheDocument();
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("marks a live-verified profile differently from a cached copy", async () => {
    renderEmergency((u) => (u.includes(`/emergency/${TOKEN}`) ? json(200, tier1Body) : undefined));
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("offline-banner")).toBeNull());
    expect(screen.queryByText("Unverified — offline copy")).toBeNull();
    expect(screen.getByText("Level 1 · Public")).toBeInTheDocument();
  });

  it("keeps Tier 2 / Tier 3 network-only while offline (a note replaces the OTP flow claim)", async () => {
    localStorage.setItem(`veap:tier1:${TOKEN}`, JSON.stringify({ at: Date.now() - 1000, data: tier1Body, updatedAt: PROFILE_UPDATED_AT }));
    renderEmergency(() => undefined);
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(await screen.findByText("Level 2 and Level 3 medical details need an internet connection.")).toBeInTheDocument();
  });

  it("treats a service-worker-marked cached response as an unverified offline copy, never as live", async () => {
    // The service worker answers with the saved copy but flags it. The page must not present it as live.
    renderEmergency((u) => (u.includes(`/emergency/${TOKEN}`) ? new Response(JSON.stringify(tier1Body), { status: 200, headers: { "content-type": "application/json", "X-VEAP-Offline": "1" } }) : undefined));
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(await screen.findByTestId("offline-banner")).toHaveTextContent("Offline — showing saved information");
    expect(screen.getByText("Unverified — offline copy")).toBeInTheDocument();
    expect(screen.queryByText("Level 1 · Public")).toBeNull();
  });
});
