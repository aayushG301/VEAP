import { Router } from "express";
import QRCode from "qrcode";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { decryptWithMaster, encryptWithMaster, randomId } from "../../security/crypto";
import { createQrToken } from "../../security/tokens";
import { requireAuth, requireRole } from "../../middleware/auth";
import { clientIp, HttpError } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";

export const qrRouter = Router();
qrRouter.use(requireAuth, requireRole("patient"));

const urlFor = (tokenEnc: string, id: string) => `${env.publicUrl}/e/${decryptWithMaster(tokenEnc, `qr:${id}`)}`;

async function view(r: any) {
  const base = { id: r._id, status: r.status, riskScore: r.riskScore, createdAt: r.createdAt, revokedAt: r.revokedAt ?? null };
  if (r.status === "revoked") return base;
  const url = urlFor(r.tokenEnc, r._id);
  return { ...base, url, dataUrl: await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 360 }) };
}

qrRouter.get("/", async (req, res) => {
  const rows = await col.qrTokens.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(20).toArray();
  res.json({ tokens: await Promise.all(rows.map(view)) });
});

qrRouter.post("/", async (req, res) => {
  const uid = req.user!.id;
  await col.qrTokens.updateMany({ userId: uid, status: { $in: ["active", "locked"] } }, { $set: { status: "revoked", revokedAt: Date.now() } });
  const { token, tokenHash } = createQrToken();
  const id = randomId();
  await col.qrTokens.insertOne({ _id: id, userId: uid, tokenHash, tokenEnc: encryptWithMaster(token, `qr:${id}`), status: "active", riskScore: 0, createdAt: Date.now(), revokedAt: null });
  await writeAudit({ userId: uid, tokenId: id, action: "token_created", actor: "self", ip: clientIp(req) });
  res.status(201).json({ token: await view(await col.qrTokens.findOne({ _id: id })) });
});

qrRouter.post("/:id/revoke", async (req, res) => {
  const id = String(req.params.id);
  const r = await col.qrTokens.updateOne({ _id: id, userId: req.user!.id, status: { $ne: "revoked" } }, { $set: { status: "revoked", revokedAt: Date.now() } });
  if (!r.matchedCount) throw new HttpError(404, "not_found", "Active token not found");
  await col.accessSessions.updateMany({ tokenId: id }, { $set: { revoked: true } }); // kill live emergency sessions too
  await writeAudit({ userId: req.user!.id, tokenId: id, action: "token_revoked", actor: "self", ip: clientIp(req) });
  res.json({ ok: true });
});

qrRouter.post("/:id/unlock", async (req, res) => {
  const id = String(req.params.id);
  const r = await col.qrTokens.updateOne({ _id: id, userId: req.user!.id, status: "locked" }, { $set: { status: "active", riskScore: 0 } });
  if (!r.matchedCount) throw new HttpError(404, "not_found", "Locked token not found");
  await writeAudit({ userId: req.user!.id, tokenId: id, action: "token_unlocked", actor: "self", ip: clientIp(req) });
  res.json({ ok: true });
});

qrRouter.get("/:id/image.png", async (req, res) => {
  const r = await col.qrTokens.findOne({ _id: String(req.params.id), userId: req.user!.id, status: { $ne: "revoked" } });
  if (!r) throw new HttpError(404, "not_found", "Token not found");
  const png = await QRCode.toBuffer(urlFor(r.tokenEnc, r._id), { errorCorrectionLevel: "M", margin: 2, width: 600 });
  res.type("png").set("Content-Disposition", "attachment; filename=veap-qr.png").send(png);
});
