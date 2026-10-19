import { TIER_META } from "../lib/util";

/** Segmented control: who may see this field? 1 = public, 2 = verified, 3 = restricted. */
export function VisibilityPicker({ label, value, onChange }: { label: string; value: number; onChange: (t: number) => void }) {
  return (
    <div className="vis" role="group" aria-label={`Who can see ${label}`}>
      {[1, 2, 3].map((t) => (
        <button type="button" key={t} data-tier={t} aria-pressed={value === t} title={`${TIER_META[t].short}: ${TIER_META[t].who}`} onClick={() => onChange(t)}>
          {TIER_META[t].icon} {TIER_META[t].short}
        </button>
      ))}
    </div>
  );
}
