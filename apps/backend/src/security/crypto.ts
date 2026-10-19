import crypto from "node:crypto";
import { env } from "../config/env";

const b64u = (b: Buffer) => b.toString("base64url");

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (all base64url). AAD binds ciphertext to its context. */
export function encrypt(plain: string, key: Buffer, aad = ""): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join(".");
}

export function decrypt(payload: string, key: Buffer, aad = ""): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad ciphertext");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const hmacHex = (s: string, secret: string) => crypto.createHmac("sha256", secret).update(s).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const randomId = () => crypto.randomUUID();

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* Envelope encryption: each user has a random data key, wrapped by the master key (KMS-ready). */
export function newWrappedDataKey(userId: string): string {
  return encrypt(b64u(crypto.randomBytes(32)), env.masterKey, `datakey:${userId}`);
}
export function unwrapDataKey(wrapped: string, userId: string): Buffer {
  return Buffer.from(decrypt(wrapped, env.masterKey, `datakey:${userId}`), "base64url");
}

export const encryptWithMaster = (plain: string, ctx: string) => encrypt(plain, env.masterKey, ctx);
export const decryptWithMaster = (payload: string, ctx: string) => decrypt(payload, env.masterKey, ctx);

export function randomDigits(n = 6): string {
  let s = "";
  while (s.length < n) s += crypto.randomInt(0, 10).toString();
  return s;
}
