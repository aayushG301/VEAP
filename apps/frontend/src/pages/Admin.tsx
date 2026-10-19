import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDate, timeAgo } from "../lib/util";
import { useToast } from "../components/Toast";

const STAT_LABEL: Record<string, [string, string]> = { users: ["👥", "Users"], activeTokens: ["📱", "Active QR codes"], lockedTokens: ["🔒", "Locked QR codes"], scans24h: ["📷", "Scans (24h)"], breakGlass: ["⚡", "Overrides used"], securityEvents: ["🚨", "Security events"] };

export default function Admin() {
  const { toast } = useToast();
  const [stats, setStats] = useState<any>(null); const [pending, setPending] = useState<any[]>([]); const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try { const [s, p, e] = await Promise.all([api("/admin/stats"), api("/admin/responders?status=pending"), api("/admin/security-events")]); setStats(s); setPending(p.responders); setEvents(e.events); }
    catch (x: any) { toast(x.message, "error"); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const decide = async (id: string, d: "approve" | "reject") => {
    try { await api(`/admin/responders/${id}/${d}`, { method: "POST", body: {} }); toast(d === "approve" ? "Responder approved" : "Responder rejected", "success"); load(); } catch (x: any) { toast(x.message, "error"); }
  };
  return (
    <div className="container container--wide" style={{ paddingTop: "var(--space-xl)" }}>
      <h2 className="page-title">Admin console</h2>
      <p className="page-sub">Verify responders and keep an eye on suspicious activity.</p>
      {loading && <div className="skeleton" style={{ height: 90 }} />}
      {stats && <div className="grid grid--3">{Object.entries(stats).map(([k, v]) => (
        <div className="card card--tight stat" key={k}><div style={{ fontSize: "1.4rem" }}>{STAT_LABEL[k]?.[0] ?? "•"}</div><div className="stat__num">{String(v)}</div><div className="stat__label">{STAT_LABEL[k]?.[1] ?? k}</div></div>))}</div>}

      <h3 className="section-title">Pending responder verifications</h3>
      {pending.length === 0 ? <div className="card"><div className="empty"><span className="empty__icon">✅</span>Nothing waiting for review.</div></div> : (
        <div className="grid grid--2">{pending.map((r) => (
          <div className="card" key={r.id}>
            <div className="card__title">🩺 {r.name}</div>
            <p className="text-sm">{r.email}</p>
            <p className="text-sm mt-sm">License <b style={{ color: "var(--text-primary)" }}>{r.license_no}</b> · {r.license_issuer}</p>
            <p className="text-xs text-muted">Applied {timeAgo(r.created_at)}</p>
            <div className="row mt-md"><button className="btn btn--success btn--sm" onClick={() => decide(r.id, "approve")}>Approve</button><button className="btn btn--ghost btn--sm" onClick={() => decide(r.id, "reject")}>Reject</button></div>
          </div>))}</div>)}

      <h3 className="section-title">Security events</h3>
      <div className="card">
        {events.length === 0 ? <div className="empty"><span className="empty__icon">🛡️</span>No security events yet.</div> : (
          <ul className="timeline">{events.map((e) => (
            <li key={e.id}><span className={`timeline__dot timeline__dot--${e.kind === "honeytoken_probe" ? "red" : e.kind === "misuse_report" ? "amber" : "blue"}`} />
              <div><b>{e.kind.replace(/_/g, " ")}</b><div className="text-xs text-muted">{e.ip} · {e.detail || "-"}</div></div><span className="timeline__time" title={fmtDate(e.ts)}>{timeAgo(e.ts)}</span></li>))}</ul>)}
      </div>
    </div>
  );
}
