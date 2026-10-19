import { Router } from "express";
import { col } from "../../config/db";
import { requireAuth } from "../../middleware/auth";

export const notifyRouter = Router();
notifyRouter.use(requireAuth);
notifyRouter.get("/", async (req, res) => {
  const rows = await col.notifications.find({ userId: req.user!.id }).sort({ _id: -1 }).limit(50).toArray();
  const unread = await col.notifications.countDocuments({ userId: req.user!.id, read: false });
  res.json({ notifications: rows.map((r) => ({ id: String(r._id), type: r.type, severity: r.severity, title: r.title, body: r.body, read: r.read ? 1 : 0, created_at: r.createdAt })), unread });
});
notifyRouter.post("/read-all", async (req, res) => { await col.notifications.updateMany({ userId: req.user!.id }, { $set: { read: true } }); res.json({ ok: true }); });
