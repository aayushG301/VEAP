import { Router } from "express";
import { z } from "zod";
import { col } from "../../config/db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { clientIp, HttpError } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";
import { notify } from "../notifications/notify.service";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));
const RESPONDER_ROLES = ["responder", "medical_professional"];

adminRouter.get("/responders", async (req, res) => {
  const status = String(req.query.status || "pending");
  const rows = await col.users.find({ role: { $in: RESPONDER_ROLES }, responderStatus: status }).sort({ createdAt: -1 }).toArray();
  res.json({ responders: rows.map((u) => ({ id: u._id, email: u.email, name: u.name, license_no: u.licenseNo, license_issuer: u.licenseIssuer, responder_status: u.responderStatus, created_at: u.createdAt })) });
});

function decide(status: "approved" | "rejected") {
  return async (req: any, res: any) => {
    const u = await col.users.findOne({ _id: String(req.params.id), role: { $in: RESPONDER_ROLES } });
    if (!u) throw new HttpError(404, "not_found", "Responder not found");
    await col.users.updateOne({ _id: u._id }, { $set: { responderStatus: status, role: status === "approved" ? "medical_professional" : "responder" } });
    await writeAudit({ userId: u._id, action: `responder_${status}`, actor: req.user.id, ip: clientIp(req) });
    await notify(u._id, { type: "responder", severity: "info", title: `Responder application ${status}`, body: `Your license ${u.licenseNo} was ${status}.` });
    res.json({ ok: true, status });
  };
}
adminRouter.post("/responders/:id/approve", decide("approved"));
adminRouter.post("/responders/:id/reject", validate(z.object({}).passthrough()), decide("rejected"));

adminRouter.get("/security-events", async (_req, res) => {
  const rows = await col.securityEvents.find({}).sort({ ts: -1 }).limit(100).toArray();
  res.json({ events: rows.map((e) => ({ id: String(e._id), kind: e.kind, ip: e.ip, ua: e.ua, detail: e.detail, ts: e.ts })) });
});
adminRouter.get("/stats", async (_req, res) => {
  res.json({
    users: await col.users.countDocuments({}),
    activeTokens: await col.qrTokens.countDocuments({ status: "active" }),
    lockedTokens: await col.qrTokens.countDocuments({ status: "locked" }),
    scans24h: await col.scanEvents.countDocuments({ ts: { $gt: Date.now() - 86400000 } }),
    breakGlass: await col.audit.countDocuments({ action: "break_glass" }),
    securityEvents: await col.securityEvents.countDocuments({}),
  });
});
