import { col } from "../config/db";
import { env } from "../config/env";
import { randomId, randomToken, sha256 } from "../security/crypto";

/**
 * Telegram Bot API integration (free forever, no phone-number fees).
 * The patient links their emergency contact's Telegram account once; after that Level 2 codes and Level 3 approval
 * requests are pushed to that chat, never to the responder's browser. Uses long polling, so it needs no public webhook
 * and works on localhost, Render, anywhere.
 */
export interface Button { text: string; data: string }
export type CallbackHandler = (data: string, chatId: string) => Promise<string>;

export class TelegramError extends Error { constructor(message: string, public status = 0) { super(message); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const telegramConfigured = () => !!env.telegram.botToken;

async function tg<T = any>(method: string, payload: Record<string, unknown> = {}, timeoutMs = 10000): Promise<T> {
  if (!env.telegram.botToken) throw new TelegramError("Telegram is not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal,
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new TelegramError(String(j.description || `Telegram responded ${r.status}`).slice(0, 160), r.status);
    return j.result as T;
  } catch (e: any) {
    if (e instanceof TelegramError) throw e;
    throw new TelegramError(e?.name === "AbortError" ? "Telegram request timed out" : String(e?.message || e).slice(0, 160));
  } finally { clearTimeout(timer); }
}

let cachedUsername: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  if (!telegramConfigured()) return null;
  try { cachedUsername = (await tg<{ username: string }>("getMe")).username; } catch { /* reported by the caller */ }
  return cachedUsername;
}

export async function sendTelegram(chatId: string, html: string, buttons?: Button[][]): Promise<void> {
  await tg("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
  });
}

export async function linkedChats(userId: string): Promise<{ id: string; chatId: string; chatName: string; linkedAt: number }[]> {
  const rows = await col.telegramLinks.find({ userId }).sort({ linkedAt: 1 }).toArray();
  return rows.map((r) => ({ id: r._id, chatId: r.chatId, chatName: r.chatName, linkedAt: r.linkedAt }));
}

/** Sends to every chat linked to this patient. Returns how many deliveries succeeded. */
export async function sendToPatientContacts(userId: string, html: string, buttons?: Button[][]): Promise<{ delivered: number; attempted: number; error?: string }> {
  const chats = await linkedChats(userId);
  const results = await Promise.allSettled(chats.map((c) => sendTelegram(c.chatId, html, buttons)));
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  return { delivered: results.filter((r) => r.status === "fulfilled").length, attempted: chats.length, error: failed ? String(failed.reason?.message || failed.reason) : undefined };
}

/* ---------------- linking ---------------- */
export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: number }> {
  const code = randomToken(12);
  const expiresAt = Date.now() + 10 * 60_000;
  await col.telegramLinkCodes.deleteMany({ userId });
  await col.telegramLinkCodes.insertOne({ _id: sha256(code), userId, expiresAt, expireAt: new Date(expiresAt + 60_000) });
  return { code, expiresAt };
}

/** Consumes a one-time link code. Returns the patient's user id, or null if the code is unknown/expired. */
export async function consumeLinkCode(code: string, chatId: string, chatName: string): Promise<string | null> {
  const row = await col.telegramLinkCodes.findOneAndDelete({ _id: sha256(code), expiresAt: { $gt: Date.now() } });
  if (!row) return null;
  await col.telegramLinks.updateOne({ userId: row.userId, chatId }, { $set: { chatName, linkedAt: Date.now() }, $setOnInsert: { _id: randomId() } }, { upsert: true });
  return row.userId;
}

/* ---------------- bot loop (long polling) ---------------- */
let running = false;
let onLinked: ((userId: string, chatId: string, chatName: string) => Promise<void>) | null = null;
let onCallback: CallbackHandler | null = null;
export function configureBot(h: { linked: typeof onLinked; callback: CallbackHandler }) { onLinked = h.linked; onCallback = h.callback; }

async function handleUpdate(u: any) {
  if (u.callback_query) {
    const q = u.callback_query;
    const chatId = String(q.message?.chat?.id ?? q.from?.id);
    let reply = "Sorry, something went wrong.";
    try { reply = onCallback ? await onCallback(String(q.data || ""), chatId) : reply; } catch (e: any) { reply = "Could not process that: " + String(e?.message || e).slice(0, 100); }
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: reply.slice(0, 190) }).catch(() => undefined);
    if (q.message) {
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
      await sendTelegram(chatId, esc(reply)).catch(() => undefined);
    }
    return;
  }
  const m = u.message;
  if (!m?.text) return;
  const chatId = String(m.chat.id);
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.chat.username || "Emergency contact";
  const [cmd, arg] = m.text.trim().split(/\s+/, 2);
  if (cmd.startsWith("/start") && arg) {
    const userId = await consumeLinkCode(arg, chatId, name);
    if (!userId) return void (await sendTelegram(chatId, "⚠️ This link has expired or was already used. Ask the patient to open <b>VEAP → Security → Telegram alerts</b> and create a new one."));
    const owner = await col.users.findOne({ _id: userId });
    await sendTelegram(chatId, `✅ <b>Connected.</b>\nYou are now an emergency contact for <b>${esc(owner?.name || "a VEAP user")}</b>.\n\nIf a stranger scans their emergency QR code, the verification code arrives here, and you can block it. Never share a code unless a paramedic or doctor is physically with the patient.\n\nSend /stop to disconnect.`);
    if (onLinked) await onLinked(userId, chatId, name);
    return;
  }
  if (cmd.startsWith("/stop") || cmd.startsWith("/unlink")) {
    const links = await col.telegramLinks.find({ chatId }).toArray();
    await col.telegramLinks.deleteMany({ chatId });
    await sendTelegram(chatId, links.length ? "Disconnected. You will no longer receive VEAP alerts here." : "This chat is not connected to any VEAP profile.");
    return;
  }
  await sendTelegram(chatId, "👋 This is the <b>VEAP Emergency Alerts</b> bot. To become someone's emergency contact, open the link they send you from the VEAP app.");
}

export function startTelegramBot() {
  if (!telegramConfigured() || running) return;
  running = true;
  void (async () => {
    let offset = 0;
    try { await tg("deleteWebhook"); } catch { /* polling needs no webhook */ }
    const me = await botUsername();
    console.log(`[telegram] bot @${me ?? "?"} polling for updates`);
    while (running) {
      try {
        const updates = await tg<any[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35000);
        for (const u of updates) { offset = u.update_id + 1; try { await handleUpdate(u); } catch (e: any) { console.error("[telegram] update error:", e?.message); } }
      } catch (e: any) {
        console.error("[telegram] poll error:", e?.message);
        await sleep(e?.status === 409 ? 8000 : 3000); // 409 = another instance is polling (e.g. during a deploy)
      }
    }
  })();
}
export const stopTelegramBot = () => { running = false; };
