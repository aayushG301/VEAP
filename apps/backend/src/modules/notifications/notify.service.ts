import { col } from "../../config/db";
import { env } from "../../config/env";

export type Severity = "info" | "warning" | "critical";
/** In-app notification + delivery adapter. In mock mode the SMS/email/push is logged; plug Twilio/SMTP in here. */
export async function notify(userId: string, n: { type: string; severity: Severity; title: string; body: string }) {
  await col.notifications.insertOne({ userId, type: n.type, severity: n.severity, title: n.title, body: n.body, read: false, createdAt: Date.now() });
  if (!env.isTest && n.severity !== "info") console.log(`[notify:${n.severity}] user=${userId} ${n.title} - ${n.body}`);
}
