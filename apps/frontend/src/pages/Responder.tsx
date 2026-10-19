import { useAuth } from "../lib/auth";

export default function Responder() {
  const { user } = useAuth();
  const st = user?.responderStatus;
  const approved = st === "approved";
  return (
    <div className="container container--mid" style={{ paddingTop: "var(--space-xl)" }}>
      <h2 className="page-title">Responder account</h2>
      <p className="page-sub">Welcome, {user?.name}.</p>
      <div className={`card ${approved ? "card--success" : st === "rejected" ? "card--danger" : "card--warning"}`}>
        <div className="card__title">{approved ? "✅ Verified professional" : st === "rejected" ? "⛔ Application rejected" : "⏳ Awaiting verification"}</div>
        {approved ? (
          <p>Scan a patient's QR code. Because you're logged in, the emergency page offers <b>Verified professional access (Level 3)</b> without the emergency override. Every access is still logged and the patient is notified.</p>
        ) : st === "rejected" ? (
          <p>An administrator could not verify your license. Contact support if you believe this is a mistake.</p>
        ) : (
          <p>An administrator is reviewing your license. Until then you can still use the normal flow on any scan page: verify with the code sent to the patient's emergency contact, or use the emergency override.</p>
        )}
      </div>
      <div className="card mt-md">
        <div className="card__title">How access works for you</div>
        <ol className="stack text-sm" style={{ paddingLeft: "1.2rem", color: "var(--text-secondary)" }}>
          <li>Scan the patient's QR code with your phone camera.</li>
          <li>Level 1 (public) info appears instantly: blood group, allergies, contacts.</li>
          <li>Level 2 needs a code that is sent to the patient's emergency contact.</li>
          <li>Level 3 is available to approved professionals, or by emergency override with a written reason.</li>
        </ol>
      </div>
    </div>
  );
}
