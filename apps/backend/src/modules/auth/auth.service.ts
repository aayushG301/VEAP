import type { Request, Response } from "express";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { randomId, sha256, randomToken, decryptWithMaster, encryptWithMaster } from "../../security/crypto";
import { hashRefreshToken, newRefreshToken, signAccessToken } from "../../security/tokens";
import { clientIp, userAgent, HttpError } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";

export const COOKIE = "veap_rt";
const cookieOpts = () => ({ httpOnly: true, secure: env.isProd, sameSite: "strict" as const, path: "/api/v1/auth", maxAge: env.refreshTokenTtlSec * 1000 });

export function publicUser(u: any) {
  return { id: u._id, email: u.email, name: u.name, role: u.role, mfaEnabled: !!u.mfaEnabled, responderStatus: u.responderStatus ?? null };
}

/** Creates a session + first refresh token, sets the httpOnly cookie, returns an access token. */
export async function startSession(req: Request, res: Response, user: any) {
  const sid = randomId();
  const now = Date.now();
  await col.sessions.insertOne({ _id: sid, userId: user._id, device: userAgent(req), ip: clientIp(req), createdAt: now, lastUsed: now, revoked: false });
  await issueRefresh(res, sid);
  await writeAudit({ userId: user._id, action: "login", actor: "self", ip: clientIp(req), meta: { device: userAgent(req) } });
  return { accessToken: signAccessToken(user._id, user.role, sid), user: publicUser(user) };
}

export async function issueRefresh(res: Response, sessionId: string) {
  const raw = newRefreshToken();
  await col.refreshTokens.insertOne({ _id: randomId(), sessionId, tokenHash: hashRefreshToken(raw), used: false, expiresAt: Date.now() + env.refreshTokenTtlSec * 1000 });
  res.cookie(COOKIE, raw, cookieOpts());
}

export async function rotateRefresh(req: Request, res: Response) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) throw new HttpError(401, "no_refresh", "No refresh token");
  const hash = hashRefreshToken(raw);
  const row = await col.refreshTokens.findOne({ tokenHash: hash });
  if (!row) throw new HttpError(401, "invalid_refresh", "Invalid refresh token");
  const sess = await col.sessions.findOne({ _id: row.sessionId });
  if (!sess || sess.revoked) throw new HttpError(401, "session_revoked", "Session revoked");
  // Atomic "use once": only one concurrent request can flip used=false -> true.
  const claimed = await col.refreshTokens.findOneAndUpdate({ _id: row._id, used: false }, { $set: { used: true } });
  if (!claimed) {
    // Reuse of a rotated token => likely theft. Kill the whole session.
    await col.sessions.updateOne({ _id: sess._id }, { $set: { revoked: true } });
    await writeAudit({ userId: sess.userId, action: "refresh_reuse_detected", actor: "system", ip: clientIp(req), meta: { sessionId: sess._id } });
    res.clearCookie(COOKIE, { path: "/api/v1/auth" });
    throw new HttpError(401, "refresh_reuse", "Token reuse detected; session revoked");
  }
  if (row.expiresAt < Date.now()) throw new HttpError(401, "refresh_expired", "Refresh token expired");
  await col.sessions.updateOne({ _id: sess._id }, { $set: { lastUsed: Date.now() } });
  await issueRefresh(res, sess._id);
  const user = await col.users.findOne({ _id: sess.userId });
  return { accessToken: signAccessToken(user!._id, user!.role, sess._id), user: publicUser(user) };
}

export function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: 8 }, () => `${randomToken(4)}-${randomToken(4)}`.toLowerCase());
  return { plain, hashes: plain.map((c) => sha256(c)) };
}
export const mfaSecretOf = (u: any, field: "mfaSecretEnc" | "mfaPendingEnc" = "mfaSecretEnc"): string | null => (u[field] ? decryptWithMaster(u[field], `mfa:${u._id}`) : null);
export const encMfa = (id: string, secret: string) => encryptWithMaster(secret, `mfa:${id}`);
