import { TIER_LABEL, TIER_META } from "../lib/util";
import { useI18n } from "../lib/i18n";

/** Tier badge. `stale` marks an offline cached copy, which is neither live-verified nor proof the QR is still valid. */
export function AccessPill({ tier, stale }: { tier: 1 | 2 | 3; stale?: boolean }) {
  const { t } = useI18n();
  return <div className={`access-level access-level--${stale ? "public" : TIER_META[tier].cls}`}><span className="access-dot" />{stale ? t("emergency.offlineUnverified") : t(`tier.${tier}.title`) || TIER_LABEL[tier]}</div>;
}
