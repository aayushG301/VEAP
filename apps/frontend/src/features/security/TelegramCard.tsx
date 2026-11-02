import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { useI18n } from "../../lib/i18n";

interface Link {
  id: string;
  chatName: string;
  linkedAt: number;
}

/** Connect the emergency contact's Telegram: they receive the Level 2 codes and Level 3 override requests (with Block / Deny buttons). */
export default function TelegramCard() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [st, setSt] = useState<{
    configured: boolean;
    active: boolean;
    botUsername: string | null;
    links: Link[];
  } | null>(null);
  const [link, setLink] = useState<{
    url: string;
    qrDataUrl: string;
    expiresAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (quiet = false) =>
    api("/telegram")
      .then(setSt)
      .catch((e) => {
        if (!quiet) toast(e.message, "error");
      });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!link) return;
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
  }, [link]);
  useEffect(() => {
    if (link && st && st.links.length > 0) setLink(null);
  }, [st?.links.length]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  if (!st) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <div className="card">
      <div className="card__title">
        {t("telegram.title")}
        <span className="spacer" />
        <span
          className={`badge ${st.links.length ? "badge--safe" : "badge--warn"}`}
        >
          {st.links.length ? t("telegram.connected") : t("telegram.notConnected")}
        </span>
      </div>
      <p className="text-sm mb-md">{t("telegram.desc")}</p>
      {!st.configured && (
        <div className="card card--warning card--tight text-sm mb-md">
          {t("telegram.notConfigured")}
        </div>
      )}
      {st.configured && !st.active && (
        <div className="card card--warning card--tight text-sm mb-md">
          {t("telegram.notActive")}
        </div>
      )}
      {st.links.map((l) => (
        <div key={l.id} className="contact-card">
          <div>
            <h4>✅ {l.chatName}</h4>
            <p>{t("telegram.connectedOn", { date: new Date(l.linkedAt).toLocaleDateString() })}</p>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/telegram/links/${l.id}`, { method: "DELETE" });
                await load();
                toast(t("telegram.removed"), "info");
              })
            }
          >
            {t("common.remove")}
          </button>
        </div>
      ))}
      {link && (
        <div className="text-center mb-md">
          <p className="text-sm mb-sm">
            {t("telegram.linkHint")}
          </p>
          <div className="qr-display__code" style={{ padding: 10 }}>
            <img
              src={link.qrDataUrl}
              alt={t("telegram.qrAlt")}
              width={180}
            />
          </div>
          <div className="row mt-sm" style={{ justifyContent: "center" }}>
            <a
              className="btn btn--primary btn--sm"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              {t("telegram.open")}
            </a>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(link.url)
                  .then(() => toast(t("common.copied"), "success"))
              }
            >
              {t("telegram.copyLink")}
            </button>
          </div>
          <p className="text-xs text-muted mt-sm">
            {t("telegram.waiting")}
          </p>
        </div>
      )}
      <div className="row">
        {st.configured && (
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() =>
              run(async () =>
                setLink(
                  await api("/telegram/link", { method: "POST", body: {} }),
                ),
              )
            }
          >
            {st.links.length
              ? t("telegram.addAnother")
              : t("telegram.connect")}
          </button>
        )}
        {st.links.length > 0 && (
          <button
            className="btn btn--ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/telegram/test", { method: "POST", body: {} });
                toast(t("telegram.testSent"), "success");
              })
            }
          >
            {t("telegram.sendTest")}
          </button>
        )}
      </div>
    </div>
  );
}
