export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: any = {}, public retryAfter: number | null = null) { super(message); }
}

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<{ accessToken: string; user: any } | null> {
  return fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include", headers: { "X-Requested-With": "veap" } })
    .then(async (r) => { if (!r.ok) return null; const j = await r.json(); setAccessToken(j.accessToken); return j; })
    .catch(() => null);
}
const refreshOnce = () => (refreshing ??= refreshSession().then((j) => !!j).finally(() => { refreshing = null; }));

interface Opts { method?: string; body?: unknown; session?: string | null; auth?: boolean; _retried?: boolean }

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.session) headers["X-Access-Session"] = opts.session;
  const res = await fetch(`/api/v1${path}`, { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers, credentials: "include", body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && opts.auth !== false && accessToken && !opts._retried && !path.startsWith("/auth/")) {
    if (await refreshOnce()) return api<T>(path, { ...opts, _retried: true });
  }
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error */ }
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"));
    throw new ApiError(res.status, json.error || "error", json.issues?.[0] ? `${json.issues[0].path}: ${json.issues[0].message}` : json.message || res.statusText, json, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  return json as T;
}

export async function download(path: string, filename: string) {
  const res = await fetch(`/api/v1${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, "download_failed", "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
