export const toList = (s: string): string[] => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
export const fromList = (a?: string[]): string => (a || []).join("\n");

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export function ageFrom(dob?: string, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob); if (Number.isNaN(d.getTime())) return null;
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** "Mozilla/5.0 (Windows NT 10.0...) Chrome/120" -> "Chrome on Windows" */
export function deviceName(ua?: string): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /node|undici|curl/i.test(ua) ? "API client" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export const TIER_LABEL: Record<number, string> = { 1: "Level 1 - Public", 2: "Level 2 - Verified", 3: "Level 3 - Restricted" };
export const TIER_META: Record<number, { icon: string; short: string; cls: string; who: string }> = {
  1: { icon: "🌐", short: "Public", cls: "public", who: "Anyone who scans your QR" },
  2: { icon: "🔐", short: "Verified", cls: "verified", who: "A responder with the code sent to your contact" },
  3: { icon: "🔒", short: "Restricted", cls: "restricted", who: "Verified professionals or emergency override" },
};

export const cacheKey = (token: string) => `veap:tier1:${token}`;
export function saveTier1(token: string, data: unknown) {
  try { localStorage.setItem(cacheKey(token), JSON.stringify({ at: Date.now(), data })); } catch { /* storage may be unavailable */ }
}
export function loadTier1(token: string): { at: number; data: any } | null {
  try { const v = localStorage.getItem(cacheKey(token)); return v ? JSON.parse(v) : null; } catch { return null; }
}
