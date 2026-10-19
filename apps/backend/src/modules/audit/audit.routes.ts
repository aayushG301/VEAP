import { Router } from "express";
import { col } from "../../config/db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { verifyChain } from "./audit.service";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("patient"));

auditRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await col.audit.find({ userId: req.user!.id }).sort({ seq: -1 }).limit(limit).toArray();
  res.json({ entries: rows.map((r) => ({ id: r.seq, action: r.action, actor: r.actor, tier: r.tier, ip: r.ip, geo: r.geo, reason: r.reason, risk: r.risk, meta: r.meta ? JSON.parse(r.meta) : null, hash: r.hash, created_at: r.createdAt })) });
});

auditRouter.get("/verify", async (req, res) => { res.json(await verifyChain(req.user!.id)); });

auditRouter.get("/analytics", async (req, res) => {
  const uid = req.user!.id;
  const byAction = await col.audit.aggregate([{ $match: { userId: uid } }, { $group: { _id: "$action", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  const since = Date.now() - 7 * 86400_000;
  const scans = await col.audit.find({ userId: uid, action: "scan", createdAt: { $gt: since } }).project({ createdAt: 1 }).limit(5000).toArray();
  const perDay = new Map<string, number>();
  for (const s of scans) { const d = new Date(s.createdAt).toISOString().slice(0, 10); perDay.set(d, (perDay.get(d) || 0) + 1); }
  const geo = await col.audit.find({ userId: uid, geo: { $ne: null } }).sort({ seq: -1 }).limit(50).project({ geo: 1, action: 1, createdAt: 1 }).toArray();
  res.json({
    byAction: byAction.map((r) => ({ action: r._id, n: r.n })),
    scansPerDay: [...perDay.entries()].sort().map(([d, n]) => ({ d, n })),
    geoPoints: geo.map((g) => ({ geo: g.geo, action: g.action, created_at: g.createdAt })),
  });
});
