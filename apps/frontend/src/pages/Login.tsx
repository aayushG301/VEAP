import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homeFor, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { AuthShell, PasswordField } from "../components/AuthShell";

export default function Login() {
  const { login, loginMfa } = useAuth();
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
    <AuthShell title={mfaToken ? "Two-factor verification" : "Welcome back"} subtitle={mfaToken ? "Enter the 6-digit code from your authenticator app, or a recovery code." : "Log in to manage your emergency profile."}
      footer={!mfaToken && <>New to VEAP? <Link to="/register">Create your profile</Link></>}>
      <form onSubmit={submit} aria-label="login form">
        {!mfaToken ? (
          <>
            <div className="form-group"><label className="form-label" htmlFor="email">Email</label>
              <input id="email" className="form-input" type="email" required autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <PasswordField id="pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          </>
        ) : (
          <div className="form-group"><label className="form-label" htmlFor="code">Authentication code</label>
            <input id="code" className="form-input" inputMode="text" autoComplete="one-time-code" required autoFocus placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} /></div>
        )}
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn--primary btn--full mt-md" disabled={busy}>{busy ? <span className="spinner" /> : mfaToken ? "🔓 Verify" : "Log in"}</button>
        {mfaToken && <button type="button" className="btn btn--ghost btn--full mt-sm" onClick={() => { setMfaToken(null); setCode(""); setErr(""); }}>← Back</button>}
      </form>
    </AuthShell>
  );
}
