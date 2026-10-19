import { env } from "../config/env";

/** Turns "+91 98765-43210" or "98765 43210" into E.164 (+919876543210). Returns null if it cannot be made valid. */
export function toE164(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) d = env.defaultCountryCode + d.replace(/^0+/, "");
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

export const maskPhone = (e164: string) => `${e164.slice(0, 3)} ${"*".repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;

/** Sends an SMS through the Twilio REST API (no SDK needed). Throws on any failure. */
export async function sendSms(toE164: string, body: string): Promise<void> {
  const { sid, token, from } = env.twilio;
  if (!sid || !token || !from) throw new Error("Twilio is not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: toE164, From: from, Body: body }).toString(),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      let msg = `Twilio responded ${r.status}`;
      try { msg = (await r.json() as any).message || msg; } catch { /* keep default */ }
      throw new Error(msg);
    }
  } finally { clearTimeout(timer); }
}
