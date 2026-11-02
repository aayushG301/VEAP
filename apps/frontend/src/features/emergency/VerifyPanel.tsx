import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { OtpBoxes } from "../../components/OtpBoxes";
import { useI18n } from "../../lib/i18n";

interface Granted { sessionToken: string; tier: number; expiresAt: number }

export default function VerifyPanel({ token, onGranted }: { token: string; onGranted: (g: Granted) => void }) {
  const { t } = useI18n();
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
      if (e instanceof ApiError && e.code === "otp_wrong") setErr(t("verify.incorrectCode", { n: e.extra.attemptsLeft }));
      else if (e instanceof ApiError && (e.code === "otp_locked" || e.code === "otp_invalid")) { setErr(e.message); setStep("phone"); setOtp(null); }
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h4 className="card__title">{t("verify.title")}</h4>
      {step === "phone" ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <p className="text-sm mb-md">{t("verify.phoneDesc")}</p>
          <div className="form-group"><label className="form-label" htmlFor="ph">{t("verify.phoneLabel")}</label>
            <input id="ph" className="form-input" type="tel" required inputMode="tel" autoComplete="tel" placeholder="+91 90000 12345" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <button className="btn btn--warning btn--full" disabled={busy || phone.replace(/\D/g, "").length < 7}>{busy ? <span className="spinner" /> : t("verify.sendBtn")}</button>
        </form>
      ) : (
        <div>
          <p className="text-sm text-center">{otp.sentTo === "emergency_contact"
            ? otp.contactName
              ? t("verify.codeSentTo", { name: otp.contactName, target: otp.maskedTarget })
              : t("verify.codeSentToGeneric", { target: otp.maskedTarget })
            : t("verify.codeSentToOwn")}</p>
          {otp.delivery === "telegram" && <p className="text-xs text-muted text-center mt-sm">{t("verify.telegramNote")}</p>}
          {otp.devOtp && (
            <div className="demo-banner mt-md"><span>🧪 <b>{t("verify.demoSms", { code: otp.devOtp })}</b></span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setCode(otp.devOtp); verify(otp.devOtp); }}>{t("verify.autoFill")}</button></div>)}
          <OtpBoxes value={code} onChange={(v) => { setCode(v); setBad(false); }} error={bad} onComplete={(c) => verify(c)} disabled={busy} />
          {err && <p className="form-error text-center" role="alert">{err}</p>}
          <p className="text-xs text-muted text-center mb-md">{t("verify.valid5min")}</p>
          <button className="btn btn--warning btn--full" disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? <span className="spinner" /> : t("verify.verifyBtn")}</button>
          <div className="row mt-md" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={cool > 0 || busy} onClick={send}>{cool > 0 ? t("verify.resendIn", { s: cool }) : t("verify.resend")}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStep("phone"); setOtp(null); setErr(""); }}>{t("verify.changeNumber")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
