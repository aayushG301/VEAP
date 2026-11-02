import { TIER_LABEL, TIER_META } from "../lib/util";
import { useI18n } from "../lib/i18n";

export function AccessPill({ tier }: { tier: 1 | 2 | 3 }) {
  const { t } = useI18n();
  return <div className={`access-level access-level--${TIER_META[tier].cls}`}><span className="access-dot" />{t(`tier.${tier}.title`) || TIER_LABEL[tier]}</div>;
}
