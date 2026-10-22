import { col } from "../../config/db";
import { configureBot } from "../../services/telegram.service";
import { writeAudit } from "../audit/audit.service";
import { notify } from "../notifications/notify.service";
import { decideBreakGlass } from "../access/breakglass.service";

/** Button presses coming back from the contact's Telegram chat. Every action re-checks that the chat is linked to that patient. */
export async function onCallback(data: string, chatId: string): Promise<string> {
  const [kind, action, id] = data.split(":");
  if (kind === "bg" && id && (action === "a" || action === "d")) return decideBreakGlass(id, action === "a" ? "approved" : "denied", chatId);
  if (kind === "otp" && action === "d" && id) {
    const otp = await col.otps.findOne({ _id: id });
    const qr = otp ? await col.qrTokens.findOne({ _id: otp.tokenId }) : null;
    if (!otp || !qr) return "This code no longer exists.";
    if (!(await col.telegramLinks.findOne({ userId: qr.userId, chatId }))) return "You are not an emergency contact for this patient.";
    await col.otps.updateMany({ tokenId: otp.tokenId, used: false }, { $set: { used: true } }); // every outstanding code for this QR dies
    await writeAudit({ userId: qr.userId, tokenId: qr._id, action: "otp_denied_by_contact", actor: "contact:telegram" });
    await notify(qr.userId, { type: "security", severity: "warning", title: "Your contact blocked a verification attempt", body: "Someone requested a Level 2 code for your QR, and your emergency contact blocked it as not-an-emergency." });
    return "🚫 Blocked. The code was cancelled and the patient was alerted.";
  }
  return "Unknown action.";
}

export function registerTelegramHandlers() {
  configureBot({
    callback: onCallback,
    linked: async (userId, _chatId, chatName) => {
      await writeAudit({ userId, action: "telegram_linked", actor: "contact:telegram", meta: { contact: chatName } });
      await notify(userId, { type: "security", severity: "info", title: "Emergency contact connected on Telegram", body: `${chatName} will now receive your verification codes and override requests.` });
    },
  });
}
