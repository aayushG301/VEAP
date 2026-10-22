import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ageFrom, loadTier1, saveTier1 } from "../lib/util";
import { Logo } from "../components/Logo";
import { AccessPill } from "../components/AccessPill";
import { SessionBar } from "../components/SessionBar";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import AssistantPanel from "../features/emergency/AssistantPanel";
import VerifyPanel from "../features/emergency/VerifyPanel";
import OverridePanel from "../features/emergency/OverridePanel";
import { Watermark } from "../components/Watermark";
import { Contacts, RecordList, isEmpty, tel } from "../features/emergency/RecordView";

const getGeo = (): Promise<string> => new Promise((res) => {
  if (!navigator.geolocation) return res("");
  navigator.geolocation.getCurrentPosition((p) => res(`?lat=${p.coords.latitude.toFixed(4)}&lng=${p.coords.longitude.toFixed(4)}`), () => res(""), { timeout: 1500, maximumAge: 300000 });
});
type State = "loading" | "ok" | "locked" | "revoked" | "notfound" | "limited" | "error";
interface Session { token: string; tier: number; startedAt: number; expiresAt: number }

export default function Emergency() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<State>("loading");
  const [t1, setT1] = useState<any>(null); const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [retry, setRetry] = useState(0); const [reload, setReload] = useState(0);
  const [session, setSession] = useState<Session | null>(null); const [record, setRecord] = useState<any>(null);
  const [expired, setExpired] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); const [reportText, setReportText] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const geo = await getGeo();
        const r = await api(`/emergency/${token}${geo}`, { auth: false });
        if (!alive) return; setT1(r); setCachedAt(null); setState("ok"); saveTier1(token, r);
      } catch (e: any) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 423) return setState("locked");
        if (e instanceof ApiError && e.status === 410) return setState("revoked");
        if (e instanceof ApiError && e.status === 404) return setState("notfound");
        if (e instanceof ApiError && e.status === 429) { setRetry(e.retryAfter ?? 60); return setState("limited"); }
        const c = loadTier1(token); // no network (or a 503 from the service worker): show the last saved Level 1 copy
        if (c) { setT1(c.data); setCachedAt(c.at); setState("ok"); } else setState("error");
      }
    })();
    return () => { alive = false; };
  }, [token, reload]);

  useEffect(() => { if (state !== "limited" || retry <= 0) return; const id = setTimeout(() => (retry <= 1 ? setReload((n) => n + 1) : setRetry(retry - 1)), 1000); return () => clearTimeout(id); }, [state, retry]);

  const fetchRecord = useCallback(async (s: string) => {
    try { setRecord(await api(`/emergency/${token}/record`, { auth: false, session: s })); }
    catch (e: any) { if (e.status === 401) { setSession(null); setRecord(null); setExpired(true); } else setErr(e.message); }
  }, [token]);
  useEffect(() => { if (session) fetchRecord(session.token); }, [session?.token]);

  const grant = (g: { sessionToken: string; tier: number; expiresAt: number }) => { setExpired(false); setErr(""); setSession({ token: g.sessionToken, tier: g.tier, startedAt: Date.now(), expiresAt: g.expiresAt }); };
  const endSession = async () => { if (!session) return; try { await api("/access/end", { auth: false, session: session.token, body: {} }); } catch { /* already gone */ } setSession(null); setRecord(null); toast("Session ended", "info"); };
  const extend = async () => { if (!session) return; try { const r = await api("/access/extend", { auth: false, session: session.token, body: {} }); setSession({ ...session, expiresAt: r.expiresAt }); toast("Session extended by 5 minutes", "success"); } catch (e: any) { toast(e.message, "warning"); } };
  const overrideGranted = (g: { sessionToken: string; tier: number; expiresAt: number }) => { setOverrideOpen(false); grant(g); toast("Level 3 unlocked. Your identity was logged and the patient was alerted.", "warning"); };
  const professional = async () => { setBusy(true); try { grant(await api("/access/credential", { body: { token } })); toast("Verified professional access granted", "success"); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); } };
  const report = async () => {
    setBusy(true);
    try { await api(`/emergency/${token}/report`, { auth: false, body: reportText ? { reason: reportText } : {} }); setReportOpen(false); setReportText(""); toast("Thank you. The owner has been notified.", "success"); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };

  /* ---------- non-happy-path screens ---------- */
  if (state === "loading") return <div className="container"><div className="center-state"><Logo size={72} className="hero__icon" /><p className="mt-md">Loading emergency profile...</p></div></div>;
  if (state !== "ok") {
    const m: Record<string, [string, string, string]> = {
      locked: ["🔒", "Temporarily locked", "This QR code was locked because of unusual scanning activity. In an emergency, call your local emergency number now."],
      revoked: ["⛔", "QR code revoked", "The owner revoked this QR code. If this is an emergency, call your local emergency number."],
      notfound: ["⚠️", "Invalid QR code", "This emergency profile could not be found. The QR code may be invalid or damaged."],
      limited: ["🚫", "Too many requests", `Suspicious activity was detected from this connection. Retrying automatically in ${retry}s.`],
      error: ["📡", "Can't load the profile", "No connection and no saved copy. If this is an emergency, call your local emergency number."],
    };
    const [icon, title, text] = m[state];
    return (
      <div className="container">
        <div className="error-state" role="alert">
          <div className="error-state__icon">{icon}</div><h2 className="error-state__title">{title}</h2><p>{text}</p>
          <div className="row" style={{ justifyContent: "center" }}><a className="btn btn--danger btn--lg" href="tel:112">📞 Call 112</a><a className="btn btn--danger btn--lg" href="tel:108">📞 Call 108</a></div>
          {state === "limited" && <button className="btn btn--ghost btn--sm mt-lg" onClick={() => setReportOpen(true)}>🚩 Report misuse</button>}
          {(state === "error" || state === "limited") && <button className="btn btn--ghost btn--sm mt-lg" style={{ marginLeft: 8 }} onClick={() => setReload((n) => n + 1)}>Try again</button>}
          <p className="mt-lg"><Link to="/">← Go to VEAP home</Link></p>
        </div>
        <Modal open={reportOpen} title="🚩 Report misuse" onClose={() => setReportOpen(false)}>
          <p className="modal__text">Tell the owner something looks wrong with this QR code.</p>
          <textarea className="form-textarea" aria-label="What happened?" maxLength={300} placeholder="What happened? (optional)" value={reportText} onChange={(e) => setReportText(e.target.value)} />
          <div className="modal__actions"><button className="btn btn--ghost" onClick={() => setReportOpen(false)}>Cancel</button><button className="btn btn--danger" disabled={busy} onClick={report}>Send report</button></div>
        </Modal>
      </div>
    );
  }

  /* ---------- main emergency view ---------- */
  const d = t1.data || {};
  const primary = d.emergencyContacts?.[0];
  const age = ageFrom(d.dateOfBirth);
  const tier = session?.tier ?? 1;
  const lvl1Keys = ["fullName", "bloodGroup", "allergies", "conditions", "emergencyInstructions", "emergencyContacts"];
  const extraPublic = Object.keys(d).filter((k) => !lvl1Keys.includes(k) && !isEmpty(d[k]));
  const isPro = user?.role === "medical_professional" && user.responderStatus === "approved";
  const verifiedKeys = record ? Object.keys(record.data).filter((k) => !(k in d)) : [];

  return (
    <div className="container container--mid">
      {tier === 3 && record?.responder && <Watermark text={`${record.responder.name} · ${record.responder.staffId} · ${record.responder.hospitalName || "VEAP"} · ${new Date().toLocaleDateString()}`} />}
      {session && <SessionBar startedAt={session.startedAt} expiresAt={session.expiresAt} onExpire={() => { setSession(null); setRecord(null); setExpired(true); }} />}
      {cachedAt && <div className="card card--warning card--tight mt-md text-sm" role="status">📡 Offline: showing the information saved on {new Date(cachedAt).toLocaleString()}.</div>}
      {expired && (
        <div className="card card--warning mt-md center-state" role="alert" style={{ padding: "var(--space-lg)" }}>
          <div style={{ fontSize: 40 }}>⏰</div><h4>Session expired</h4><p className="text-sm mb-md">Your access timed out for the patient's security.</p>
          <button className="btn btn--primary" onClick={() => setExpired(false)}>🔄 Verify again</button>
        </div>)}

      {/* ===== LEVEL 1 ===== */}
      <div className="animate-in" style={{ paddingTop: "var(--space-lg)" }}>
        <AccessPill tier={1} />
        <h2 style={{ marginBottom: ".4rem" }}>{d.fullName || "Unknown patient"}{age !== null && <span className="text-muted" style={{ fontSize: "var(--font-lg)", fontWeight: 500 }}> · {age} yrs</span>}</h2>
        <div className="row mb-lg" style={{ gap: ".6rem" }}>
          {d.bloodGroup && d.bloodGroup !== "Unknown" && <span className="badge badge--blood" aria-label={`Blood group ${d.bloodGroup}`}>🩸 {d.bloodGroup}</span>}
          {(d.conditions || []).map((c: string) => <span key={c} className="badge badge--condition">{c}</span>)}
          {d.organDonor && <span className="badge badge--safe">Organ donor</span>}
        </div>

        {d.emergencyInstructions && <div className="card card--danger mb-md"><h4 style={{ color: "var(--emergency-red)", marginBottom: ".4rem" }}>⚠️ Emergency instructions</h4><p style={{ color: "var(--text-primary)" }} className="pre">{d.emergencyInstructions}</p></div>}
        {(d.allergies || []).length > 0 && <div className="card card--warning mb-md"><h4 style={{ color: "var(--warning-amber)", marginBottom: ".4rem" }}>🚨 Allergies</h4><div className="tags">{d.allergies.map((a: string) => <span key={a} className="badge badge--allergy">{a}</span>)}</div></div>}

        {primary ? (
          <div className="mb-md">
            <a className="btn btn--danger btn--lg btn--full pulse-emergency" href={tel(primary.phone)}>📞 Call {primary.name}</a>
            <p className="text-xs text-center text-muted mt-sm">{[primary.relationship, primary.phone].filter(Boolean).join(" · ")}</p>
          </div>
        ) : <p className="text-sm text-muted mb-md">The owner has not shared an emergency contact at this level.</p>}
        {(d.emergencyContacts || []).length > 1 && <Contacts list={d.emergencyContacts.slice(1)} />}
        <div className="row mb-md" style={{ justifyContent: "center" }}>
          <span className="text-sm">Emergency services:</span><a className="btn btn--ghost btn--sm" href="tel:112">📞 112</a><a className="btn btn--ghost btn--sm" href="tel:108">📞 108</a>
        </div>
        {extraPublic.length > 0 && <div className="mb-md"><RecordList data={d} skip={lvl1Keys} /></div>}

        <AssistantPanel token={token} session={session?.token ?? null} />
      </div>

      {/* ===== LEVEL 2 ===== */}
      <div className="mt-xl">
        <AccessPill tier={2} />
        {!session && <VerifyPanel token={token} onGranted={grant} />}
        {session && (
          <div className="card card--success card--tight mb-md row row--between" role="status">
            <span className="text-sm">✅ Verified access <b>Level {tier}</b></span>
            <span className="row"><button className="btn btn--ghost btn--sm" disabled={!!record?.extended} onClick={extend}>+5 min</button><button className="btn btn--ghost btn--sm" onClick={endSession}>End session</button></span>
          </div>
        )}
        {err && <div className="form-error" role="alert">{err}</div>}
        {record && (
          <div className="animate-in">
            {(record.warnings || []).map((w: any, i: number) => (
              <div key={i} className={`card ${w.level === "high" ? "card--danger" : "card--warning"} card--tight mb-sm`} role="alert">
                <span className={`badge ${w.level === "high" ? "badge--danger" : "badge--warn"}`}>{w.level === "high" ? "⚠️ High risk" : "Caution"}</span> <b style={{ color: "var(--text-primary)" }}>{w.message}</b>
              </div>))}
            <div className="card mt-md">
              <h4 className="card__title">{tier === 3 ? "📄 Complete medical profile" : "📋 Verified medical information"}</h4>
              <RecordList data={record.data} skip={tier === 3 ? lvl1Keys.filter((k) => k in d) : Object.keys(d)} />
              {verifiedKeys.length === 0 && tier === 2 && <p className="text-xs text-muted mt-sm">Nothing more is shared at Level 2 for this patient.</p>}
            </div>
          </div>
        )}
      </div>

      {/* ===== LEVEL 3 ===== */}
      <div className="mt-xl">
        <AccessPill tier={3} />
        {tier < 3 && (
          <div className="card card--danger">
            <h4 className="card__title">🔴 Emergency override</h4>
            <p className="text-sm mb-md">For hospital staff in a genuine emergency. You sign in with your hospital and council ID, the patient's emergency contact can deny the request, and everything is permanently logged under your name.</p>
            {!session && <p className="text-xs text-muted mb-sm">Verify at Level 2 first so the override is traceable to your phone.</p>}
            <button className="btn btn--danger btn--full" disabled={!session} onClick={() => setOverrideOpen(true)}>⚡ Emergency override: hospital staff sign-in</button>
            {isPro && <button className="btn btn--primary btn--full mt-sm" disabled={busy} onClick={professional}>🩺 Verified professional access</button>}
          </div>
        )}
        {tier === 3 && (
          <div className="card card--success card--tight text-sm" role="status">
            ✅ Level 3 is unlocked. All information is shown above.
            {record?.responder && <div className="text-xs mt-sm" style={{ color: "var(--text-primary)" }}>🔒 Accessed by <b>{record.responder.name}</b>, {record.responder.designation}{record.responder.hospitalName && `, ${record.responder.hospitalName}`} · ID {record.responder.staffId}. Logged and the patient was notified.</div>}
            {record?.profileUpdatedAt && <div className="text-xs text-muted mt-sm">Profile last updated {new Date(record.profileUpdatedAt).toLocaleString()}</div>}
          </div>)}
      </div>

      <div className="text-center mt-xl"><button className="btn btn--ghost btn--sm" onClick={() => setReportOpen(true)}>🚩 Report misuse</button></div>

      <Modal open={overrideOpen && !!session && tier < 3} title="⚠️ Emergency override: hospital staff" danger onClose={() => setOverrideOpen(false)}>
        {session && <OverridePanel token={token} session={session.token} demo={t1?.demo ?? null} onGranted={overrideGranted} onCancel={() => setOverrideOpen(false)} onSessionLost={() => { setOverrideOpen(false); setSession(null); setRecord(null); setExpired(true); }} />}
      </Modal>
      <Modal open={reportOpen} title="🚩 Report misuse" onClose={() => setReportOpen(false)}>
        <p className="modal__text">Tell the owner something looks wrong with this QR code or how it is being used.</p>
        <textarea className="form-textarea" aria-label="What happened?" maxLength={300} placeholder="What happened? (optional)" value={reportText} onChange={(e) => setReportText(e.target.value)} />
        <div className="modal__actions"><button className="btn btn--ghost" onClick={() => setReportOpen(false)}>Cancel</button><button className="btn btn--danger" disabled={busy} onClick={report}>Send report</button></div>
      </Modal>
    </div>
  );
}
