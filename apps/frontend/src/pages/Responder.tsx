import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export default function Responder() {
  const { user } = useAuth();
  const { t } = useI18n();
  const st = user?.responderStatus;
  const approved = st === "approved";
  return (
    <div className="container container--mid" style={{ paddingTop: "var(--space-xl)" }}>
      <h2 className="page-title">{t("responder.title")}</h2>
      <p className="page-sub">{t("responder.welcome", { name: user?.name ?? "" })}</p>
      <div className={`card ${approved ? "card--success" : st === "rejected" ? "card--danger" : "card--warning"}`}>
        <div className="card__title">{approved ? t("responder.approved") : st === "rejected" ? t("responder.rejected") : t("responder.pending")}</div>
        {approved ? (
          <p>{t("responder.approvedDesc")}</p>
        ) : st === "rejected" ? (
          <p>{t("responder.rejectedDesc")}</p>
        ) : (
          <p>{t("responder.pendingDesc")}</p>
        )}
      </div>
      <div className="card mt-md">
        <div className="card__title">{t("responder.howTitle")}</div>
        <ol className="stack text-sm" style={{ paddingLeft: "1.2rem", color: "var(--text-secondary)" }}>
          <li>{t("responder.step1")}</li>
          <li>{t("responder.step2")}</li>
          <li>{t("responder.step3")}</li>
          <li>{t("responder.step4")}</li>
        </ol>
      </div>
    </div>
  );
}
