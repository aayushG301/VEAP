import { Router } from "express";
import { z } from "zod";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { hmacHex, randomDigits, randomId, safeEqual } from "../../security/crypto";
import { optionalAuth } from "../../middleware/auth";
import { otpLimiter, scanLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { clientIp, HttpError, userAgent } from "../../utils/http";
import { scoreScan, interactions } from "../../services/ml.service";
import { writeAudit } from "../audit/audit.service";
import { notify } from "../notifications/notify.service";
import { fieldsForTier, loadProfile } from "../profiles/profile.service";
import { maskPhone, sendSms, toE164 } from "../../services/sms.service";
import { createSession, parseGeo, recordSecurityEvent, requireSession, resolveToken } from "./access.service";
import { createBreakGlass, pollBreakGlass, verifyStaff } from "./breakglass.service";
import { demoHints } from "../../demo/registry";
import { esc, linkedChats, sendTelegram } from "../../services/telegram.service";

export const emergencyRouter = Router();
export const accessRouter = Router();

const tokenField = z.string().min(20).max(80);
const OTP_TTL_MS = 5 * 60_000, OTP_MAX_ATTEMPTS = 3, OTP_PER_TOKEN_15M = 5;
const level = (s: number) => (s >= 60 ? "high" : s >= 30 ? "medium" : "low");

async function scanFeatures(tokenId: string) {
  const now = Date.now();
  const scans_1m = await col.scanEvents.countDocuments({ tokenId, ts: { $gt: now - 60_000 } });
  const scans_10m = await col.scanEvents.countDocuments({ tokenId, ts: { $gt: now - 600_000 } });
  const distinct_ips_10m = (await col.scanEvents.distinct("ip", { tokenId, ts: { $gt: now - 600_000 } })).length;
  const failed = await col.audit.countDocuments({ tokenId, action: "otp_failed", createdAt: { $gt: now - 600_000 } });
  const ok = await col.audit.countDocuments({ tokenId, action: "tier2_granted", createdAt: { $gt: now - 600_000 } });
  const h = new Date().getHours();
  return { scans_1m, scans_10m, distinct_ips_10m, failed_otp_ratio: failed + ok === 0 ? 0 : failed / (failed + ok), night: h < 5 ? 1 : 0 };
}

/* GET /emergency/:token  -> Tier 1 (public) */
emergencyRouter.get("/:token", scanLimiter, async (req, res) => {
  const t = await resolveToken(String(req.params.token), req);
  const now = Date.now();
  await col.scanEvents.insertOne({ tokenId: t.id, ip: clientIp(req), ua: userAgent(req), ts: now, at: new Date(now) });
  const risk = await scoreScan(await scanFeatures(t.id));
  await col.qrTokens.updateOne({ _id: t.id }, { $set: { riskScore: risk.score } });
  const geo = parseGeo(req.query.lat, req.query.lng);
  if (risk.score >= 85) {
    await col.qrTokens.updateOne({ _id: t.id }, { $set: { status: "locked" } });
    await writeAudit({ userId: t.userId, tokenId: t.id, action: "token_locked", actor: "system", ip: clientIp(req), risk: risk.score, meta: { reasons: risk.reasons, source: risk.source } });
    await notify(t.userId, { type: "security", severity: "critical", title: "QR code locked", body: `Your QR code was locked automatically (${risk.reasons.join(", ")}). Unlock it from your dashboard.` });
    throw new HttpError(423, "token_locked", "This QR code was temporarily locked due to suspicious activity. Call your local emergency number.");
  }
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "scan", actor: "public", tier: 1, ip: clientIp(req), geo, risk: risk.score });
  await notify(t.userId, { type: "scan", severity: "info", title: "Emergency profile scanned", body: `Public (Tier 1) view opened${geo ? ` near ${geo}` : ""}.` });
  res.json({ tier: 1, data: await fieldsForTier(t.userId, 1), risk: { level: level(risk.score), source: risk.source }, otpMode: env.otpMode, demo: env.demoSeed ? demoHints() : null });
});

/* GET /emergency/:token/record -> up to the session tier */
emergencyRouter.get("/:token/record", async (req, res) => {
  const t = await resolveToken(String(req.params.token), req);
  const s = await requireSession(req, 2, t.id);
  const data = await fieldsForTier(t.userId, s.tier);
  const meds = [...((data.medications as string[]) || []), ...(((data.prescriptions as any[]) || []).map((r) => r.drug))];
  const warnings = await interactions(meds, (data.allergies as string[]) || []);
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "record_view", actor: s.grantedVia, tier: s.tier, ip: clientIp(req) });
  const { updatedAt } = await loadProfile(t.userId);
  res.json({ tier: s.tier, via: s.grantedVia, expiresAt: s.expiresAt, extended: s.extended, data, profileUpdatedAt: updatedAt,
    responder: s.tier >= 3 ? s.responder : null, warnings: warnings.warnings, warningsSource: warnings.source });
});

/* POST /emergency/:token/report -> anyone can report suspected misuse; the owner is alerted and admins see it */
emergencyRouter.post("/:token/report", scanLimiter, validate(z.object({ reason: z.string().trim().max(300).optional() })), async (req, res) => {
  const t = await resolveToken(String(req.params.token), req, { allowLocked: true });
  await recordSecurityEvent("misuse_report", req, req.body.reason || "reported from emergency page");
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "misuse_reported", actor: "public", ip: clientIp(req), reason: req.body.reason ?? null });
  await notify(t.userId, { type: "security", severity: "warning", title: "Misuse reported on your QR code", body: req.body.reason ? `Someone reported: ${req.body.reason}` : "Someone reported suspicious use of your emergency QR code." });
  res.status(201).json({ ok: true });
});

/* ---- Tier 2: OTP ---- */
accessRouter.post("/otp/request", otpLimiter, validate(z.object({ token: tokenField, phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Invalid phone number") })), async (req, res) => {
  const t = await resolveToken(req.body.token, req);
  if ((await col.otps.countDocuments({ tokenId: t.id, createdAt: { $gt: Date.now() - 15 * 60_000 } })) >= OTP_PER_TOKEN_15M)
    throw new HttpError(429, "otp_rate_limited", "Too many OTP requests for this profile. Try again later.");
  const digits = req.body.phone.replace(/\D/g, "");
  const code = randomDigits(6), id = randomId();
  const now = Date.now();
  await col.otps.insertOne({ _id: id, tokenId: t.id, phoneHash: hmacHex(digits, env.accessSessionSecret), phoneLast4: digits.slice(-4), codeHash: hmacHex(`${id}:${code}`, env.accessSessionSecret), attempts: 0, used: false, expiresAt: now + OTP_TTL_MS, createdAt: now, expireAt: new Date(now + OTP_TTL_MS + 3600_000) });
  // The code goes to the PATIENT'S emergency contact (someone who knows the patient), so a stranger cannot self-verify
  // with their own phone. In telegram mode it is pushed to the Telegram chat(s) the patient linked; it never reaches this browser.
  const { profile } = await loadProfile(t.userId);
  const contact = (profile.emergencyContacts as any[] | undefined)?.[0];
  let sentTo: "emergency_contact" | "responder" = contact ? "emergency_contact" : "responder";
  const targetE164 = toE164(contact ? contact.phone : req.body.phone);
  const firstName = String(profile.fullName || "the patient").split(" ")[0];
  let contactName: string | null = contact?.name ?? null;
  let maskedTarget: string | null = targetE164 ? maskPhone(targetE164) : null;
  if (env.otpMode === "telegram") {
    const chats = await linkedChats(t.userId);
    const fail = async (status: number, code: string, msg: string, error: string) => {
      await col.otps.deleteOne({ _id: id });
      await writeAudit({ userId: t.userId, tokenId: t.id, action: "otp_delivery_failed", actor: "system", ip: clientIp(req), meta: { sentTo: "emergency_contact", channel: "telegram", error } });
      throw new HttpError(status, code, msg);
    };
    if (!chats.length) await fail(409, "contact_not_linked", "The patient's emergency contact has not connected Telegram, so a code cannot be sent. Call your local emergency number (112 / 108) and use the Level 1 information above.", "no telegram contact linked");
    const results = await Promise.allSettled(chats.map((c) => sendTelegram(c.chatId,
      `🚨 <b>VEAP emergency alert</b>\nSomeone just scanned <b>${esc(firstName)}</b>'s emergency QR code and asked to unlock the medical details.\n\nVerification code: <b><code>${code}</code></b>\nValid for 5 minutes.\n\n⚠️ Share it <u>only</u> with a paramedic or doctor who is physically with ${esc(firstName)} right now. If this is not an emergency, tap Block.`,
      [[{ text: "🚫 Not an emergency: block", data: `otp:d:${id}` }]])));
    if (!results.some((r) => r.status === "fulfilled")) await fail(502, "sms_failed", "Could not send the verification code. Call your local emergency number or try again.", String((results[0] as PromiseRejectedResult).reason?.message).slice(0, 120));
    sentTo = "emergency_contact"; contactName = contact?.name ?? chats[0].chatName; maskedTarget = `Telegram (${chats.length} contact${chats.length > 1 ? "s" : ""})`;
  } else if (env.otpMode === "twilio") {
    try {
      if (!targetE164) throw new Error("invalid destination number");
      await sendSms(targetE164, `VEAP: someone scanned ${firstName}'s emergency QR code. Code to unlock medical details: ${code}. Valid 5 minutes. Only share it if this is a genuine emergency.`);
    } catch (e: any) {
      await col.otps.deleteOne({ _id: id });
      await writeAudit({ userId: t.userId, tokenId: t.id, action: "otp_delivery_failed", actor: "system", ip: clientIp(req), meta: { sentTo, error: String(e?.message).slice(0, 120) } });
      throw new HttpError(502, "sms_failed", "Could not send the verification code. Call your local emergency number or try again.");
    }
  }
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "otp_requested", actor: `phone:*${digits.slice(-4)}`, ip: clientIp(req), meta: { sentTo } });
  const body: any = { otpId: id, expiresInSec: OTP_TTL_MS / 1000, delivery: env.otpMode, sentTo, contactName, maskedTarget };
  if (env.otpMode === "mock" && (!env.isProd || env.demoOtp)) body.devOtp = code; // demo only: never returned in production unless ALLOW_DEMO_OTP=true
  if (!env.isTest && env.otpMode === "mock") console.log(`[otp:mock] -> ${sentTo} ${targetE164 ?? ""}: ${code}`);
  res.status(201).json(body);
});

accessRouter.post("/otp/verify", otpLimiter, validate(z.object({ token: tokenField, otpId: z.string().min(10).max(60), code: z.string().regex(/^[0-9]{6}$/) })), async (req, res) => {
  const t = await resolveToken(req.body.token, req);
  // Atomically consume one attempt, so parallel guesses cannot exceed the cap.
  const o = await col.otps.findOneAndUpdate(
    { _id: req.body.otpId, tokenId: t.id, used: false, expiresAt: { $gt: Date.now() }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }, { returnDocument: "before" });
  if (!o) {
    const cur = await col.otps.findOne({ _id: req.body.otpId, tokenId: t.id });
    if (cur && !cur.used && cur.expiresAt >= Date.now() && cur.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, "otp_locked", "Too many wrong attempts. Request a new OTP.");
    throw new HttpError(400, "otp_invalid", "OTP expired or invalid. Request a new one.");
  }
  if (!safeEqual(o.codeHash, hmacHex(`${o._id}:${req.body.code}`, env.accessSessionSecret))) {
    await writeAudit({ userId: t.userId, tokenId: t.id, action: "otp_failed", actor: `phone:*${o.phoneLast4}`, ip: clientIp(req) });
    throw new HttpError(401, "otp_wrong", "Incorrect code", { attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - o.attempts - 1) });
  }
  const used = await col.otps.updateOne({ _id: o._id, used: false }, { $set: { used: true } });
  if (!used.modifiedCount) throw new HttpError(400, "otp_invalid", "OTP expired or invalid. Request a new one.");
  const s = await createSession({ token: t, tier: 2, via: "otp", phoneLast4: o.phoneLast4, ip: clientIp(req) });
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "tier2_granted", actor: `phone:*${o.phoneLast4}`, tier: 2, ip: clientIp(req) });
  await notify(t.userId, { type: "access", severity: "warning", title: "Verified responder access (Tier 2)", body: `A responder verified with phone ending ${o.phoneLast4} and can view conditions and medications for 5 minutes.` });
  res.status(201).json({ sessionToken: s.sessionToken, tier: 2, expiresAt: s.expiresAt });
});

/* ---- Tier 3: emergency override by authenticated hospital staff ----
 * 1) a verified Level 2 session (so the override is traceable to a phone number)
 * 2) hospital ID + staff / council registration ID + PIN, checked against the registry (lockout, suspension, daily limit)
 * 3) the patient's emergency contact is asked to approve or deny; with no answer the request auto-grants after a short delay
 * 4) the record is shown with the responder's identity watermarked, the session is short, and everything is audited. */
accessRouter.post("/break-glass", otpLimiter, validate(z.object({
  token: tokenField,
  hospitalId: z.string().trim().min(3).max(30), staffId: z.string().trim().min(3).max(30), pin: z.string().regex(/^[0-9]{6}$/, "PIN must be 6 digits"),
  reason: z.string().trim().min(15, "Describe the emergency (min 15 characters)").max(500), lat: z.number().optional(), lng: z.number().optional(),
})), async (req, res) => {
  const t = await resolveToken(req.body.token, req);
  const s2 = await requireSession(req, 2, t.id);
  const { staff, hospital } = await verifyStaff(req.body, req);
  const r = await createBreakGlass({ token: t, s2, staff, hospital, reason: req.body.reason, geo: parseGeo(req.body.lat, req.body.lng), req });
  res.status(202).json({ requestId: r.row._id, status: "pending", delaySec: env.breakGlass.delaySec, autoGrantAt: r.row.autoGrantAt, contactNotified: r.notified > 0, responder: { name: staff.name, designation: staff.designation, hospital: hospital.name } });
});

accessRouter.get("/break-glass/:id", async (req, res) => {
  const s2 = await requireSession(req, 2);
  res.json(await pollBreakGlass(String(req.params.id), s2, req));
});

/* ---- Tier 3: verified medical professional (authenticated, license approved by admin) ---- */
accessRouter.post("/credential", optionalAuth, validate(z.object({ token: tokenField })), async (req, res) => {
  const u = req.user;
  if (!u) throw new HttpError(401, "unauthorized", "Log in as a verified medical professional");
  if (u.role !== "medical_professional" || u.responderStatus !== "approved") throw new HttpError(403, "not_verified", "Your responder license has not been approved yet");
  const t = await resolveToken(req.body.token, req);
  const urow = await col.users.findOne({ _id: u.id });
  const s = await createSession({ token: t, tier: 3, via: "credential", responderId: u.id, responder: { staffId: urow?.licenseNo ?? u.id.slice(0, 8), name: u.name, designation: "Verified medical professional", hospitalId: null, hospitalName: "" }, ip: clientIp(req) });
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "tier3_credential", actor: `professional:${u.id}`, tier: 3, ip: clientIp(req) });
  await notify(t.userId, { type: "access", severity: "warning", title: "Verified professional access (Tier 3)", body: `${u.name} (license verified) opened your full record.` });
  res.status(201).json({ sessionToken: s.sessionToken, tier: 3, expiresAt: s.expiresAt });
});

accessRouter.post("/extend", async (req, res) => {
  const s = await requireSession(req, 2);
  const exp = s.expiresAt + 5 * 60_000;
  // Atomic "once only": the filter requires extended=false.
  const r = await col.accessSessions.updateOne({ _id: s.id, extended: false }, { $set: { extended: true, expiresAt: exp } });
  if (!r.matchedCount) throw new HttpError(409, "already_extended", "A session can be extended only once");
  await writeAudit({ userId: s.userId, tokenId: s.tokenId, action: "session_extended", actor: s.grantedVia, tier: s.tier, ip: clientIp(req) });
  res.json({ expiresAt: exp });
});

accessRouter.post("/end", async (req, res) => {
  const s = await requireSession(req, 2);
  await col.accessSessions.updateOne({ _id: s.id }, { $set: { revoked: true } });
  await writeAudit({ userId: s.userId, tokenId: s.tokenId, action: "session_ended", actor: s.grantedVia, tier: s.tier, ip: clientIp(req) });
  res.json({ ok: true });
});
