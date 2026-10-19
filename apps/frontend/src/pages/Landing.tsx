import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth, homeFor } from "../lib/auth";

const steps = [
  ["📱", "blue", "1. Create your profile", "Enter your medical data, emergency contacts and critical conditions."],
  ["📷", "green", "2. Generate your QR", "Get a unique, revocable QR code that links to your emergency profile."],
  ["🔒", "amber", "3. Multi-level access", "Critical info is instant. Sensitive data needs a code from your contact."],
  ["🤖", "red", "4. AI first-aid guide", "A smart assistant gives step-by-step instructions, aware of your allergies."],
] as const;
const levels = [
  ["public", "Level 1 · Public", "Anyone who scans", "Blood group, allergies, emergency instructions and a one-tap call to your contact."],
  ["verified", "Level 2 · Verified", "Code from your contact", "Conditions, medications and doctor, with automatic drug-allergy warnings. Expires in 5 minutes."],
  ["restricted", "Level 3 · Restricted", "Professional or override", "The full record. Needs a verified license or an emergency override with a written reason; you're alerted instantly."],
] as const;
const trust = [
  ["🔐", "OTP verified", "Sensitive data locked"], ["⏱️", "Auto-expire", "Sessions time out"], ["📊", "Scan logging", "Every access tracked"], ["🚫", "Rate limited", "Abuse prevention"],
  ["🧬", "Encrypted", "AES-256 per field"], ["🛡️", "2FA ready", "Authenticator app"], ["🧾", "Tamper-proof log", "Hash-chained audit"], ["🕵️", "Abuse detection", "ML auto-lock"],
];

export default function Landing() {
  const { user } = useAuth();
  const start = user ? homeFor(user) : "/register";
  return (
    <div className="container container--wide">
      <section className="hero" id="hero">
        <Logo size={92} className="hero__icon" />
        <h1 className="hero__title">Your Medical ID,<br /><span>Always Ready.</span></h1>
        <p className="hero__subtitle">One QR scan delivers critical health data to first responders, with privacy controls that protect you.</p>
        <div className="hero__actions">
          <Link to={start} className="btn btn--primary btn--lg" id="cta-setup">🛡️ {user ? "Open your dashboard" : "Set up your profile"}</Link>
          <a href="#how-it-works" className="btn btn--ghost btn--lg" id="cta-learn">How it works ↓</a>
        </div>
      </section>

      <section id="how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="grid grid--steps">
          {steps.map(([icon, color, title, desc], i) => (
            <div key={title} className="card card--hover animate-in" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="feature-card"><div className={`feature-card__icon icon--${color}`}>{icon}</div>
                <div><h4 className="feature-card__title">{title}</h4><p className="feature-card__desc">{desc}</p></div></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Three levels of access</h2>
        <div className="level-demo">
          {levels.map(([cls, name, who, what]) => (
            <div key={name} className="card card--tight">
              <div>
                <div className={`access-level access-level--${cls}`} style={{ marginBottom: ".5rem" }}><span className="access-dot" />{name}</div>
                <div className="text-sm" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{who}</div>
                <p className="text-sm">{what}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-center mt-md">You choose, field by field, which level can see each detail.</p>
      </section>

      <section>
        <h2 className="section-title">Built for safety</h2>
        <div className="card"><div className="trust">
          {trust.map(([i, t, s]) => <div key={t}><div className="trust__icon">{i}</div><div className="trust__title">{t}</div><div className="trust__sub">{s}</div></div>)}
        </div></div>
      </section>

      {!user && (
        <section className="mt-xl">
          <div className="card card--info text-center" style={{ padding: "var(--space-xl)" }}>
            <h3 style={{ marginBottom: ".4rem" }}>It takes two minutes. It could save a life.</h3>
            <p className="mb-md">Create your profile, print your QR, and carry it in your wallet or on your phone.</p>
            <Link to="/register" className="btn btn--primary btn--lg">Get started free</Link>
          </div>
        </section>
      )}
    </div>
  );
}
