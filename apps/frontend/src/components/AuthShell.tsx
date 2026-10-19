import { useState, type ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container" style={{ paddingTop: "var(--space-xl)" }}>
      <div className="card animate-in" style={{ padding: "var(--space-xl)" }}>
        <div className="text-center mb-lg">
          <Logo size={56} className="" />
          <h2 style={{ fontSize: "var(--font-2xl)", marginTop: ".8rem" }}>{title}</h2>
          {subtitle && <p className="text-sm mt-sm">{subtitle}</p>}
        </div>
        {children}
      </div>
      {footer && <p className="text-center text-sm mt-md">{footer}</p>}
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, autoComplete, hint, required = true }:
  { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string; required?: boolean }) {
  return (
    <PasswordInner id={id} label={label} value={value} onChange={onChange} autoComplete={autoComplete} hint={hint} required={required} />
  );
}
function PasswordInner({ id, label, value, onChange, autoComplete, hint, required }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} className="form-input" type={show ? "text" : "password"} required={required} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="input-wrap__btn" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
      </div>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

export function strength(pw: string): { score: number; label: string; checks: { ok: boolean; text: string }[] } {
  const checks = [
    { ok: pw.length >= 10, text: "10+ characters" },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), text: "Upper and lower case" },
    { ok: /[0-9]/.test(pw), text: "A number" },
  ];
  let s = checks.filter((c) => c.ok).length;
  if (pw.length >= 14) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][s], checks };
}

export function StrengthMeter({ password }: { password: string }) {
  const st = strength(password);
  const color = st.score < 3 ? "var(--emergency-red)" : st.score < 4 ? "var(--warning-amber)" : "var(--safe-green)";
  return (
    <div className="mb-md" aria-live="polite">
      <div className="meter"><div style={{ width: `${(st.score / 5) * 100}%`, background: color }} /></div>
      <div className="row mt-sm" style={{ gap: ".9rem" }}>
        {st.checks.map((c) => <span key={c.text} className={`text-xs ${c.ok ? "text-green" : "text-muted"}`}>{c.ok ? "✓" : "○"} {c.text}</span>)}
        {password && <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>{st.label}</span>}
      </div>
    </div>
  );
}
