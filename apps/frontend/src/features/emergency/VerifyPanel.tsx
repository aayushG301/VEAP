import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { OtpBoxes } from "../../components/OtpBoxes";

interface Granted { sessionToken: string; tier: number; expiresAt: number }

export default function VerifyPanel({ token, onGranted }: { token: string; onGranted: (g: Granted) => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(""); const [otp, setOtp] = useState<any>(null); const [code, setCode] = useState("");
  const [err, setErr] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false); const [cool, setCool] = useState(0);
  useEffect(() => { if (cool <= 0) return; const id = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(id); }, [cool]);

  const send = async () => {
    setErr(""); setBusy(true);
    try { setOtp(await api("/access/otp/request", { auth: false, body: { token, phone } })); setStep("code"); setCode(""); setCool(30); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async (c = code) => {
    if (c.length !== 6) return;
    setErr(""); setBad(false); setBusy(true);
    try { onGranted(await api("/access/otp/verify", { auth: false, body: { token, otpId: otp.otpId, code: c } })); }
    catch (e: any) {
      setBad(true); setCode("");
      if (e instanceof ApiError && e.code === "otp_wrong") setErr(`Incorrect code. ${e.extra.attemptsLeft} attempt${e.extra.attemptsLeft === 1 ? "" : "s"} left.`);
      else if (e instanceof ApiError && (e.code === "otp_locked" || e.code === "otp_invalid")) { setErr(e.message); setStep("phone"); setOtp(null); }
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h4 className="card__title">🔐 Verify your identity</h4>
      {step === "phone" ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <p className="text-sm mb-md">To protect the patient, a 6-digit code is sent to <b style={{ color: "var(--text-primary)" }}>their emergency contact</b> (privately, on Telegram or SMS). Enter your own number so this access is logged, then ask the contact for the code.</p>
          <div className="form-group"><label className="form-label" htmlFor="ph">Your phone number</label>
            <input id="ph" className="form-input" type="tel" required inputMode="tel" autoComplete="tel" placeholder="+91 90000 12345" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <button className="btn btn--warning btn--full" disabled={busy || phone.replace(/\D/g, "").length < 7}>{busy ? <span className="spinner" /> : "📨 Send code to the emergency contact"}</button>
        </form>
      ) : (
        <div>
          <p className="text-sm text-center">{otp.sentTo === "emergency_contact"
            ? <>Code sent to <b style={{ color: "var(--text-primary)" }}>{otp.contactName || "the patient's emergency contact"}</b> ({otp.maskedTarget}). Ask them to read it to you.</>
            : <>The patient has no emergency contact on file, so the code was sent to <b style={{ color: "var(--text-primary)" }}>your phone</b>.</>}</p>
          {otp.delivery === "telegram" && <p className="text-xs text-muted text-center mt-sm">🔒 The code was sent privately to their Telegram. Only ask for it if you are physically with the patient. They can also block this request.</p>}
          {otp.devOtp && (
            <div className="demo-banner mt-md"><span>🧪 <b>Demo mode:</b> SMS is simulated. The code is <b>{otp.devOtp}</b></span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setCode(otp.devOtp); verify(otp.devOtp); }}>Auto-fill</button></div>)}
          <OtpBoxes value={code} onChange={(v) => { setCode(v); setBad(false); }} error={bad} onComplete={(c) => verify(c)} disabled={busy} />
          {err && <p className="form-error text-center" role="alert">{err}</p>}
          <p className="text-xs text-muted text-center mb-md">The code is valid for 5 minutes.</p>
          <button className="btn btn--warning btn--full" disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? <span className="spinner" /> : "🔓 Verify code"}</button>
          <div className="row mt-md" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={cool > 0 || busy} onClick={send}>{cool > 0 ? `Resend in ${cool}s` : "Resend code"}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStep("phone"); setOtp(null); setErr(""); }}>Change number</button>
          </div>
        </div>
      )}
    </div>
  );
}
