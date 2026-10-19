import type { Request } from "express";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { randomId } from "../../security/crypto";
import { parseQrToken, signAccessSessionToken, verifyAccessSessionToken } from "../../security/tokens";
import { HttpError, clientIp, userAgent } from "../../utils/http";

export interface QrRow { id: string; userId: string; status: string; riskScore: number }

export async function recordSecurityEvent(kind: string, req: Request, detail = "") {
  await col.securityEvents.insertOne({ kind, ip: clientIp(req), ua: userAgent(req), detail: detail.slice(0, 300), ts: Date.now() });
}

/** Validates signature, then looks the token up. Unknown and decoy tokens look identical to the caller. */
export async function resolveToken(tokenStr: string, req: Request, opts: { allowLocked?: boolean } = {}): Promise<QrRow> {
  const parsed = parseQrToken(tokenStr);
  if (!parsed) { await recordSecurityEvent("invalid_token_signature", req); throw new HttpError(404, "not_found", "Emergency profile not found"); }
  const row = await col.qrTokens.findOne({ tokenHash: parsed.tokenHash });
  if (!row) {
    if (await col.honeytokens.findOne({ tokenHash: parsed.tokenHash })) await recordSecurityEvent("honeytoken_probe", req, "decoy QR token scanned");
    throw new HttpError(404, "not_found", "Emergency profile not found");
  }
  if (row.status === "revoked") throw new HttpError(410, "token_revoked", "This QR code has been revoked by its owner");
  if (row.status === "locked" && !opts.allowLocked) throw new HttpError(423, "token_locked", "This QR code was temporarily locked due to suspicious activity. Call your local emergency number.");
  return { id: row._id, userId: row.userId, status: row.status, riskScore: row.riskScore };
}

export async function createSession(p: { token: QrRow; tier: 2 | 3; via: string; responderId?: string; phoneLast4?: string; reason?: string; ip: string }) {
  const id = randomId();
  const ttl = p.tier === 2 ? env.tier2TtlSec : env.tier3TtlSec;
  const expiresAt = Date.now() + ttl * 1000;
  await col.accessSessions.insertOne({ _id: id, tokenId: p.token.id, userId: p.token.userId, tier: p.tier, grantedVia: p.via, responderId: p.responderId ?? null, phoneLast4: p.phoneLast4 ?? null, reason: p.reason ?? null, extended: false, revoked: false, expiresAt, ip: p.ip, createdAt: Date.now() });
  return { id, expiresAt, sessionToken: signAccessSessionToken(id, p.token.id, p.tier, ttl + 600) };
}

export interface SessionRow { id: string; tokenId: string; userId: string; tier: number; grantedVia: string; phoneLast4: string | null; responderId: string | null; extended: boolean; expiresAt: number }

/** Server-side enforcement of expiry/revocation. The client clock is never trusted. */
export async function requireSession(req: Request, minTier = 2, tokenId?: string): Promise<SessionRow> {
  const h = req.headers["x-access-session"];
  const parsed = typeof h === "string" ? verifyAccessSessionToken(h) : null;
  if (!parsed) throw new HttpError(401, "no_session", "Verified emergency session required");
  const s = await col.accessSessions.findOne({ _id: parsed.sid });
  if (!s || s.revoked) throw new HttpError(401, "session_invalid", "Session is no longer valid");
  if (s.expiresAt < Date.now()) throw new HttpError(401, "session_expired", "Session expired. Verify again.");
  if (tokenId && s.tokenId !== tokenId) throw new HttpError(403, "token_mismatch", "Session does not belong to this profile");
  if (s.tier < minTier) throw new HttpError(403, "insufficient_tier", `Tier ${minTier} access required`);
  const t = await col.qrTokens.findOne({ _id: s.tokenId });
  if (!t || t.status === "revoked") throw new HttpError(401, "session_invalid", "Profile access was revoked");
  return { id: s._id, tokenId: s.tokenId, userId: s.userId, tier: s.tier, grantedVia: s.grantedVia, phoneLast4: s.phoneLast4, responderId: s.responderId, extended: !!s.extended, expiresAt: s.expiresAt };
}

export const parseGeo = (lat: unknown, lng: unknown): string | null => {
  const a = Number(lat), b = Number(lng);
  if (lat === undefined || lng === undefined || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return `${a.toFixed(4)},${b.toFixed(4)}`;
};
