import { TIER_META } from "../lib/util";
import { useI18n } from "../lib/i18n";

/** Segmented control: who may see this field? 1 = public, 2 = verified, 3 = restricted. */
export function VisibilityPicker({ label, value, onChange }: { label: string; value: number; onChange: (t: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="vis" role="group" aria-label={t("visibility.whoCanSee", { label })}>
      {[1, 2, 3].map((tier) => (
        <button type="button" key={tier} data-tier={tier} aria-pressed={value === tier} title={`${t(`tier.${tier}.short`)}: ${t(`tier.${tier}.who`)}`} onClick={() => onChange(tier)}>
          {TIER_META[tier].icon} {t(`tier.${tier}.short`)}
        </button>
      ))}
    </div>
  );
}
