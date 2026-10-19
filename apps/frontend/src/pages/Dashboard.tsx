import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ProfileTab from "../features/profile/ProfileTab";
import QrTab from "../features/qr/QrTab";
import SecurityTab from "../features/security/SecurityTab";
import ActivityTab from "../features/audit/ActivityTab";

const TABS = [["profile", "👤", "Profile"], ["qr", "📱", "My QR"], ["activity", "🔔", "Activity"], ["security", "🔐", "Security"]] as const;
type TabKey = (typeof TABS)[number][0];

export default function Dashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as TabKey) || "profile";
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t[0] === initial) ? initial : "profile");
  const [unread, setUnread] = useState(0);
  const [hasQr, setHasQr] = useState<boolean | null>(null);

  const refreshBadge = useCallback(() => { api("/notifications").then((r) => setUnread(r.unread)).catch(() => undefined); }, []);
  useEffect(() => { refreshBadge(); const id = setInterval(refreshBadge, 20000); return () => clearInterval(id); }, [refreshBadge]);
  useEffect(() => { api("/qr").then((r) => setHasQr(r.tokens.some((t: any) => t.status !== "revoked"))).catch(() => setHasQr(null)); }, [tab]);
  const go = (t: TabKey) => { setTab(t); setParams(t === "profile" ? {} : { tab: t }, { replace: true }); };

  return (
    <div className="container container--wide has-bottom-nav" style={{ paddingTop: "var(--space-lg)" }}>
      <h2 className="page-title">Hi, {user?.name.split(" ")[0]} 👋</h2>
      <p className="page-sub">Keep your emergency profile up to date. It's what responders will see.</p>
      {hasQr === false && tab !== "qr" && (
        <div className="card card--info card--tight mb-md row row--between">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>📱 You don't have a QR code yet. Generate one so responders can find your profile.</span>
          <button className="btn btn--primary btn--sm" onClick={() => go("qr")}>Create QR</button>
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map(([k, icon, label]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} className="tab" onClick={() => go(k)}>
            <span className="tab__icon" aria-hidden>{icon}</span>{label}
            {k === "activity" && unread > 0 && <span className="tab__dot" aria-label={`${unread} unread alerts`}>{unread > 9 ? "9+" : unread}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="animate-in" key={tab}>
        {tab === "profile" && <ProfileTab onSaved={() => setHasQr((v) => v)} />}
        {tab === "qr" && <QrTab />}
        {tab === "activity" && <ActivityTab onRead={refreshBadge} />}
        {tab === "security" && <SecurityTab />}
      </div>
    </div>
  );
}
