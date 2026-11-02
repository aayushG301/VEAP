import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ageFrom, loadTier1, saveTier1 } from "../lib/util";
import { isConnectivityFailure } from "../lib/offline";
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
import { useI18n, LanguagePicker } from "../lib/i18n";

const getGeo = (): Promise<string> => new Promise((res) => {
  if (!navigator.geolocation) return res("");
  navigator.geolocation.getCurrentPosition((p) => res(`?lat=${p.coords.latitude.toFixed(4)}&lng=${p.coords.longitude.toFixed(4)}`), () => res(""), { timeout: 1500, maximumAge: 300000 });
});
type State = "loading" | "ok" | "locked" | "revoked" | "notfound" | "limited" | "offline" | "error";
interface Session { token: string; tier: number; startedAt: number; expiresAt: number }

export default function Emergency() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [state, setState] = useState<State>("loading");
  const [t1, setT1] = useState<any>(null); const [cachedAt, setCachedAt] = useState<number | null>(null);
  /** "live" = fetched and validated against the backend on this load; "cached" = a saved offline copy. */
  const [source, setSource] = useState<"live" | "cached">("live");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [retry, setRetry] = useState(0); const [reload, setReload] = useState(0);
  const [session, setSession] = useState<Session | null>(null); const [record, setRecord] = useState<any>(null);
  const [expired, setExpired] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); const [reportText, setReportText] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // Whenever the connection comes back, re-check with the backend: a cached copy must never
  // be trusted as still valid, and a QR revoked while we were offline must now show as revoked.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (wasOffline.current) { wasOffline.current = false; setReload((n) => n + 1); }
  }, [online]);
  const showingCached = useRef(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const geo = await getGeo();
        const r = await api(`/emergency/${token}${geo}`, { auth: false });
        if (!alive) return;
        setT1(r); setCachedAt(null); setUpdatedAt(r?.profileUpdatedAt ?? null); setSource("live"); setState("ok");
        saveTier1(token, r, r?.profileUpdatedAt ?? null);
        if (showingCached.current) { showingCached.current = false; toast(t("emergency.backOnline"), "success"); }
      } catch (e: any) {
        if (!alive) return;
        const status = e instanceof ApiError ? e.status : null;
        if (status === 423) return setState("locked");
        if (status === 410) return setState("revoked");
        if (status === 404) return setState("notfound");
        if (status === 429) { setRetry(e.retryAfter ?? 60); return setState("limited"); }
        // A connectivity problem (no network, or the service worker's offline marker): fall back to
        // the last saved Tier 1 copy. Revoked/locked/unknown/rate-limited answers above are real
        // responses from the backend and are never masked by cached data.
        if (isConnectivityFailure(e, navigator.onLine)) {
          const c = loadTier1(token);
          // Prefer this device's copy; fall back to the service worker's saved copy if local storage was cleared.
          const saved = c?.data ?? (e instanceof ApiError ? e.extra?.cached : null);
          if (saved) {
            setT1(saved); setCachedAt(c?.at ?? null);
            setUpdatedAt(c?.updatedAt ?? saved?.profileUpdatedAt ?? null);
            setSource("cached"); showingCached.current = true; setState("ok"); return;
          }
          return setState("offline");
        }
        setState("error");
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
  const endSession = async () => { if (!session) return; try { await api("/access/end", { auth: false, session: session.token, body: {} }); } catch { /* already gone */ } setSession(null); setRecord(null); toast(t("emergency.sessionEnded"), "info"); };
  const extend = async () => { if (!session) return; try { const r = await api("/access/extend", { auth: false, session: session.token, body: {} }); setSession({ ...session, expiresAt: r.expiresAt }); toast(t("emergency.extendedSuccess"), "success"); } catch (e: any) { toast(e.message, "warning"); } };
  const overrideGranted = (g: { sessionToken: string; tier: number; expiresAt: number }) => { setOverrideOpen(false); grant(g); toast(t("emergency.overrideUnlocked"), "warning"); };
  const professional = async () => { setBusy(true); try { grant(await api("/access/credential", { body: { token } })); toast(t("emergency.proGranted"), "success"); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); } };
  const report = async () => {
    setBusy(true);
    try { await api(`/emergency/${token}/report`, { auth: false, body: reportText ? { reason: reportText } : {} }); setReportOpen(false); setReportText(""); toast(t("emergency.misuseSuccess"), "success"); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };

  /* ---------- non-happy-path screens ---------- */
  if (state === "loading") return <div className="container"><div className="center-state"><Logo size={72} className="hero__icon" /><p className="mt-md">{t("emergency.loading")}</p></div></div>;
  if (state !== "ok") {
    const m: Record<string, [string, string, string]> = {
      locked: ["🔒", t("state.locked.title"), t("state.locked.desc")],
      revoked: ["⛔", t("state.revoked.title"), t("state.revoked.desc")],
      notfound: ["⚠️", t("state.notfound.title"), t("state.notfound.desc")],
      limited: ["🚫", t("state.limited.title"), t("state.limited.desc", { retry })],
      offline: ["📡", t("state.offline.title"), t("state.offline.desc")],
      error: ["📡", t("state.error.title"), t("state.error.desc")],
    };
    const [icon, title, text] = m[state];
    return (
      <div className="container">
        <div className="row row--between mt-md mb-md">
          <div />
          <LanguagePicker />
        </div>
        <div className="error-state" role="alert">
          <div className="error-state__icon">{icon}</div><h2 className="error-state__title">{title}</h2><p>{text}</p>
          <div className="row" style={{ justifyContent: "center" }}><a className="btn btn--danger btn--lg" href="tel:112">{t("emergency.call112")}</a><a className="btn btn--danger btn--lg" href="tel:108">{t("emergency.call108")}</a></div>
          {state === "limited" && <button className="btn btn--ghost btn--sm mt-lg" onClick={() => setReportOpen(true)}>{t("emergency.reportMisuse")}</button>}
          {(state === "error" || state === "offline" || state === "limited") && <button className="btn btn--ghost btn--sm mt-lg" style={{ marginLeft: 8 }} onClick={() => setReload((n) => n + 1)}>{t("state.tryAgain")}</button>}
          <p className="mt-lg"><Link to="/">{t("state.goHome")}</Link></p>
        </div>
        <Modal open={reportOpen} title={t("emergency.misuseTitle")} onClose={() => setReportOpen(false)}>
          <p className="modal__text">{t("emergency.misuseDesc")}</p>
          <textarea className="form-textarea" aria-label="What happened?" maxLength={300} placeholder={t("emergency.misusePlaceholder")} value={reportText} onChange={(e) => setReportText(e.target.value)} />
          <div className="modal__actions"><button className="btn btn--ghost" onClick={() => setReportOpen(false)}>{t("emergency.misuseCancel")}</button><button className="btn btn--danger" disabled={busy} onClick={report}>{t("emergency.misuseSend")}</button></div>
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
      <div className="row row--between mt-sm mb-md">
        <div />
        <LanguagePicker />
      </div>
      {tier === 3 && record?.responder && <Watermark lines={[
        `${record.responder.name} · ID ${record.responder.staffId}`,
        [record.responder.designation, record.responder.hospitalName].filter(Boolean).join(" · "),
        `VEAP LEVEL 3 · ${new Date().toLocaleString()}`,
      ]} />}
      {session && <SessionBar startedAt={session.startedAt} expiresAt={session.expiresAt} onExpire={() => { setSession(null); setRecord(null); setExpired(true); }} />}
      {source === "cached" && (
        <div className="card card--warning mt-md text-sm" role="status" data-testid="offline-banner">
          <b>📡 {t("emergency.offlineTitle")}</b>
          <ul className="mt-sm" style={{ paddingLeft: "1.1rem" }}>
            {updatedAt && <li>{t("emergency.offlineUpdated", { time: new Date(updatedAt).toLocaleString() })}</li>}
            {cachedAt && <li>{t("emergency.offlineRetrieved", { time: new Date(cachedAt).toLocaleString() })}</li>}
          </ul>
          <p className="text-xs mt-sm">{t("emergency.offlineWarning")}</p>
        </div>
      )}
      {expired && (
        <div className="card card--warning mt-md center-state" role="alert" style={{ padding: "var(--space-lg)" }}>
          <div style={{ fontSize: 40 }}>⏰</div><h4>{t("emergency.sessionExpired")}</h4><p className="text-sm mb-md">{t("emergency.sessionExpiredDesc")}</p>
          <button className="btn btn--primary" onClick={() => setExpired(false)}>{t("emergency.verifyAgain")}</button>
        </div>)}

      {/* ===== LEVEL 1 ===== */}
      <div className="animate-in" style={{ paddingTop: "var(--space-lg)" }}>
        <AccessPill tier={1} stale={source === "cached"} />
        <h2 style={{ marginBottom: ".4rem" }}>{d.fullName || t("emergency.unknown")}{age !== null && <span className="text-muted" style={{ fontSize: "var(--font-lg)", fontWeight: 500 }}> · {age} {t("emergency.yrs")}</span>}</h2>
        <div className="row mb-lg" style={{ gap: ".6rem" }}>
          {d.bloodGroup && d.bloodGroup !== "Unknown" && <span className="badge badge--blood" aria-label={`Blood group ${d.bloodGroup}`}>🩸 {d.bloodGroup}</span>}
          {(d.conditions || []).map((c: string) => <span key={c} className="badge badge--condition">{c}</span>)}
          {d.organDonor && <span className="badge badge--safe">{t("emergency.organDonor")}</span>}
        </div>

        {d.emergencyInstructions && <div className="card card--danger mb-md"><h4 style={{ color: "var(--emergency-red)", marginBottom: ".4rem" }}>{t("emergency.instructions")}</h4><p style={{ color: "var(--text-primary)" }} className="pre">{d.emergencyInstructions}</p></div>}
        {(d.allergies || []).length > 0 && <div className="card card--warning mb-md"><h4 style={{ color: "var(--warning-amber)", marginBottom: ".4rem" }}>{t("emergency.allergies")}</h4><div className="tags">{d.allergies.map((a: string) => <span key={a} className="badge badge--allergy">{a}</span>)}</div></div>}

        {primary ? (
          <div className="mb-md">
            <a className="btn btn--danger btn--lg btn--full pulse-emergency" href={tel(primary.phone)}>{t("emergency.callContact", { name: primary.name })}</a>
            <p className="text-xs text-center text-muted mt-sm">{[primary.relationship, primary.phone].filter(Boolean).join(" · ")}</p>
          </div>
        ) : <p className="text-sm text-muted mb-md">{t("emergency.noContact")}</p>}
        {(d.emergencyContacts || []).length > 1 && <Contacts list={d.emergencyContacts.slice(1)} />}
        <div className="row mb-md" style={{ justifyContent: "center" }}>
          <span className="text-sm">{t("emergency.services")}</span><a className="btn btn--ghost btn--sm" href="tel:112">{t("emergency.call112")}</a><a className="btn btn--ghost btn--sm" href="tel:108">{t("emergency.call108")}</a>
        </div>
        {extraPublic.length > 0 && <div className="mb-md"><RecordList data={d} skip={lvl1Keys} /></div>}

        <AssistantPanel token={token} session={session?.token ?? null} />
      </div>

      {/* ===== LEVEL 2 ===== */}
      <div className="mt-xl">
        <AccessPill tier={2} />
        {!session && <VerifyPanel token={token} onGranted={grant} />}
        {!session && source === "cached" && <p className="text-xs text-muted mt-sm" role="note">{t("emergency.offlineTier2Note")}</p>}
        {session && (
          <div className="card card--success card--tight mb-md row row--between" role="status">
            <span className="text-sm">{t("emergency.verifiedLevel", { tier })}</span>
            <span className="row"><button className="btn btn--ghost btn--sm" disabled={!!record?.extended} onClick={extend}>{t("emergency.extend5")}</button><button className="btn btn--ghost btn--sm" onClick={endSession}>{t("emergency.endSession")}</button></span>
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
              <h4 className="card__title">{tier === 3 ? t("emergency.completeProfile") : t("emergency.verifiedInfo")}</h4>
              <RecordList data={record.data} skip={tier === 3 ? lvl1Keys.filter((k) => k in d) : Object.keys(d)} />
              {verifiedKeys.length === 0 && tier === 2 && <p className="text-xs text-muted mt-sm">{t("emergency.nothingMoreTier2")}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ===== LEVEL 3 ===== */}
      <div className="mt-xl">
        <AccessPill tier={3} />
        {tier < 3 && (
          <div className="card card--danger">
            <h4 className="card__title">{t("override.title")}</h4>
            <p className="text-sm mb-md">{t("override.desc")}</p>
            {!session && <p className="text-xs text-muted mb-sm">{t("override.verifyFirst")}</p>}
            <button className="btn btn--danger btn--full" disabled={!session} onClick={() => setOverrideOpen(true)}>{t("override.btnStaff")}</button>
            {isPro && <button className="btn btn--primary btn--full mt-sm" disabled={busy} onClick={professional}>{t("override.btnPro")}</button>}
          </div>
        )}
        {tier === 3 && (
          <div className="card card--success card--tight text-sm" role="status">
            {t("override.unlockedMsg")}
            {record?.responder && <div className="text-xs mt-sm" style={{ color: "var(--text-primary)" }}>🔒 Accessed by <b>{record.responder.name}</b>, {record.responder.designation}{record.responder.hospitalName && `, ${record.responder.hospitalName}`} · ID {record.responder.staffId}. Logged and the patient was notified.</div>}
            {record?.profileUpdatedAt && <div className="text-xs text-muted mt-sm">Profile last updated {new Date(record.profileUpdatedAt).toLocaleString()}</div>}
          </div>)}
      </div>

      <div className="text-center mt-xl"><button className="btn btn--ghost btn--sm" onClick={() => setReportOpen(true)}>{t("emergency.reportMisuse")}</button></div>

      <Modal open={overrideOpen && !!session && tier < 3} title={t("override.title")} danger onClose={() => setOverrideOpen(false)}>
        {session && <OverridePanel token={token} session={session.token} demo={t1?.demo ?? null} onGranted={overrideGranted} onCancel={() => setOverrideOpen(false)} onSessionLost={() => { setOverrideOpen(false); setSession(null); setRecord(null); setExpired(true); }} />}
      </Modal>
      <Modal open={reportOpen} title={t("emergency.misuseTitle")} onClose={() => setReportOpen(false)}>
        <p className="modal__text">{t("emergency.misuseDesc")}</p>
        <textarea className="form-textarea" aria-label="What happened?" maxLength={300} placeholder={t("emergency.misusePlaceholder")} value={reportText} onChange={(e) => setReportText(e.target.value)} />
        <div className="modal__actions"><button className="btn btn--ghost" onClick={() => setReportOpen(false)}>{t("emergency.misuseCancel")}</button><button className="btn btn--danger" disabled={busy} onClick={report}>{t("emergency.misuseSend")}</button></div>
      </Modal>
    </div>
  );
}