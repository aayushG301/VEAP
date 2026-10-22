import { Router } from "express";
import QRCode from "qrcode";
import { col } from "../../config/db";
import { env } from "../../config/env";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError, clientIp } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";
import { botUsername, createLinkCode, esc, linkedChats, sendToPatientContacts, telegramConfigured } from "../../services/telegram.service";

export const telegramRouter = Router();
telegramRouter.use(requireAuth, requireRole("patient"));

telegramRouter.get("/", async (req, res) => {
  res.json({ configured: telegramConfigured(), active: env.otpMode === "telegram", botUsername: await botUsername(), links: await linkedChats(req.user!.id) });
});

/** Creates a one-time (10 min) deep link: https://t.me/<bot>?start=<code>. The contact opens it and taps Start. */
telegramRouter.post("/link", async (req, res) => {
  if (!telegramConfigured()) throw new HttpError(503, "telegram_not_configured", "Telegram alerts are not enabled on this server (TELEGRAM_BOT_TOKEN is missing).");
  const bot = await botUsername();
  if (!bot) throw new HttpError(502, "telegram_unreachable", "Could not reach Telegram. Check TELEGRAM_BOT_TOKEN and try again.");
  const { code, expiresAt } = await createLinkCode(req.user!.id);
  const url = `https://t.me/${bot}?start=${code}`;
  res.status(201).json({ url, botUsername: bot, expiresAt, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
});

telegramRouter.post("/test", async (req, res) => {
  if (!telegramConfigured()) throw new HttpError(503, "telegram_not_configured", "Telegram alerts are not enabled on this server.");
  const r = await sendToPatientContacts(req.user!.id, `🔔 <b>VEAP test message</b>\nThis chat is connected as an emergency contact for <b>${esc(req.user!.name)}</b>. Real codes will look like this.`);
  if (!r.attempted) throw new HttpError(409, "no_links", "No Telegram contact is connected yet.");
  if (!r.delivered) throw new HttpError(502, "telegram_failed", r.error || "Telegram could not deliver the message.");
  res.json({ delivered: r.delivered });
});

telegramRouter.delete("/links/:id", async (req, res) => {
  const r = await col.telegramLinks.deleteOne({ _id: String(req.params.id), userId: req.user!.id });
  if (!r.deletedCount) throw new HttpError(404, "not_found", "Link not found");
  await writeAudit({ userId: req.user!.id, action: "telegram_unlinked", actor: "self", ip: clientIp(req) });
  res.json({ ok: true });
});
