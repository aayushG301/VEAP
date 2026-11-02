import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

interface Granted { sessionToken: string; tier: number; expiresAt: number }
interface Demo { note: string; valid: { hospitalId: string; staffId: string; pin: string; name: string }[]; rejected: { label: string; hospitalId: string; staffId: string; pin: string }[] }
interface Pending { requestId: string; autoGrantAt: number; delaySec: number; contactNotified: boolean; responder: { name: string; designation: string; hospital: string } }

/**
 * Level 3: hospital staff must authenticate (hospital ID + council/staff ID + PIN, checked against the registry), give a reason,
 * and then wait while the patient's emergency contact may deny. With no reply the access is granted automatically.
 */
export default function OverridePanel({ token, session, demo, onGranted, onCancel, onSessionLost }: { token: string; session: string; demo: Demo | null; onGranted: (g: Granted) => void; onCancel: () => void; onSessionLost: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ hospitalId: "", staffId: "", pin: "", reason: "" });
  const [req, setReq] = useState<Pending | null>(null);
  const [left, setLeft] = useState(0);
  const [phase, setPhase] = useState<"form" | "waiting" | "denied">("form");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api("/access/break-glass", { auth: false, session, body: { token, hospitalId: f.hospitalId.trim(), staffId: f.staffId.trim(), pin: f.pin, reason: f.reason.trim() } });
      setReq(r); setLeft(Math.max(0, Math.ceil((r.autoGrantAt - Date.now()) / 1000))); setPhase("waiting"); setF({ ...f, pin: "" });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401 && e.code !== "verification_failed") return onSessionLost();
      setErr(e.message); setF((x) => ({ ...x, pin: "" }));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (phase !== "waiting" || !req) return;
    const tick = setInterval(() => setLeft(Math.max(0, Math.ceil((req.autoGrantAt - Date.now()) / 1000))), 500);
    const poll = async () => {
      try {
        const r = await api(`/access/break-glass/${req.requestId}`, { auth: false, session });
        if (!alive.current) return;
        if (r.status === "denied") setPhase("denied");
        else if (r.sessionToken) onGranted({ sessionToken: r.sessionToken, tier: 3, expiresAt: r.expiresAt });
      } catch (e: any) { if (!alive.current) return; if (e instanceof ApiError && e.status === 401) onSessionLost(); else if (e instanceof ApiError && e.status === 410) { setErr(e.message); setPhase("form"); } }
    };
    const id = setInterval(poll, 3000); void poll();
    return () => { clearInterval(tick); clearInterval(id); };
  }, [phase, req?.requestId]);

  if (phase === "denied") return (
    <div role="alert" className="center-state" style={{ padding: "var(--space-md)" }}>
      <div style={{ fontSize: 40 }}>🚫</div><h4>{t("breakglass.deniedTitle")}</h4>
      <p className="text-sm mb-md">{t("breakglass.deniedText")}</p>
      <button className="btn btn--ghost" onClick={onCancel}>{t("breakglass.close")}</button>
    </div>);

  if (phase === "waiting" && req) {
    const pct = Math.min(100, Math.round(((req.delaySec - left) / Math.max(1, req.delaySec)) * 100));
    return (
      <div role="status" aria-live="polite">
        <div className="card card--success card--tight mb-md text-sm">✅ {t("breakglass.verified")} <b style={{ color: "var(--text-primary)" }}>{req.responder.name}</b>, {req.responder.designation}, {req.responder.hospital}</div>
        <p className="text-sm mb-sm">{req.contactNotified ? t("breakglass.notified") : t("breakglass.notNotified")} {t("breakglass.waitingNotice1")}</p>
        <p className="text-sm mb-sm">{t("breakglass.waitingNotice2")}</p>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.1)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--emergency-red)", transition: "width .5s linear" }} /></div>
        <p className="text-center mt-sm" style={{ fontSize: "var(--font-xl)", fontVariantNumeric: "tabular-nums" }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="modal__actions"><button className="btn btn--ghost" onClick={onCancel}>{t("breakglass.stopWaiting")}</button></div>
      </div>);
  }

  const use = (h: string, s: string, p: string) => setF({ ...f, hospitalId: h, staffId: s, pin: p });
  return (
    <form onSubmit={submit}>
      <p className="modal__text">{t("breakglass.disclaimer")}</p>
      <div className="grid grid--2">
        <div className="form-group"><label className="form-label" htmlFor="hid">{t("breakglass.hospitalId")}</label><input id="hid" className="form-input" required autoComplete="off" placeholder="HSP-XXX-0000" value={f.hospitalId} onChange={(e) => setF({ ...f, hospitalId: e.target.value })} /></div>
        <div className="form-group"><label className="form-label" htmlFor="sid">{t("breakglass.staffId")}</label><input id="sid" className="form-input" required autoComplete="off" placeholder="NMC-XX-00000" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} /></div>
      </div>
      <div className="form-group"><label className="form-label" htmlFor="pin">{t("breakglass.pin")}</label><input id="pin" className="form-input" type="password" required inputMode="numeric" autoComplete="off" maxLength={6} placeholder="••••••" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} /></div>
      <div className="form-group"><label className="form-label" htmlFor="reason">{t("breakglass.reason")}</label>
        <textarea id="reason" className="form-textarea" maxLength={500} placeholder={t("breakglass.reasonPlaceholder")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <div className="form-hint">{t("breakglass.reasonHint", { len: f.reason.trim().length })}</div></div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {demo && (
        <details className="mb-md text-xs">
          <summary style={{ cursor: "pointer" }}>🧪 Demo only: simulated hospital registry</summary>
          <p className="text-muted mt-sm">{demo.note}</p>
          {demo.valid.map((d) => <div key={d.staffId} className="row mt-sm"><span>✅ {d.name}: {d.hospitalId} · {d.staffId} · PIN {d.pin}</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => use(d.hospitalId, d.staffId, d.pin)}>Fill</button></div>)}
          {demo.rejected.map((d) => <div key={d.staffId} className="row mt-sm"><span>🚫 {d.label}: {d.staffId}</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => use(d.hospitalId, d.staffId, d.pin)}>Fill (will be refused)</button></div>)}
        </details>)}
      <div className="modal__actions"><button type="button" className="btn btn--ghost" onClick={onCancel}>{t("breakglass.cancel")}</button>
        <button className="btn btn--danger" disabled={busy || !f.hospitalId.trim() || !f.staffId.trim() || f.pin.length !== 6 || f.reason.trim().length < 15}>{busy ? <span className="spinner" /> : t("breakglass.verifyBtn")}</button></div>
    </form>
  );
}
