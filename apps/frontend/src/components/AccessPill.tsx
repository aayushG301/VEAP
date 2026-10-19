import { TIER_LABEL, TIER_META } from "../lib/util";

export function AccessPill({ tier }: { tier: 1 | 2 | 3 }) {
  return <div className={`access-level access-level--${TIER_META[tier].cls}`}><span className="access-dot" />{TIER_LABEL[tier]}</div>;
}
