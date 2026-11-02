import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homeFor, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { AuthShell, PasswordField } from "../components/AuthShell";

export default function Login() {
  const { login, loginMfa } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null); const [code, setCode] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const done = async () => { const me = await api("/auth/me"); nav(homeFor(me.user)); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (mfaToken) { await loginMfa(mfaToken, code); await done(); }
      else { const r = await login(email, password); if (r.mfaToken) setMfaToken(r.mfaToken); else await done(); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell
      title={mfaToken ? t("login.mfaTitle") : t("login.title")}
      subtitle={mfaToken ? t("login.mfaSubtitle") : t("login.subtitle")}
      footer={!mfaToken && <>{t("login.newToVeap")} <Link to="/register">{t("login.createProfile")}</Link></>}
    >
      <form onSubmit={submit} aria-label="login form">
        {!mfaToken ? (
          <>
            <div className="form-group"><label className="form-label" htmlFor="email">{t("login.email")}</label>
              <input id="email" className="form-input" type="email" required autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <PasswordField id="pw" label={t("login.password")} value={password} onChange={setPassword} autoComplete="current-password" />
          </>
        ) : (
          <div className="form-group"><label className="form-label" htmlFor="code">{t("login.authCode")}</label>
            <input id="code" className="form-input" inputMode="text" autoComplete="one-time-code" required autoFocus placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} /></div>
        )}
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn--primary btn--full mt-md" disabled={busy}>{busy ? <span className="spinner" /> : mfaToken ? t("login.verifyBtn") : t("login.submitBtn")}</button>
        {mfaToken && <button type="button" className="btn btn--ghost btn--full mt-sm" onClick={() => { setMfaToken(null); setCode(""); setErr(""); }}>{t("login.backBtn")}</button>}
      </form>
    </AuthShell>
  );
}
