import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";

interface Link { id: string; chatName: string; linkedAt: number }

/** Connect the emergency contact's Telegram: they receive the Level 2 codes and Level 3 override requests (with Block / Deny buttons). */
export default function TelegramCard() {
  const { toast } = useToast();
  const [st, setSt] = useState<{ configured: boolean; active: boolean; botUsername: string | null; links: Link[] } | null>(null);
  const [link, setLink] = useState<{ url: string; qrDataUrl: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("/telegram").then(setSt).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!link) return; const id = setInterval(load, 4000); return () => clearInterval(id); }, [link]);
  useEffect(() => { if (link && st && st.links.length > 0) setLink(null); }, [st?.links.length]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); } };
  if (!st) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <div className="card">
      <div className="card__title">📲 Emergency contact alerts (Telegram)<span className="spacer" /><span className={`badge ${st.links.length ? "badge--safe" : "badge--warn"}`}>{st.links.length ? "Connected" : "Not connected"}</span></div>
      <p className="text-sm mb-md">When a stranger scans your QR and asks for Level 2 access, the 6-digit code goes <b>privately to your emergency contact's Telegram</b>, never to the stranger's screen. Level 3 override requests arrive there too, with <b>Approve / Deny</b> buttons. Free, no SMS fees.</p>
      {!st.configured && <div className="card card--warning card--tight text-sm mb-md">This server has no Telegram bot yet. Create one with @BotFather and set <code>TELEGRAM_BOT_TOKEN</code> (see README).</div>}
      {st.configured && !st.active && <div className="card card--warning card--tight text-sm mb-md">The bot is ready, but <code>OTP_MODE</code> is not <code>telegram</code>, so codes are not sent there yet.</div>}
      {st.links.map((l) => (
        <div key={l.id} className="contact-card"><div><h4>✅ {l.chatName}</h4><p>Connected {new Date(l.linkedAt).toLocaleDateString()}</p></div>
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(async () => { await api(`/telegram/links/${l.id}`, { method: "DELETE" }); await load(); toast("Contact removed", "info"); })}>Remove</button></div>))}
      {link && (
        <div className="text-center mb-md">
          <p className="text-sm mb-sm">Ask your contact to scan this with their phone (or open the link on the phone that has Telegram), then tap <b>Start</b>. Valid for 10 minutes.</p>
          <div className="qr-display__code" style={{ padding: 10 }}><img src={link.qrDataUrl} alt="Telegram connect QR code" width={180} /></div>
          <div className="row mt-sm" style={{ justifyContent: "center" }}>
            <a className="btn btn--primary btn--sm" href={link.url} target="_blank" rel="noreferrer">Open in Telegram</a>
            <button className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(link.url).then(() => toast("Link copied", "success"))}>📋 Copy link</button>
          </div>
          <p className="text-xs text-muted mt-sm">Waiting for them to tap Start…</p>
        </div>)}
      <div className="row">
        {st.configured && <button className="btn btn--primary" disabled={busy} onClick={() => run(async () => setLink(await api("/telegram/link", { method: "POST", body: {} })))}>{st.links.length ? "Add another contact" : "Connect emergency contact"}</button>}
        {st.links.length > 0 && <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => { await api("/telegram/test", { method: "POST", body: {} }); toast("Test message sent. Check Telegram.", "success"); })}>Send test message</button>}
      </div>
    </div>
  );
}
