/**
 * Offline (PWA) rules for VEAP emergency access.
 *
 * This module is the single source of truth for what may be stored offline, the
 * versioned cache names, and how the Tier 1 view is resolved when the network is
 * unavailable. `public/sw.js` mirrors these constants (a service worker cannot
 * import application code) and `tests/offline.test.tsx` asserts the two agree.
 *
 * Safety rules enforced here:
 *  - Only the public Tier 1 emergency endpoint may ever be stored offline.
 *  - Tier 2 / Tier 3 records, auth, OTP and every other /api/ response are network-only.
 *  - A failed or non-2xx response is never written over a good cached copy.
 *  - A cached copy is never presented as live-verified or unrevoked.
 */
import { clearTier1Cache } from "./util";

/** Bumping this renames every offline cache, so a service-worker update starts clean. */
export const OFFLINE_CACHE_VERSION = "v3";

export const SHELL_CACHE = `veap-shell-${OFFLINE_CACHE_VERSION}`;
export const TIER1_CACHE = `veap-tier1-${OFFLINE_CACHE_VERSION}`;

/** Caches the service worker may keep; every other cache is deleted on activate. */
export const ALLOWED_CACHES: readonly string[] = [SHELL_CACHE, TIER1_CACHE];

/** Assets precached so the app shell opens with no connection. */
export const SHELL_ASSETS: readonly string[] = [
  "/",
  "/favicon.svg",
  "/logo.svg",
  "/manifest.webmanifest",
];

/** `/api/v1/emergency/<token>` — the public Tier 1 view. Deliberately excludes `/record` (Tier 2/3). */
export const TIER1_PATH_RE = /^\/api\/v1\/emergency\/[A-Za-z0-9._~-]+$/;

export const isTier1EmergencyPath = (pathname: string) => TIER1_PATH_RE.test(pathname);
export const isApiPath = (pathname: string) => pathname.startsWith("/api/");

/** Only a successful, same-origin, non-opaque response may be stored as the offline Tier 1 copy. */
export function isCacheableTier1Response(res: { ok?: boolean; status?: number; type?: string } | null | undefined): boolean {
  if (!res) return false;
  if (res.type === "opaque" || res.type === "opaqueredirect") return false;
  return res.ok === true && typeof res.status === "number" && res.status >= 200 && res.status < 300;
}

/**
 * Is this failure a connectivity problem (so a cached Tier 1 copy may be shown),
 * rather than an authoritative answer from the backend?
 *
 * A 410 revoked / 423 locked / 404 unknown / 429 rate-limited response is a real
 * answer from the server and must never be masked by cached data — showing a
 * revoked QR as if it were still working would be unsafe.
 */
export function isConnectivityFailure(err: unknown, online: boolean): boolean {
  if (!online) return true;
  if (err instanceof TypeError) return true; // fetch() could not reach the server
  const status = (err as { status?: number } | null)?.status;
  const code = (err as { code?: string } | null)?.code;
  return status === 503 && code === "offline"; // the service worker's offline marker
}

/** Cache names that must be deleted during a service-worker update. */
export function obsoleteCaches(existing: readonly string[], keep: readonly string[] = ALLOWED_CACHES): string[] {
  return existing.filter((name) => !keep.includes(name));
}

/**
 * Remove everything VEAP stored on this device for offline use: the cached Tier 1
 * copies in localStorage plus the offline caches. Called when a user logs out or
 * chooses to clear locally stored data.
 */
export async function clearOfflineData(): Promise<void> {
  clearTier1Cache();
  if (typeof caches === "undefined") return;
  try {
    // The app shell may stay (it holds no patient data); the Tier 1 copies must go.
    await caches.delete(TIER1_CACHE);
  } catch {
    /* the Cache Storage API can be unavailable in private mode */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    reg?.active?.postMessage({ type: "clear-tier1" });
  } catch {
    /* no service worker on this device */
  }
}
