import { Router } from "express";
import { z } from "zod";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { col } from "../../config/db";
import { randomId, sha256 } from "../../security/crypto";
import { DUMMY_HASH_PROMISE, hashPassword, verifyPassword } from "../../security/passwords";
import { signMfaToken, verifyMfaToken } from "../../security/tokens";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { clientIp, HttpError } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";
import { COOKIE, encMfa, mfaSecretOf, newRecoveryCodes, publicUser, rotateRefresh, startSession } from "./auth.service";

export const authRouter = Router();
authenticator.options = { window: 1 };

const password = z.string().min(10, "At least 10 characters").max(128)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), "Must include upper-case, lower-case and a digit");
const email = z.string().trim().toLowerCase().email().max(200);
const registerSchema = z.object({ email, password, name: z.string().trim().min(1).max(100) });
const responderSchema = registerSchema.extend({ licenseNo: z.string().trim().min(3).max(60), licenseIssuer: z.string().trim().min(2).max(100) });

const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;

async function insertUser(b: { email: string; password: string; name: string }, role: string, extra: any = {}) {
  const doc = {
    _id: randomId(), email: b.email, name: b.name, passwordHash: await hashPassword(b.password), role,
    mfaSecretEnc: null, mfaPendingEnc: null, mfaEnabled: false, recoveryHashes: [] as string[], failedLogins: 0, lockedUntil: 0,
    licenseNo: extra.licenseNo ?? null, licenseIssuer: extra.licenseIssuer ?? null, responderStatus: extra.responderStatus ?? null, createdAt: Date.now(),
  };
  try { await col.users.insertOne(doc); }
  catch (e: any) {
    if (e?.code === 11000) throw new HttpError(409, "email_taken", "An account with this email already exists");
    throw e;
  }
  return doc;
}

authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const user = await insertUser(req.body, "patient");
  res.status(201).json(await startSession(req, res, user));
});

authRouter.post("/register-responder", validate(responderSchema), async (req, res) => {
  const user = await insertUser(req.body, "responder", { licenseNo: req.body.licenseNo, licenseIssuer: req.body.licenseIssuer, responderStatus: "pending" });
  res.status(201).json(await startSession(req, res, user));
});

async function registerFailure(user: any, req: any, action: string) {
  const fails = (user.failedLogins ?? 0) + 1;
  const lock = fails >= MAX_FAILS;
  await col.users.updateOne({ _id: user._id }, { $set: { failedLogins: lock ? 0 : fails, lockedUntil: lock ? Date.now() + LOCK_MS : 0 } });
  await writeAudit({ userId: user._id, action: lock ? "account_locked" : action, actor: "unknown", ip: clientIp(req) });
}

authRouter.post("/login", validate(z.object({ email, password: z.string().min(1).max(128) })), async (req, res) => {
  const user = await col.users.findOne({ email: req.body.email });
  if (user && user.lockedUntil > Date.now()) throw new HttpError(423, "account_locked", "Account temporarily locked after repeated failures. Try again later.");
  const ok = await verifyPassword(user ? user.passwordHash : await DUMMY_HASH_PROMISE, req.body.password);
  if (!user || !ok) {
    if (user) await registerFailure(user, req, "login_failed");
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }
  await col.users.updateOne({ _id: user._id }, { $set: { failedLogins: 0 } });
  if (user.mfaEnabled) return res.json({ mfaRequired: true, mfaToken: signMfaToken(user._id) });
  res.json(await startSession(req, res, user));
});

authRouter.post("/mfa/login", validate(z.object({ mfaToken: z.string().min(10), code: z.string().trim().max(20) })), async (req, res) => {
  const uid = verifyMfaToken(req.body.mfaToken);
  if (!uid) throw new HttpError(401, "invalid_mfa_token", "MFA session expired. Log in again.");
  const user = await col.users.findOne({ _id: uid });
  if (!user || !user.mfaEnabled) throw new HttpError(401, "invalid_mfa_token", "MFA not enabled");
  if (user.lockedUntil > Date.now()) throw new HttpError(423, "account_locked", "Account temporarily locked.");
  const code = req.body.code.replace(/\s/g, "");
  let ok = /^[0-9]{6}$/.test(code) && authenticator.check(code, mfaSecretOf(user)!);
  if (!ok) { // recovery code (single use, atomic)
    const r = await col.users.updateOne({ _id: user._id, recoveryHashes: sha256(code.toLowerCase()) }, { $pull: { recoveryHashes: sha256(code.toLowerCase()) } as any });
    if (r.modifiedCount) { ok = true; await writeAudit({ userId: user._id, action: "recovery_code_used", actor: "self", ip: clientIp(req) }); }
  }
  if (!ok) { await registerFailure(user, req, "mfa_failed"); throw new HttpError(401, "invalid_code", "Invalid authentication code"); }
  await col.users.updateOne({ _id: user._id }, { $set: { failedLogins: 0 } });
  res.json(await startSession(req, res, user));
});

authRouter.post("/refresh", requireCsrfHeader, async (req, res) => { res.json(await rotateRefresh(req, res)); });

authRouter.post("/logout", requireCsrfHeader, async (req, res) => {
  const raw = req.cookies?.[COOKIE];
  if (raw) {
    const row = await col.refreshTokens.findOne({ tokenHash: sha256(raw) });
    if (row) await col.sessions.updateOne({ _id: row.sessionId }, { $set: { revoked: true } });
  }
  res.clearCookie(COOKIE, { path: "/api/v1/auth" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(await col.users.findOne({ _id: req.user!.id })) });
});

/* ---- MFA management ---- */
authRouter.post("/mfa/setup", requireAuth, async (req, res) => {
  const u = await col.users.findOne({ _id: req.user!.id });
  if (u!.mfaEnabled) throw new HttpError(409, "mfa_enabled", "MFA already enabled");
  const secret = authenticator.generateSecret();
  await col.users.updateOne({ _id: u!._id }, { $set: { mfaPendingEnc: encMfa(u!._id, secret) } });
  const otpauth = authenticator.keyuri(u!.email, "VEAP", secret);
  res.json({ secret, otpauth, qrDataUrl: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
});

authRouter.post("/mfa/enable", requireAuth, validate(z.object({ code: z.string().regex(/^[0-9]{6}$/) })), async (req, res) => {
  const u = await col.users.findOne({ _id: req.user!.id });
  if (!u!.mfaPendingEnc) throw new HttpError(400, "no_pending_mfa", "Start MFA setup first");
  const secret = mfaSecretOf(u, "mfaPendingEnc")!;
  if (!authenticator.check(req.body.code, secret)) throw new HttpError(400, "invalid_code", "Invalid authentication code");
  const { plain, hashes } = newRecoveryCodes();
  await col.users.updateOne({ _id: u!._id }, { $set: { mfaSecretEnc: u!.mfaPendingEnc, mfaPendingEnc: null, mfaEnabled: true, recoveryHashes: hashes } });
  await writeAudit({ userId: u!._id, action: "mfa_enabled", actor: "self", ip: clientIp(req) });
  res.json({ enabled: true, recoveryCodes: plain });
});

authRouter.post("/mfa/disable", requireAuth, validate(z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(20) })), async (req, res) => {
  const u = await col.users.findOne({ _id: req.user!.id });
  if (!u!.mfaEnabled) throw new HttpError(400, "mfa_not_enabled", "MFA is not enabled");
  if (!(await verifyPassword(u!.passwordHash, req.body.password))) throw new HttpError(401, "invalid_credentials", "Wrong password");
  if (!authenticator.check(req.body.code.replace(/\s/g, ""), mfaSecretOf(u)!)) throw new HttpError(401, "invalid_code", "Invalid authentication code");
  await col.users.updateOne({ _id: u!._id }, { $set: { mfaEnabled: false, mfaSecretEnc: null, recoveryHashes: [] } });
  await writeAudit({ userId: u!._id, action: "mfa_disabled", actor: "self", ip: clientIp(req) });
  res.json({ enabled: false });
});

/* ---- Right to erasure: permanently delete the account and everything linked to it ---- */
authRouter.delete("/account", requireAuth, validate(z.object({ password: z.string().min(1), code: z.string().trim().max(20).optional() })), async (req, res) => {
  const u = await col.users.findOne({ _id: req.user!.id });
  if (!(await verifyPassword(u!.passwordHash, req.body.password))) throw new HttpError(401, "invalid_credentials", "Wrong password");
  if (u!.mfaEnabled) {
    const code = (req.body.code || "").replace(/\s/g, "");
    if (!/^[0-9]{6}$/.test(code) || !authenticator.check(code, mfaSecretOf(u)!)) throw new HttpError(401, "invalid_code", "Enter your current authenticator code to delete the account");
  }
  const id = u!._id;
  const tokenIds = (await col.qrTokens.find({ userId: id }).project({ _id: 1 }).toArray()).map((t) => t._id);
  const sessionIds = (await col.sessions.find({ userId: id }).project({ _id: 1 }).toArray()).map((s) => s._id);
  await col.accessSessions.deleteMany({ $or: [{ userId: id }, { tokenId: { $in: tokenIds } }] });
  await col.otps.deleteMany({ tokenId: { $in: tokenIds } });
  await col.scanEvents.deleteMany({ tokenId: { $in: tokenIds } });
  await col.qrTokens.deleteMany({ userId: id });
  await col.refreshTokens.deleteMany({ sessionId: { $in: sessionIds } });
  await col.sessions.deleteMany({ userId: id });
  await col.notifications.deleteMany({ userId: id });
  await col.profiles.deleteOne({ _id: id });
  await col.userKeys.deleteOne({ _id: id });
  await col.audit.deleteMany({ userId: id });
  await col.users.deleteOne({ _id: id });
  res.clearCookie(COOKIE, { path: "/api/v1/auth" });
  res.json({ ok: true });
});

/* ---- Session / device management ---- */
authRouter.get("/sessions", requireAuth, async (req, res) => {
  const rows = await col.sessions.find({ userId: req.user!.id, revoked: false }).sort({ lastUsed: -1 }).toArray();
  res.json({ sessions: rows.map((r) => ({ id: r._id, device: r.device, ip: r.ip, created_at: r.createdAt, last_used: r.lastUsed, current: r._id === req.user!.sessionId })) });
});
authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const r = await col.sessions.updateOne({ _id: id, userId: req.user!.id }, { $set: { revoked: true } });
  if (!r.matchedCount) throw new HttpError(404, "not_found", "Session not found");
  await writeAudit({ userId: req.user!.id, action: "session_revoked", actor: "self", ip: clientIp(req), meta: { sessionId: id } });
  res.json({ ok: true });
});
