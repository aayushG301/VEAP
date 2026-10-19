import { useEffect, useState } from "react";
import { api, download } from "../../lib/api";
import { fmtDate } from "../../lib/util";
import { Logo } from "../../components/Logo";
import { ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../lib/auth";

export default function QrTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tokens, setTokens] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "regen" | "revoke">(null);
  const load = () => api("/qr").then((r) => setTokens(r.tokens)).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); }, []);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok, "success"); await load(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); setConfirm(null); } };

  if (!tokens) return <div className="skeleton" style={{ height: 320 }} />;
  const live = tokens.find((t) => t.status !== "revoked");
  const isLocal = live && /\/\/(localhost|127\.|192\.168\.|10\.)/.test(live.url);
  const riskPct = live ? Math.min(100, live.riskScore) : 0;

  return (
    <div className="split">
      <div className="stack">
        <div className={`card ${live?.status === "locked" ? "card--danger" : ""}`}>
          <div className="card__title">📱 Your emergency QR code</div>
          {!live ? (
            <div className="center-state" style={{ padding: "var(--space-lg)" }}>
              <div style={{ fontSize: 56 }}>📷</div>
              <h4 style={{ margin: ".5rem 0" }}>No QR code yet</h4>
              <p className="mb-md">It contains no health data, only a signed, revocable link to your profile.</p>
              <button className="btn btn--primary btn--lg" disabled={busy} onClick={() => act(() => api("/qr", { method: "POST", body: {} }), "QR code created")}>✨ Generate my QR code</button>
            </div>
          ) : (
            <div className="qr-display">
              <div className="qr-display__code"><img src={live.dataUrl} alt="Emergency QR code" /></div>
              <p className="text-sm mt-md" style={{ color: live.status === "active" ? "var(--safe-green)" : "var(--emergency-red)", fontWeight: 600 }}>{live.status === "active" ? "✅ Active and ready to scan" : "🔒 Locked after suspicious activity"}</p>
              <p className="qr-display__url">{live.url}</p>
              {live.status === "locked" && <div className="card card--danger card--tight mt-md text-sm" style={{ color: "#fecaca" }}>This code was locked automatically after unusual scanning. If this was you, unlock it below.</div>}
              <div className="row mt-md" style={{ justifyContent: "center" }}>
                {live.status === "locked" && <button className="btn btn--success" disabled={busy} onClick={() => act(() => api(`/qr/${live.id}/unlock`, { method: "POST", body: {} }), "QR code unlocked")}>🔓 Unlock</button>}
                <button className="btn btn--ghost btn--sm" onClick={() => download(`/qr/${live.id}/image.png`, "veap-qr.png").catch((e) => toast(e.message, "error"))}>📥 Download PNG</button>
                <button className="btn btn--ghost btn--sm" onClick={() => window.print()}>🖨 Print wallet card</button>
                <button className="btn btn--ghost btn--sm" onClick={() => { navigator.clipboard?.writeText(live.url).then(() => toast("Link copied", "success"), () => toast("Could not copy", "error")); }}>🔗 Copy link</button>
                <a className="btn btn--primary btn--sm" href={live.url} target="_blank" rel="noopener noreferrer">🔍 Test scan</a>
              </div>
              {isLocal && <p className="text-xs text-muted mt-md">💡 This link points to a local address, so a phone camera can't open it. To scan with a phone, set <code>PUBLIC_URL</code> to an address your phone can reach.</p>}
            </div>
          )}
        </div>
        {live && (
          <div className="card card--tight row row--between">
            <div><b>Need a new code?</b><p className="text-xs text-muted">Lost your card? Revoke it right away; anyone holding it loses access instantly.</p></div>
            <div className="row"><button className="btn btn--ghost btn--sm" onClick={() => setConfirm("regen")}>🔄 Regenerate</button><button className="btn btn--danger btn--sm" onClick={() => setConfirm("revoke")}>⛔ Revoke</button></div>
          </div>
        )}
      </div>

      <div className="stack">
        {live && (
          <div className="card">
            <div className="card__title">🛡️ Scan risk</div>
            <div className="meter"><div style={{ width: `${Math.max(riskPct, 3)}%`, background: riskPct >= 60 ? "var(--emergency-red)" : riskPct >= 30 ? "var(--warning-amber)" : "var(--safe-green)" }} /></div>
            <p className="text-xs text-muted mt-sm">{riskPct >= 60 ? "High: unusual scanning detected." : riskPct >= 30 ? "Medium: a little unusual." : "Low: scanning looks normal."} A score of 85+ locks the code automatically.</p>
          </div>
        )}
        <div className="card">
          <div className="card__title">💡 Where to keep it</div>
          <ul className="stack text-sm" style={{ paddingLeft: "1.1rem", color: "var(--text-secondary)" }}>
            <li>Print the wallet card and keep it behind your ID.</li>
            <li>Set the PNG as your phone's lock-screen wallpaper.</li>
            <li>Stick a copy inside your helmet or on your bag.</li>
          </ul>
        </div>
        <div className="card">
          <div className="card__title">🕘 History</div>
          <ul className="timeline">{tokens.map((t) => (
            <li key={t.id}><span className={`timeline__dot timeline__dot--${t.status === "active" ? "green" : t.status === "locked" ? "red" : ""}`} /><div>{t.status === "active" ? "Active code" : t.status === "locked" ? "Locked code" : "Revoked code"}</div><span className="timeline__time">{fmtDate(t.createdAt)}</span></li>))}</ul>
        </div>
      </div>

      {live && (
        <div className="print-only" aria-hidden>
          <div className="wallet">
            <div className="wallet__side"><Logo size={64} /></div>
            <div className="wallet__body">
              <div><div style={{ fontWeight: 800, color: "#dc2626", fontSize: "11pt" }}>EMERGENCY MEDICAL ID</div><div style={{ fontSize: "8pt" }}>Scan for critical medical info</div></div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}><div style={{ fontSize: "9pt", fontWeight: 700 }}>{user?.name}</div><img src={live.dataUrl} alt="" /></div>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal open={confirm === "regen"} title="Regenerate QR code?" text="This revokes your current QR code and creates a new one. Old printed cards will stop working." confirmLabel="Regenerate" danger={false} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => api("/qr", { method: "POST", body: {} }), "New QR code created")} />
      <ConfirmModal open={confirm === "revoke"} title="Revoke QR code?" text="Anyone holding this code will immediately lose access, including live sessions. You can generate a new code afterwards." confirmLabel="Revoke now" busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => api(`/qr/${live.id}/revoke`, { method: "POST", body: {} }), "QR code revoked")} />
    </div>
  );
}
