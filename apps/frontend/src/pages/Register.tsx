import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useToast } from "../components/Toast";
import { AuthShell, PasswordField, StrengthMeter } from "../components/AuthShell";

export { strength } from "../components/AuthShell";

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await register(f);
      toast(t("register.successToast"), "success");
      nav("/dashboard");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={<>{t("register.alreadyHave")} <Link to="/login">{t("register.logIn")}</Link></>}
    >
      <form onSubmit={submit} aria-label="register form">
        <div className="form-group"><label className="form-label" htmlFor="name">{t("register.fullName")}</label>
          <input id="name" className="form-input" required autoComplete="name" placeholder="e.g. Aayush Kumar" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label" htmlFor="email">{t("register.email")}</label>
          <input id="email" className="form-input" type="email" required autoComplete="username" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <PasswordField id="pw" label={t("register.password")} value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" />
        <StrengthMeter password={f.password} />
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn--primary btn--full btn--lg mt-md" disabled={busy}>{busy ? <span className="spinner" /> : t("register.submitBtn")}</button>
        <p className="text-xs text-muted text-center mt-md">{t("register.privacy")}</p>
      </form>
    </AuthShell>
  );
}
