import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate, timeAgo } from "../../lib/util";
import { useToast } from "../../components/Toast";
import { useI18n } from "../../lib/i18n";

const EVENT_COLOR: Record<string, string> = {
  scan: "blue", otp_requested: "amber", otp_failed: "red",
  tier2_granted: "amber", break_glass: "red", tier3_credential: "amber",
  record_view: "blue", session_extended: "amber", session_ended: "green",
  token_created: "green", token_revoked: "red", token_locked: "red", token_unlocked: "green",
  profile_updated: "green", visibility_updated: "green", login: "", login_failed: "red", account_locked: "red",
  mfa_enabled: "green", mfa_disabled: "amber", session_revoked: "amber", refresh_reuse_detected: "red",
  assistant_used: "blue", misuse_reported: "amber", otp_delivery_failed: "red", recovery_code_used: "amber",
  break_glass_requested: "red", break_glass_approved: "amber", break_glass_denied: "green",
  break_glass_auto_granted: "red", otp_denied_by_contact: "green", telegram_linked: "green", telegram_unlinked: "amber",
};

export default function ActivityTab({ onRead }: { onRead?: () => void }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [notes, setNotes] = useState<any[] | null>(null); const [unread, setUnread] = useState(0);
  const [audit, setAudit] = useState<any[]>([]); const [chain, setChain] = useState<any>(null); const [stats, setStats] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const load = useCallback(async () => {
    try {
      const [n, a, s] = await Promise.all([api("/notifications"), api("/audit?limit=60"), api("/audit/analytics")]);
      setNotes(n.notifications); setUnread(n.unread); setAudit(a.entries); setStats(s);
    } catch (e: any) { toast(e.message, "error"); }
  }, [toast]);
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const count = (a: string) => stats?.byAction?.find((x: any) => x.action === a)?.n ?? 0;
  const verify = async () => { setChecking(true); try { setChain(await api("/audit/verify")); } catch (e: any) { toast(e.message, "error"); } finally { setChecking(false); } };
  const markRead = async () => { await api("/notifications/read-all", { method: "POST", body: {} }); await load(); onRead?.(); toast(t("activity.markedRead"), "success"); };

  if (!notes) return <div className="stack"><div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 240 }} /></div>;
  return (
    <div className="stack">
      <div className="grid grid--4">
        <div className="card card--tight stat"><div className="stat__num">{count("scan")}</div><div className="stat__label">{t("activity.publicScans")}</div></div>
        <div className="card card--tight stat"><div className="stat__num">{count("tier2_granted")}</div><div className="stat__label">{t("activity.verifiedAccess")}</div></div>
        <div className="card card--tight stat"><div className="stat__num" style={{ color: count("break_glass") ? "var(--emergency-red)" : undefined }}>{count("break_glass")}</div><div className="stat__label">{t("activity.overrides")}</div></div>
        <div className="card card--tight stat"><div className="stat__num">{unread}</div><div className="stat__label">{t("activity.unreadAlerts")}</div></div>
      </div>

      <div className="split">
        <div className="card">
          <div className="card__title">{t("activity.alerts")}<span className="spacer" />{unread > 0 && <button className="btn btn--ghost btn--sm" onClick={markRead}>{t("activity.markAllRead")}</button>}</div>
          {notes.length === 0 ? <div className="empty"><span className="empty__icon">🔕</span>{t("activity.noAlerts")}</div> :
            notes.map((n) => (
              <div key={n.id} className={`alert-item alert-item--${n.severity} ${n.read ? "is-read" : ""}`}>
                <b>{n.title}</b><p>{n.body}</p><small title={fmtDate(n.created_at)}>{timeAgo(n.created_at, Date.now(), t)}</small>
              </div>))}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__title">{t("activity.auditIntegrity")}</div>
            <p className="text-sm mb-sm">{t("activity.auditDesc")}</p>
            <button className="btn btn--primary btn--sm" onClick={verify} disabled={checking}>{checking ? <span className="spinner" /> : t("activity.verifyIntegrity")}</button>
            {chain && (
              <div role="status" className={`card card--tight mt-md ${chain.valid ? "card--success" : "card--danger"}`}>
                {chain.valid ? <>✅ <b>{t("activity.integrityVerified")}</b><div className="text-xs text-muted">{t("activity.chainIntact", { count: chain.count })}</div></> : <>⛔ <b>{t("activity.tampering")}</b><div className="text-xs">{t("activity.chainBroken", { id: chain.brokenAtId })}</div></>}
              </div>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__title">{t("activity.accessHistory")}</div>
        {audit.length === 0 ? <div className="empty">{t("activity.nothingYet")}</div> : (
          <ul className="timeline">{audit.map((a) => {
            const color = EVENT_COLOR[a.action] ?? "";
            const label = t(`activity.ev.${a.action}`);
            const meta = [
              a.actor && a.actor !== "self" && a.actor !== "public" ? t("activity.by", { actor: a.actor }) : "",
              a.reason ? `"${a.reason}"` : "",
              a.geo ? `📍 ${a.geo}` : "",
              a.risk != null && a.risk > 0 ? t("activity.risk", { risk: a.risk }) : "",
            ].filter(Boolean).join(" · ");
            return (
              <li key={a.id}>
                <span className={`timeline__dot ${color ? `timeline__dot--${color}` : ""}`} />
                <div><div>{label}{a.tier ? <span className="badge" style={{ marginLeft: 6 }}>L{a.tier}</span> : null}</div>
                  <div className="text-xs text-muted">{meta}</div></div>
                <span className="timeline__time" title={fmtDate(a.created_at)}>{timeAgo(a.created_at, Date.now(), t)}</span>
              </li>);
          })}</ul>)}
      </div>
    </div>
  );
}
