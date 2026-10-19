import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { AuthShell, PasswordField, StrengthMeter } from "../components/AuthShell";

export default function ResponderRegister() {
  const { registerResponder } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", licenseNo: "", licenseIssuer: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await registerResponder(f); toast("Application submitted. An administrator will review your license.", "success"); nav("/responder"); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Responder & medical professional" subtitle="Verified professionals get Level 3 access without the emergency override."
      footer={<>Just need quick access in an emergency? You don't need an account: scan the QR code. <br />Already approved? <Link to="/login">Log in</Link></>}>
      <form onSubmit={submit} aria-label="responder form">
        <div className="form-group"><label className="form-label" htmlFor="n">Full name</label><input id="n" className="form-input" required value={f.name} onChange={set("name")} /></div>
        <div className="form-group"><label className="form-label" htmlFor="e">Email</label><input id="e" className="form-input" type="email" required value={f.email} onChange={set("email")} /></div>
        <PasswordField id="p" label="Password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" />
        <StrengthMeter password={f.password} />
        <div className="grid grid--2">
          <div className="form-group"><label className="form-label" htmlFor="l">License number</label><input id="l" className="form-input" required value={f.licenseNo} onChange={set("licenseNo")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="i">Issuing authority</label><input id="i" className="form-input" required placeholder="e.g. State Medical Council" value={f.licenseIssuer} onChange={set("licenseIssuer")} /></div>
        </div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn--primary btn--full mt-md" disabled={busy}>{busy ? <span className="spinner" /> : "Apply for verification"}</button>
      </form>
    </AuthShell>
  );
}
