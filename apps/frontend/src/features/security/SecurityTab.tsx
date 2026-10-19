import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAccessToken } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { deviceName, timeAgo } from "../../lib/util";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

export default function SecurityTab() {
  const { user, reload, logout } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [setup, setSetup] = useState<any>(null); const [code, setCode] = useState(""); const [recovery, setRecovery] = useState<string[] | null>(null);
  const [pw, setPw] = useState(""); const [dcode, setDcode] = useState("");
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [del, setDel] = useState(false); const [delPw, setDelPw] = useState(""); const [delCode, setDelCode] = useState(""); const [delErr, setDelErr] = useState("");

  const loadSessions = () => api("/auth/sessions").then((r) => setSessions(r.sessions)).catch((e) => toast(e.message, "error"));
  useEffect(() => { loadSessions(); }, []);
  const run = async (fn: () => Promise<void>) => { setErr(""); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); toast(e.message, "error"); } finally { setBusy(false); } };

  return (
    <div className="split">
      <div className="stack">
        <div className="card">
          <div className="card__title">🛡️ Two-factor authentication<span className="spacer" /><span className={`badge ${user?.mfaEnabled ? "badge--safe" : "badge--warn"}`}>{user?.mfaEnabled ? "On" : "Off"}</span></div>
          <p className="text-sm mb-md">Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password) every time you log in.</p>
          {!user?.mfaEnabled && !setup && <button className="btn btn--primary" disabled={busy} onClick={() => run(async () => setSetup(await api("/auth/mfa/setup", { method: "POST", body: {} })))}>Set up authenticator app</button>}
          {setup && !recovery && (
            <div className="text-center">
              <p className="text-sm mb-sm">1. Scan this with your authenticator app</p>
              <div className="qr-display__code" style={{ padding: 10 }}><img src={setup.qrDataUrl} alt="Authenticator QR code" width={180} /></div>
              <p className="text-xs text-muted mt-sm" style={{ wordBreak: "break-all" }}>Can't scan? Key: <code>{setup.secret}</code></p>
              <div className="form-group mt-md" style={{ textAlign: "left" }}><label className="form-label" htmlFor="mc">2. Enter the 6-digit code</label>
                <input id="mc" className="form-input" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
              <button className="btn btn--success btn--full" disabled={busy || code.length !== 6} onClick={() => run(async () => { const r = await api("/auth/mfa/enable", { body: { code } }); setRecovery(r.recoveryCodes); setSetup(null); setCode(""); await reload(); toast("Two-factor enabled", "success"); })}>Turn on 2FA</button>
            </div>
          )}
          {recovery && (
            <div className="card card--success">
              <b>Save your recovery codes</b>
              <p className="text-sm mb-sm">Each works once if you lose your phone. They won't be shown again.</p>
              <pre className="pre text-sm" style={{ background: "rgba(0,0,0,.3)", padding: ".7rem", borderRadius: 8 }}>{recovery.join("\n")}</pre>
              <div className="row mt-sm"><button className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(recovery.join("\n")).then(() => toast("Copied", "success"))}>📋 Copy</button><button className="btn btn--primary btn--sm" onClick={() => setRecovery(null)}>I've saved them</button></div>
            </div>
          )}
          {user?.mfaEnabled && !recovery && (
            <div>
              <div className="grid grid--2">
                <div className="form-group"><label className="form-label" htmlFor="dpw">Password</label><input id="dpw" className="form-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
                <div className="form-group"><label className="form-label" htmlFor="dc">Authenticator code</label><input id="dc" className="form-input" inputMode="numeric" value={dcode} onChange={(e) => setDcode(e.target.value)} /></div>
              </div>
              <button className="btn btn--ghost" disabled={busy || !pw || !dcode} onClick={() => run(async () => { await api("/auth/mfa/disable", { body: { password: pw, code: dcode } }); setPw(""); setDcode(""); await reload(); toast("Two-factor disabled", "warning"); })}>Turn off 2FA</button>
            </div>
          )}
          {err && <div className="form-error" role="alert">{err}</div>}
        </div>

        <div className="card card--danger">
          <div className="card__title">🗑 Danger zone</div>
          <p className="text-sm mb-md">Permanently delete your account, medical data, QR codes and history. This cannot be undone.</p>
          <button className="btn btn--danger btn--sm" onClick={() => { setDelErr(""); setDelPw(""); setDelCode(""); setDel(true); }}>Delete my account</button>
        </div>
      </div>

      <div className="card">
        <div className="card__title">💻 Signed-in devices</div>
        {!sessions ? <div className="skeleton" style={{ height: 80 }} /> : (
          <ul className="timeline">{sessions.map((s) => (
            <li key={s.id}>
              <span className={`timeline__dot ${s.current ? "timeline__dot--green" : ""}`} />
              <div><b style={{ color: "var(--text-primary)" }}>{deviceName(s.device)}</b>{s.current && <span className="badge badge--safe" style={{ marginLeft: 6 }}>This device</span>}
                <div className="text-xs text-muted">{s.ip} · active {timeAgo(s.last_used)}</div></div>
              {!s.current && <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} onClick={() => run(async () => { await api(`/auth/sessions/${s.id}`, { method: "DELETE" }); await loadSessions(); toast("Device signed out", "success"); })}>Sign out</button>}
            </li>))}</ul>)}
      </div>

      <Modal open={del} title="Delete your account?" danger onClose={() => setDel(false)}>
        <p className="modal__text">This permanently erases your profile, QR codes, alerts and audit history. Enter your password to confirm.</p>
        <div className="form-group"><label className="form-label" htmlFor="delpw">Password</label><input id="delpw" className="form-input" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></div>
        {user?.mfaEnabled && <div className="form-group"><label className="form-label" htmlFor="delcode">Authenticator code</label><input id="delcode" className="form-input" inputMode="numeric" value={delCode} onChange={(e) => setDelCode(e.target.value)} /></div>}
        {delErr && <div className="form-error" role="alert">{delErr}</div>}
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={() => setDel(false)}>Cancel</button>
          <button className="btn btn--danger" disabled={busy || !delPw} onClick={async () => {
            setBusy(true); setDelErr("");
            try { await api("/auth/account", { method: "DELETE", body: { password: delPw, ...(delCode ? { code: delCode } : {}) } }); nav("/"); setAccessToken(null); await logout(); toast("Your account was deleted", "info"); }
            catch (e: any) { setDelErr(e.message); } finally { setBusy(false); }
          }}>Delete forever</button>
        </div>
      </Modal>
    </div>
  );
}
