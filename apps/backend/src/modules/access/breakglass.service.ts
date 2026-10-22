import type { Request } from "express";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { randomId } from "../../security/crypto";
import { DUMMY_HASH_PROMISE, verifyPassword } from "../../security/passwords";
import { signAccessSessionToken } from "../../security/tokens";
import { HttpError, clientIp } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";
import { notify } from "../notifications/notify.service";
import { esc, sendToPatientContacts, telegramConfigured } from "../../services/telegram.service";
import { loadProfile } from "../profiles/profile.service";
import { createSession, recordSecurityEvent, type QrRow, type Responder, type SessionRow } from "./access.service";

const norm = (s: string) => s.trim().toUpperCase();
const GENERIC = "Hospital ID, staff ID or PIN is not valid. Check them and try again.";
const DAY = 24 * 3600_000;

/**
 * Authenticates a hospital staff member against the (simulated) registry: hospital must be active, the staff ID must belong
 * to that hospital and be active, and the PIN (argon2id hash) must match. Unknown IDs cost the same time as wrong PINs and
 * return the same message, so IDs cannot be enumerated. Repeated wrong PINs lock the staff ID.
 */
export async function verifyStaff(input: { hospitalId: string; staffId: string; pin: string }, req: Request) {
  const staffId = norm(input.staffId), hospitalId = norm(input.hospitalId);
  const staff = await col.staff.findOne({ _id: staffId });
  const hospital = staff ? await col.hospitals.findOne({ _id: staff.hospitalId }) : null;
  const matches = !!staff && staff.hospitalId === hospitalId && staff.status === "active" && hospital?.status === "active";
  if (!matches) {
    await verifyPassword(await DUMMY_HASH_PROMISE, input.pin); // burn comparable time
    await recordSecurityEvent("staff_verification_failed", req, `hospital=${hospitalId} staff=${staffId}`);
    throw new HttpError(401, "verification_failed", GENERIC);
  }
  if (staff.lockedUntil > Date.now()) throw new HttpError(423, "staff_locked", `This staff ID is locked after repeated wrong PINs. Try again in ${Math.ceil((staff.lockedUntil - Date.now()) / 60_000)} min or contact your hospital administrator.`);
  if (!(await verifyPassword(staff.pinHash, input.pin))) {
    const after = await col.staff.findOneAndUpdate({ _id: staffId }, { $inc: { failedPins: 1 } }, { returnDocument: "after" });
    if (after && after.failedPins >= env.breakGlass.pinMaxFailures) await col.staff.updateOne({ _id: staffId }, { $set: { failedPins: 0, lockedUntil: Date.now() + env.breakGlass.lockMinutes * 60_000 } });
    await recordSecurityEvent("staff_pin_failed", req, `staff=${staffId}`);
    throw new HttpError(401, "verification_failed", GENERIC);
  }
  if (staff.failedPins) await col.staff.updateOne({ _id: staffId }, { $set: { failedPins: 0 } });
  return { staff, hospital: hospital! };
}

const fmtDelay = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`);

export async function createBreakGlass(p: { token: QrRow; s2: SessionRow; staff: any; hospital: any; reason: string; geo: string | null; req: Request }) {
  const { token: t, staff, hospital } = p;
  const now = Date.now();
  if ((await col.breakGlass.countDocuments({ staffId: staff._id, createdAt: { $gt: now - DAY } })) >= env.breakGlass.maxPerStaffPerDay)
    throw new HttpError(429, "override_limit", `Daily override limit reached for this staff ID (${env.breakGlass.maxPerStaffPerDay} per 24 h). Escalate to your hospital's duty officer.`);
  const open = await col.breakGlass.findOne({ tokenId: t.id, status: "pending", createdAt: { $gt: now - 15 * 60_000 } });
  if (open) {
    if (open.staffId === staff._id) return { row: open, notified: 0, reused: true };
    throw new HttpError(409, "override_pending", "Another override request for this patient is already waiting for a decision.");
  }
  const id = randomId();
  const row = { _id: id, tokenId: t.id, userId: t.userId, staffId: staff._id as string, staffName: staff.name as string, designation: staff.designation as string, hospitalId: hospital._id as string, hospitalName: hospital.name as string,
    reason: p.reason, status: "pending", phoneLast4: p.s2.phoneLast4, ip: clientIp(p.req), geo: p.geo, createdAt: now, autoGrantAt: now + env.breakGlass.delaySec * 1000, sessionId: null as string | null, issuing: false, expireAt: new Date(now + 6 * 3600_000) };
  await col.breakGlass.insertOne(row);
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "break_glass_requested", actor: `staff:${staff._id}`, tier: 3, ip: row.ip, geo: p.geo, reason: p.reason, meta: { hospitalId: hospital._id, hospital: hospital.name, staff: staff.name, designation: staff.designation, autoGrantInSec: env.breakGlass.delaySec } });
  await notify(t.userId, { type: "access", severity: "critical", title: "Emergency override requested (Level 3)", body: `${staff.name} (${staff.designation}, ${hospital.name}, ID ${staff._id}) asks to open your full record. Reason: ${p.reason}. Your emergency contact can deny it; otherwise it is granted in ${fmtDelay(env.breakGlass.delaySec)}.` });

  let notified = 0;
  if (env.otpMode === "telegram" && telegramConfigured()) {
    const { profile } = await loadProfile(t.userId);
    const first = esc(String(profile.fullName || "the patient").split(" ")[0]);
    const r = await sendToPatientContacts(t.userId,
      `🚨 <b>VEAP: emergency override request</b>\n\n<b>${esc(staff.name)}</b>, ${esc(staff.designation)}\n${esc(hospital.name)}\nHospital ID <code>${esc(hospital._id)}</code> · Staff ID <code>${esc(staff._id)}</code>\n\nasks to open <b>${first}'s FULL medical record</b>.\nReason: <i>${esc(p.reason)}</i>\n\nIf you do nothing, access is granted automatically in <b>${fmtDelay(env.breakGlass.delaySec)}</b>, because the patient may be unable to consent. <b>Deny</b> it if this does not look like a real emergency.`,
      [[{ text: "✅ Approve", data: `bg:a:${id}` }, { text: "🚫 Deny", data: `bg:d:${id}` }]]);
    notified = r.delivered;
    if (r.error) await writeAudit({ userId: t.userId, tokenId: t.id, action: "otp_delivery_failed", actor: "system", ip: row.ip, meta: { channel: "telegram", error: r.error.slice(0, 120) } });
  }
  return { row, notified, reused: false };
}

/** Called by the Telegram bot when a linked contact taps Approve or Deny. */
export async function decideBreakGlass(id: string, decision: "approved" | "denied", chatId: string): Promise<string> {
  const row = await col.breakGlass.findOne({ _id: id });
  if (!row) return "This request no longer exists.";
  if (!(await col.telegramLinks.findOne({ userId: row.userId, chatId }))) return "You are not an emergency contact for this patient.";
  const r = await col.breakGlass.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status: decision, decidedAt: Date.now(), decidedBy: "emergency_contact" } }, { returnDocument: "after" });
  if (!r) return `Too late: this request is already ${row.status.replace("_", " ")}.`;
  await writeAudit({ userId: row.userId, tokenId: row.tokenId, action: decision === "approved" ? "break_glass_approved" : "break_glass_denied", actor: "contact:telegram", tier: 3, meta: { staff: row.staffId, hospitalId: row.hospitalId } });
  await notify(row.userId, { type: "access", severity: decision === "approved" ? "warning" : "info", title: decision === "approved" ? "Override approved by your contact" : "Override denied by your contact", body: `${row.staffName} (${row.hospitalName}) was ${decision === "approved" ? "approved" : "denied"} by your emergency contact.` });
  return decision === "approved" ? "✅ Approved. The medical team can now open the record." : "🚫 Denied. The request was blocked and the patient was alerted.";
}

/** Polled by the responder's browser. Issues the Tier 3 session exactly once the request is approved or its delay has elapsed. */
export async function pollBreakGlass(id: string, s2: SessionRow, req: Request) {
  let row = await col.breakGlass.findOne({ _id: id });
  if (!row || row.tokenId !== s2.tokenId) throw new HttpError(404, "not_found", "Override request not found");
  const now = Date.now();
  if (row.status === "pending" && now >= row.autoGrantAt) {
    const r = await col.breakGlass.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status: "auto_granted", decidedAt: now, decidedBy: "timeout" } }, { returnDocument: "after" });
    if (r) {
      await writeAudit({ userId: row.userId, tokenId: row.tokenId, action: "break_glass_auto_granted", actor: "system", tier: 3, ip: clientIp(req), meta: { staff: row.staffId, afterSec: env.breakGlass.delaySec } });
    }
    row = (await col.breakGlass.findOne({ _id: id }))!;
  }
  if (row.status === "denied") return { status: "denied" as const };
  if (row.status === "pending") return { status: "pending" as const, secondsLeft: Math.max(0, Math.ceil((row.autoGrantAt - now) / 1000)) };

  // approved or auto_granted: hand out the session once (re-sign the same session if the browser asks again)
  if (row.sessionId) {
    const s = await col.accessSessions.findOne({ _id: row.sessionId });
    if (!s || s.revoked || s.expiresAt < now) throw new HttpError(410, "session_expired", "This override has expired. Start a new request.");
    return { status: row.status as "approved" | "auto_granted", tier: 3, expiresAt: s.expiresAt, sessionToken: signAccessSessionToken(s._id, s.tokenId, 3, Math.ceil((s.expiresAt - now) / 1000) + 600) };
  }
  const claimed = await col.breakGlass.findOneAndUpdate({ _id: id, sessionId: null, issuing: false }, { $set: { issuing: true } });
  if (!claimed) return { status: row.status as "approved" | "auto_granted", sessionToken: null as string | null }; // another poll is issuing it
  const responder: Responder = { staffId: row.staffId, name: row.staffName, designation: row.designation, hospitalId: row.hospitalId, hospitalName: row.hospitalName };
  const t: QrRow = { id: row.tokenId, userId: row.userId, status: "active", riskScore: 0 };
  const s = await createSession({ token: t, tier: 3, via: "break_glass", phoneLast4: row.phoneLast4 ?? undefined, reason: row.reason, responder, ip: clientIp(req) });
  await col.breakGlass.updateOne({ _id: id }, { $set: { sessionId: s.id } });
  const how = row.status === "approved" ? "approved by your emergency contact" : `auto-granted after ${fmtDelay(env.breakGlass.delaySec)} with no response`;
  await writeAudit({ userId: row.userId, tokenId: row.tokenId, action: "break_glass", actor: `staff:${row.staffId}`, tier: 3, ip: clientIp(req), geo: row.geo, reason: row.reason, meta: { hospitalId: row.hospitalId, hospital: row.hospitalName, staff: row.staffName, designation: row.designation, grantedBy: row.status } });
  await notify(row.userId, { type: "access", severity: "critical", title: "BREAK-GLASS access used (Tier 3)", body: `${row.staffName} (${row.designation}, ${row.hospitalName}, ID ${row.staffId}) opened your full record, ${how}. Reason: ${row.reason}` });
  return { status: row.status as "approved" | "auto_granted", tier: 3, expiresAt: s.expiresAt, sessionToken: s.sessionToken };
}
