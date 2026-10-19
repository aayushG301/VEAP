import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { AuthShell, PasswordField, StrengthMeter } from "../components/AuthShell";

export { strength } from "../components/AuthShell";

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await register(f); toast("Account created. Let's set up your emergency profile.", "success"); nav("/dashboard"); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Create your emergency profile" subtitle="Free. Takes about two minutes." footer={<>Already registered? <Link to="/login">Log in</Link></>}>
      <form onSubmit={submit} aria-label="register form">
        <div className="form-group"><label className="form-label" htmlFor="name">Full name</label>
          <input id="name" className="form-input" required autoComplete="name" placeholder="e.g. Aayush Kumar" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-input" type="email" required autoComplete="username" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <PasswordField id="pw" label="Password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" />
        <StrengthMeter password={f.password} />
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn--primary btn--full btn--lg mt-md" disabled={busy}>{busy ? <span className="spinner" /> : "🛡️ Create account"}</button>
        <p className="text-xs text-muted text-center mt-md">Your medical data is encrypted. You decide who can see each detail.</p>
      </form>
    </AuthShell>
  );
}
