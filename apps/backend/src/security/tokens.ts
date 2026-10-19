import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { hmacHex, randomToken, safeEqual, sha256 } from "./crypto";

export interface AccessClaims { sub: string; role: string; sid: string; typ: "access" }
export function signAccessToken(userId: string, role: string, sessionId: string): string {
  return jwt.sign({ sub: userId, role, sid: sessionId, typ: "access" }, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: env.accessTokenTtlSec });
}
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] }) as any;
    return p.typ === "access" ? p : null;
  } catch { return null; }
}
export function signMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: "mfa" }, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: 300 });
}
export function verifyMfaToken(token: string): string | null {
  try {
    const p = jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] }) as any;
    return p.typ === "mfa" ? p.sub : null;
  } catch { return null; }
}

/** Emergency access-session token (separate secret, short-lived, also checked against the DB on every use). */
export function signAccessSessionToken(sessionId: string, tokenId: string, tier: number, ttlSec: number): string {
  return jwt.sign({ sid: sessionId, tid: tokenId, tier, typ: "access_session" }, env.accessSessionSecret, { algorithm: "HS256", expiresIn: ttlSec });
}
export function verifyAccessSessionToken(token: string): { sid: string; tid: string; tier: number } | null {
  try {
    const p = jwt.verify(token, env.accessSessionSecret, { algorithms: ["HS256"], ignoreExpiration: true }) as any;
    return p.typ === "access_session" ? p : null;
  } catch { return null; }
}

export const newRefreshToken = () => randomToken(48);
export const hashRefreshToken = (t: string) => sha256(t);

/** QR token = <random 128-bit id>.<hmac signature>. The signature is checked before any DB lookup. */
export function createQrToken(): { token: string; tokenHash: string } {
  const id = randomToken(16);
  const sig = hmacHex(id, env.qrSigningSecret).slice(0, 20);
  const token = `${id}.${sig}`;
  return { token, tokenHash: sha256(id) };
}
export function parseQrToken(token: string): { tokenHash: string } | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || id.length < 20) return null;
  const expected = hmacHex(id, env.qrSigningSecret).slice(0, 20);
  if (!safeEqual(sig, expected)) return null;
  return { tokenHash: sha256(id) };
}
