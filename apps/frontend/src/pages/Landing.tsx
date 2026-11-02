import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth, homeFor } from "../lib/auth";
import { useI18n } from "../lib/i18n";

const trustBadges = [
  ["🔐", "OTP verified", "Sensitive data locked"], ["⏱️", "Auto-expire", "Sessions time out"],
  ["📊", "Scan logging", "Every access tracked"], ["🚫", "Rate limited", "Abuse prevention"],
  ["🧬", "Encrypted", "AES-256 per field"], ["🛡️", "2FA ready", "Authenticator app"],
  ["🧾", "Tamper-proof log", "Hash-chained audit"], ["🕵️", "Abuse detection", "ML auto-lock"],
];

export default function Landing() {
  const { user } = useAuth();
  const { t } = useI18n();
  const start = user ? homeFor(user) : "/register";

  const steps = [
    ["📱", "blue", t("landing.step1Title"), t("landing.step1Desc")],
    ["📷", "green", t("landing.step2Title"), t("landing.step2Desc")],
    ["🔒", "amber", t("landing.step3Title"), t("landing.step3Desc")],
    ["🤖", "red", t("landing.step4Title"), t("landing.step4Desc")],
  ] as const;

  const levels = [
    ["public", t("landing.level1Name"), t("landing.level1Who"), t("landing.level1What")],
    ["verified", t("landing.level2Name"), t("landing.level2Who"), t("landing.level2What")],
    ["restricted", t("landing.level3Name"), t("landing.level3Who"), t("landing.level3What")],
  ] as const;

  return (
    <div className="container container--wide">
      <section className="hero" id="hero">
        <Logo size={92} className="hero__icon" />
        <h1 className="hero__title">{t("landing.title").split(",")[0]},<br /><span>{t("landing.title").split(",")[1] ?? "Always Ready."}</span></h1>
        <p className="hero__subtitle">{t("landing.subtitle")}</p>
        <div className="hero__actions">
          <Link to={start} className="btn btn--primary btn--lg" id="cta-setup">🛡️ {user ? t("landing.openDashboard") : t("landing.setupProfile")}</Link>
          <a href="#how-it-works" className="btn btn--ghost btn--lg" id="cta-learn">{t("landing.howItWorksLink")}</a>
        </div>
      </section>

      <section id="how-it-works">
        <h2 className="section-title">{t("landing.howItWorks")}</h2>
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
        <h2 className="section-title">{t("landing.threeLevels")}</h2>
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
        <p className="text-sm text-center mt-md">{t("landing.fieldByField")}</p>
      </section>

      <section>
        <h2 className="section-title">{t("landing.builtForSafety")}</h2>
        <div className="card"><div className="trust">
          {trustBadges.map(([i, title, sub]) => <div key={title}><div className="trust__icon">{i}</div><div className="trust__title">{title}</div><div className="trust__sub">{sub}</div></div>)}
        </div></div>
      </section>

      {!user && (
        <section className="mt-xl">
          <div className="card card--info text-center" style={{ padding: "var(--space-xl)" }}>
            <h3 style={{ marginBottom: ".4rem" }}>{t("landing.ctaTitle")}</h3>
            <p className="mb-md">{t("landing.ctaDesc")}</p>
            <Link to="/register" className="btn btn--primary btn--lg">{t("landing.ctaBtn")}</Link>
          </div>
        </section>
      )}
    </div>
  );
}
