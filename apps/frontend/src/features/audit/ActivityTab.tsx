import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate, timeAgo } from "../../lib/util";
import { useToast } from "../../components/Toast";

const EVENT: Record<string, [string, string]> = {
  scan: ["Your public profile was scanned", "blue"], otp_requested: ["A verification code was requested", "amber"], otp_failed: ["A wrong code was entered", "red"],
  tier2_granted: ["Verified access granted (Level 2)", "amber"], break_glass: ["Emergency override used (Level 3)", "red"], tier3_credential: ["Verified professional opened your record", "amber"],
  record_view: ["Medical record viewed", "blue"], session_extended: ["Access session extended", "amber"], session_ended: ["Access session ended", "green"],
  token_created: ["QR code created", "green"], token_revoked: ["QR code revoked", "red"], token_locked: ["QR code auto-locked", "red"], token_unlocked: ["QR code unlocked", "green"],
  profile_updated: ["Profile updated", "green"], visibility_updated: ["Visibility settings changed", "green"], login: ["Signed in", ""], login_failed: ["Failed sign-in attempt", "red"], account_locked: ["Account temporarily locked", "red"],
  mfa_enabled: ["Two-factor enabled", "green"], mfa_disabled: ["Two-factor disabled", "amber"], session_revoked: ["A device was signed out", "amber"], refresh_reuse_detected: ["Stolen session blocked", "red"],
  assistant_used: ["AI assistant used", "blue"], misuse_reported: ["Someone reported misuse", "amber"], otp_delivery_failed: ["Code SMS could not be sent", "red"], recovery_code_used: ["Recovery code used", "amber"],
  break_glass_requested: ["Emergency override requested (Level 3)", "red"], break_glass_approved: ["Override approved by your contact", "amber"], break_glass_denied: ["Override denied by your contact", "green"],
  break_glass_auto_granted: ["Override auto-granted (no reply from contact)", "red"], otp_denied_by_contact: ["Your contact blocked a verification code", "green"], telegram_linked: ["Emergency contact connected on Telegram", "green"], telegram_unlinked: ["Telegram contact removed", "amber"],
};

export default function ActivityTab({ onRead }: { onRead?: () => void }) {
  const { toast } = useToast();
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
  const markRead = async () => { await api("/notifications/read-all", { method: "POST", body: {} }); await load(); onRead?.(); toast("All alerts marked as read", "success"); };

  if (!notes) return <div className="stack"><div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 240 }} /></div>;
  return (
    <div className="stack">
      <div className="grid grid--4">
        <div className="card card--tight stat"><div className="stat__num">{count("scan")}</div><div className="stat__label">📷 Public scans</div></div>
        <div className="card card--tight stat"><div className="stat__num">{count("tier2_granted")}</div><div className="stat__label">🔐 Verified access</div></div>
        <div className="card card--tight stat"><div className="stat__num" style={{ color: count("break_glass") ? "var(--emergency-red)" : undefined }}>{count("break_glass")}</div><div className="stat__label">⚡ Overrides</div></div>
        <div className="card card--tight stat"><div className="stat__num">{unread}</div><div className="stat__label">🔔 Unread alerts</div></div>
      </div>

      <div className="split">
        <div className="card">
          <div className="card__title">🔔 Alerts<span className="spacer" />{unread > 0 && <button className="btn btn--ghost btn--sm" onClick={markRead}>Mark all read</button>}</div>
          {notes.length === 0 ? <div className="empty"><span className="empty__icon">🔕</span>No alerts yet. You'll be told whenever your profile is accessed.</div> :
            notes.map((n) => (
              <div key={n.id} className={`alert-item alert-item--${n.severity} ${n.read ? "is-read" : ""}`}>
                <b>{n.title}</b><p>{n.body}</p><small title={fmtDate(n.created_at)}>{timeAgo(n.created_at)}</small>
              </div>))}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__title">🧾 Audit log integrity</div>
            <p className="text-sm mb-sm">Every access is chained to the one before it. If anyone edits or deletes history, the chain breaks.</p>
            <button className="btn btn--primary btn--sm" onClick={verify} disabled={checking}>{checking ? <span className="spinner" /> : "Verify log integrity"}</button>
            {chain && (
              <div role="status" className={`card card--tight mt-md ${chain.valid ? "card--success" : "card--danger"}`}>
                {chain.valid ? <>✅ <b>Integrity verified</b><div className="text-xs text-muted">{chain.count} entries, chain intact.</div></> : <>⛔ <b>Tampering detected</b><div className="text-xs">Chain breaks at entry #{chain.brokenAtId}.</div></>}
              </div>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__title">🕘 Access history</div>
        {audit.length === 0 ? <div className="empty">Nothing yet.</div> : (
          <ul className="timeline">{audit.map((a) => {
            const [label, color] = EVENT[a.action] || [a.action.replace(/_/g, " "), ""];
            return (
              <li key={a.id}>
                <span className={`timeline__dot ${color ? `timeline__dot--${color}` : ""}`} />
                <div><div>{label}{a.tier ? <span className="badge" style={{ marginLeft: 6 }}>L{a.tier}</span> : null}</div>
                  <div className="text-xs text-muted">{[a.actor && a.actor !== "self" && a.actor !== "public" ? `by ${a.actor}` : "", a.reason ? `"${a.reason}"` : "", a.geo ? `📍 ${a.geo}` : "", a.risk != null && a.risk > 0 ? `risk ${a.risk}` : ""].filter(Boolean).join(" · ")}</div></div>
                <span className="timeline__time" title={fmtDate(a.created_at)}>{timeAgo(a.created_at)}</span>
              </li>);
          })}</ul>)}
      </div>
    </div>
  );
}
